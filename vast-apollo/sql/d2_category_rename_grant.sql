-- The POS can now rename a shelf, so its database user needs to be able to write the name.
-- SELECT it already had, from reading the shelves for the Website screen.
-- Re-runnable.

GRANT UPDATE ON store.categories TO pos_api;
