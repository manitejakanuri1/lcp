# How a saree in the shop becomes a listing on the website

Decided 20 October 2026 with the owner. This is the rule A3 implements; it is written down
because most of it is a judgement about the shop, not about the code, and the next person to
touch the publishing path needs to know why it refuses some sarees.

## Which sarees go up

A saree is publishable only when it has **a main photo and at least one colour that has its
own photo**. Both halves matter: a listing with no picture is skipped by shoppers, and a
colour button with nothing behind it looks broken.

Sarees with no colour rows are not listed at all, even when they have a main photo. The
owner's reasoning: a saree sold as a plain quantity with no colour to choose is a counter
sale, not a web sale.

Today that admits four of nineteen:

| SKU | Saree | Colours with a photo |
|---|---|---|
| S-F1AA0035 | SUNFLOWER | 5 |
| S-39444104 | SUNAYANA SILK | 5 |
| S-AD458DD0 | SHANAYA | 5 |
| S-01751E40 | MYSORE CREPE elephant border | 1 |

The other fifteen are held back by a missing photo (eleven), missing colours (three), or
both. They become publishable the moment the photos are taken - no code change needed.

## What becomes what

| Shop | Website |
|---|---|
| `pos.products` row | `store.products` - one listing |
| `pos.product_colors` row | `store.product_variants` - one colour the shopper can pick |
| the saree's own colour (`color` + `main_color_pieces`) | another variant, linked with `color_id` NULL |
| `saree_name` | product name |
| `selling_price_a` | price (the MRP shown struck through) |
| `selling_price_b` | discount price |
| `image_url` | the listing's first image |
| each colour's `image_url` | that colour's image |
| pieces | stock, counted live through `store.variant_stock` (see `sql/a1_stock_from_pieces.sql`) |

The sku is not rebuilt for the website. It is printed on the sticker on the saree and is what
the counter scanner reads, so the web variant carries the same one.

## What the shop does not have

**Fabric.** Eighteen of nineteen sarees say "Not specified". The website shows fabric as a
filter, and a filter where everything sits in one bucket is worse than no filter, so the
fabric facet stays hidden until the materials are really filled in. Turning it back on is a
one-line change in the storefront, not a schema change.

**Category.** `saree_type` is blank on eighteen of nineteen, so nothing can be derived from
it. The owner picks the shelf by hand when publishing: the Website screen gains a dropdown of
the eight categories the site already has (New Arrivals, Best Sellers, Bridal, Kanjivaram,
Banarasi, Silk Sarees, Trend of the Day, Seasonal Special) and the chosen one is written to
`store.product_categories` as the primary category.

**Description and care.** The website has fields for both and the shop has neither. They are
typed on the Website screen at publish time. A listing with an empty description is allowed -
it reads thin, but it is not broken.

## One number worth watching

A saree's `quantity` and the sum of its colours' pieces are not always the same. MYSORE CREPE
elephant border holds 32 in stock but only 4 of them are described by a colour, so the website
will offer 4. That is the honest answer - the other 28 have no colour anyone could order - but
it means the web shelf can read lower than the shop shelf, and that is expected rather than a
counting fault.
