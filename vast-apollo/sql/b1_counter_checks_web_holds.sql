-- =====================================================================================
-- B1  The counter can see what the website is holding
-- =====================================================================================
-- A web shopper part-way through paying holds real pieces in store.variant_reservations.
-- The till could not read that table, so it would happily sell the same pieces across the
-- counter and leave the shop owing a saree it had already handed over.
--
-- DELETE is granted as well as SELECT because the till sweeps holds that have run out
-- before it counts them: a basket someone walked away from must not keep a saree off the
-- shelf for ever, and nothing else in the shop runs often enough to do the sweeping.
-- Re-runnable.

BEGIN;

GRANT SELECT, DELETE ON store.variant_reservations TO pos_api;

COMMIT;
