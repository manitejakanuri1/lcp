-- =====================================================================================
-- INVENTORY ALLOCATION  (shared web + shop stock)
-- =====================================================================================
-- Lifecycle of one physical saree sold online:
--   reserve  -> hold the piece while the order awaits payment (no change to pos.products)
--   commit   -> payment confirmed: flip pos.products.status to 'sold' (what the POS sees)
--   release  -> order cancelled / payment failed / hold expired: piece is sellable again
--   restock  -> return received: status back to 'available'
--
-- CONCURRENCY NOTE: reserve_inventory can, under a rare interleaving, pick a piece another transaction
-- has just reserved; the PRIMARY KEY on inventory_reservations(inventory_product_id) then rejects the second
-- insert with a unique violation (23505). It can never double-hold a piece, but the caller must catch 23505
-- and retry once.
--
-- INTEGRATION NOTE: commit/restock write pos.products.status. pos.create_bill() (01a) already refuses a piece
-- that has an unexpired row in store.inventory_reservations, so a held web order blocks a counter sale. Any
-- other writer to pos.products must do the same.

-- Reserve p_qty pieces of a variant for an order. Returns the reserved inventory ids.
-- Raises 'INSUFFICIENT_STOCK' if fewer than p_qty are free. SKIP LOCKED means two shoppers
-- racing for the last piece cannot both get it.
CREATE OR REPLACE FUNCTION store.reserve_inventory(
  p_variant UUID, p_qty INT, p_order UUID, p_ttl INTERVAL DEFAULT INTERVAL '15 minutes'
) RETURNS SETOF UUID LANGUAGE plpgsql AS $$
DECLARE
  picked UUID[];
BEGIN
  -- Drop expired holds first so their pieces become eligible again.
  DELETE FROM store.inventory_reservations WHERE expires_at <= NOW();

  SELECT ARRAY(
    SELECT p.id
    FROM store.variant_inventory_items vii
    JOIN pos.products p ON p.id = vii.inventory_product_id
    WHERE vii.variant_id = p_variant
      AND p.status = 'available'
      AND NOT EXISTS (SELECT 1 FROM store.inventory_reservations r WHERE r.inventory_product_id = p.id)
    ORDER BY p.created_at
    LIMIT p_qty
    FOR UPDATE OF p SKIP LOCKED
  ) INTO picked;

  IF COALESCE(array_length(picked, 1), 0) < p_qty THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO store.inventory_reservations(inventory_product_id, order_id, expires_at)
  SELECT x, p_order, NOW() + p_ttl FROM unnest(picked) x;

  RETURN QUERY SELECT unnest(picked);
END;
$$;

-- Payment confirmed: mark pieces sold, drop the holds, remember which piece went on which line.
-- All-or-nothing: if fewer pieces are committed than the order contains (the hold expired and was purged,
-- or the shop sold the piece meanwhile) it RAISES 'RESERVATION_LOST', which rolls the whole commit back.
-- The payment-webhook handler must then refund / flag the order instead of marking it paid.
CREATE OR REPLACE FUNCTION store.commit_order_inventory(p_order UUID)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  n INT;
  expected INT;
BEGIN
  SELECT COALESCE(SUM(quantity), 0) INTO expected FROM store.order_items WHERE order_id = p_order;
  UPDATE pos.products
     SET status = 'sold', updated_at = NOW()
   WHERE id IN (SELECT inventory_product_id FROM store.inventory_reservations WHERE order_id = p_order)
     AND status = 'available';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n < expected THEN
    RAISE EXCEPTION 'RESERVATION_LOST' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM store.inventory_reservations WHERE order_id = p_order;
  RETURN n;
END;
$$;

-- Payment failed / order cancelled before commit.
CREATE OR REPLACE FUNCTION store.release_order_inventory(p_order UUID)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  n INT;
BEGIN
  DELETE FROM store.inventory_reservations WHERE order_id = p_order;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Cancelled after commit, or return received: put the exact pieces back on the shelf.
CREATE OR REPLACE FUNCTION store.restock_order_inventory(p_order UUID)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  n INT;
BEGIN
  UPDATE pos.products
     SET status = 'available', updated_at = NOW()
   WHERE id IN (SELECT inventory_product_id FROM store.order_items
                WHERE order_id = p_order AND inventory_product_id IS NOT NULL)
     AND status = 'sold';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
