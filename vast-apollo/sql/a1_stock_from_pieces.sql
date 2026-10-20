-- =====================================================================================
-- A1  Web stock counted from the shop's piece counts
-- =====================================================================================
-- The storefront was written against a shop where one row is one physical saree, so it
-- worked out web stock by counting rows in pos.products. This shop does not work that way:
-- one pos.products row is a style with a quantity, and each pos.product_colors row carries
-- its own piece count. Counting rows against it answers nought for every colour, so every
-- saree would list as sold out the moment it was published.
--
-- Nothing in pos.* is touched. What changes is how store.variant_stock arrives at its
-- number, and what a hold on stock looks like while an order is unpaid.
--
-- Re-runnable: every statement is CREATE IF NOT EXISTS or CREATE OR REPLACE.

BEGIN;

-- ---- what a web colour is made of ----------------------------------------------------
-- One web variant is one colour in the shop. A saree's main photo carries a colour of its
-- own that has no product_colors row - its count lives in pos.products.main_color_pieces -
-- so color_id is nullable and NULL means "the main colour of this saree".
CREATE TABLE IF NOT EXISTS store.variant_stock_source (
  variant_id UUID PRIMARY KEY REFERENCES store.product_variants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES pos.products(id) ON DELETE RESTRICT,
  color_id   UUID REFERENCES pos.product_colors(id) ON DELETE CASCADE,
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- A colour sells through one listing only, or the same pieces would be sold twice over.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vss_color ON store.variant_stock_source(color_id) WHERE color_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vss_main  ON store.variant_stock_source(product_id) WHERE color_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_vss_product ON store.variant_stock_source(product_id);

-- ---- a hold while an order is unpaid -------------------------------------------------
-- The old holds table named one physical piece. A count cannot say "this piece"; it says
-- "two of them", so a hold is a quantity against a variant and several can stack up.
CREATE TABLE IF NOT EXISTS store.variant_reservations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES store.product_variants(id) ON DELETE CASCADE,
  order_id   UUID NOT NULL,
  qty        INT  NOT NULL CHECK (qty > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, variant_id)
);
CREATE INDEX IF NOT EXISTS idx_vres_variant ON store.variant_reservations(variant_id);
CREATE INDEX IF NOT EXISTS idx_vres_expiry  ON store.variant_reservations(expires_at);

-- ---- what the shelf says -------------------------------------------------------------
-- Pieces in the shop, less whatever unpaid web orders are holding. Expired holds do not
-- count: they are swept on the next reserve, and a shopper should not be blocked by one
-- that has already run out.
CREATE OR REPLACE VIEW store.variant_stock AS
SELECT v.id AS variant_id,
       v.product_id,
       GREATEST(0, COALESCE(src.pieces, 0) - COALESCE(held.qty, 0))::INT AS stock
FROM store.product_variants v
LEFT JOIN LATERAL (
    SELECT CASE
             WHEN s.color_id IS NOT NULL THEN COALESCE(c.pieces, 0)
             ELSE COALESCE(p.main_color_pieces, 0)
           END AS pieces
    FROM store.variant_stock_source s
    JOIN pos.products p ON p.id = s.product_id
    LEFT JOIN pos.product_colors c ON c.id = s.color_id
    -- A saree marked sold at the counter is off the web shelf whatever its counts say.
    WHERE s.variant_id = v.id AND p.status = 'available'
) src ON TRUE
LEFT JOIN LATERAL (
    SELECT SUM(r.qty)::INT AS qty
    FROM store.variant_reservations r
    WHERE r.variant_id = v.id AND r.expires_at > NOW()
) held ON TRUE;

-- ---- the four stock actions ----------------------------------------------------------
-- Two of these change shape: reserve_inventory used to answer with a list of piece ids and
-- now answers with a quantity, and a restock has to be told which colour came back. Postgres
-- will not change a function's answer or its arguments in place, so those two are dropped by
-- their exact old shape first. Nothing calls them - checkout is not built - so no caller
-- breaks, and the old text is in git if it is ever wanted back.
DROP FUNCTION IF EXISTS store.reserve_inventory(UUID, INT, UUID, INTERVAL);
DROP FUNCTION IF EXISTS store.restock_order_inventory(UUID);

-- Same names and the same job as before, counting pieces instead of rows. They return the
-- number of pieces acted on rather than a list of piece ids, because with counts there is
-- no such thing as "which piece".

-- Hold p_qty of a variant for an order. Raises INSUFFICIENT_STOCK if the shelf cannot cover
-- it. The row lock on the saree is what stops two shoppers both getting the last piece.
CREATE OR REPLACE FUNCTION store.reserve_inventory(
  p_variant UUID, p_qty INT, p_order UUID, p_ttl INTERVAL DEFAULT INTERVAL '15 minutes'
) RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  free INT;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM store.variant_reservations WHERE expires_at <= NOW();

  -- Lock the saree first: every hold on any of its colours is settled one at a time, so two
  -- shoppers cannot each read "1 left" and both be given it.
  PERFORM 1 FROM pos.products p
    JOIN store.variant_stock_source s ON s.product_id = p.id
   WHERE s.variant_id = p_variant
     FOR UPDATE OF p;

  SELECT stock INTO free FROM store.variant_stock WHERE variant_id = p_variant;
  IF COALESCE(free, 0) < p_qty THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO store.variant_reservations(variant_id, order_id, qty, expires_at)
  VALUES (p_variant, p_order, p_qty, NOW() + p_ttl)
  ON CONFLICT (order_id, variant_id)
  DO UPDATE SET qty = EXCLUDED.qty, expires_at = EXCLUDED.expires_at;

  RETURN p_qty;
END;
$$;

-- Payment confirmed: take the pieces off the shop's counts for good and drop the holds.
-- All or nothing - if a hold has lapsed and the shop has since sold the pieces, the whole
-- commit is rolled back and the caller must refund rather than mark the order paid.
CREATE OR REPLACE FUNCTION store.commit_order_inventory(p_order UUID)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  moved INT := 0;
  line  RECORD;
BEGIN
  FOR line IN
    SELECT r.variant_id, r.qty, s.product_id, s.color_id
      FROM store.variant_reservations r
      JOIN store.variant_stock_source s ON s.variant_id = r.variant_id
     WHERE r.order_id = p_order
     ORDER BY s.product_id
     FOR UPDATE OF r
  LOOP
    IF line.color_id IS NOT NULL THEN
      UPDATE pos.product_colors
         SET pieces = pieces - line.qty,
             status = CASE WHEN pieces - line.qty <= 0 THEN 'sold' ELSE 'available' END,
             updated_at = NOW()
       WHERE id = line.color_id AND pieces >= line.qty;
    ELSE
      UPDATE pos.products
         SET main_color_pieces = main_color_pieces - line.qty,
             updated_at = NOW()
       WHERE id = line.product_id AND main_color_pieces >= line.qty;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RESERVATION_LOST' USING ERRCODE = 'P0001';
    END IF;

    -- The saree's own count is the shop's running total across its colours.
    UPDATE pos.products
       SET quantity = GREATEST(0, quantity - line.qty),
           status = CASE WHEN GREATEST(0, quantity - line.qty) <= 0 THEN 'sold' ELSE status END,
           updated_at = NOW()
     WHERE id = line.product_id;

    moved := moved + line.qty;
  END LOOP;

  DELETE FROM store.variant_reservations WHERE order_id = p_order;
  RETURN moved;
END;
$$;

-- Order cancelled, payment failed, or the hold ran out: the pieces are sellable again.
CREATE OR REPLACE FUNCTION store.release_order_inventory(p_order UUID)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  freed INT;
BEGIN
  DELETE FROM store.variant_reservations WHERE order_id = p_order;
  GET DIAGNOSTICS freed = ROW_COUNT;
  RETURN freed;
END;
$$;

-- A return came back through the door: put the pieces back on the shelf.
CREATE OR REPLACE FUNCTION store.restock_order_inventory(p_order UUID, p_variant UUID, p_qty INT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  src RECORD;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = 'P0001';
  END IF;

  SELECT product_id, color_id INTO src
    FROM store.variant_stock_source WHERE variant_id = p_variant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VARIANT_NOT_LINKED' USING ERRCODE = 'P0001';
  END IF;

  IF src.color_id IS NOT NULL THEN
    UPDATE pos.product_colors
       SET pieces = pieces + p_qty, status = 'available', updated_at = NOW()
     WHERE id = src.color_id;
  ELSE
    UPDATE pos.products
       SET main_color_pieces = main_color_pieces + p_qty, updated_at = NOW()
     WHERE id = src.product_id;
  END IF;

  UPDATE pos.products
     SET quantity = quantity + p_qty, status = 'available', updated_at = NOW()
   WHERE id = src.product_id;

  RETURN p_qty;
END;
$$;

COMMIT;

-- store.variant_inventory_items and store.inventory_reservations are left in place and
-- empty. They belong to the one-row-per-piece design and nothing reads them any more;
-- dropping them is a separate decision, not part of making the shelf count correctly.
