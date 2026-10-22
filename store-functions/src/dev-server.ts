import express from 'express';

import { navGet } from './functions/nav/nav-get';
import { cmsHomepageGet } from './functions/cms/cms-homepage-get';
import { cmsPolicyGet } from './functions/cms/cms-policy-get';
import { catalogProductSummariesGet } from './functions/catalog/catalog-product-summaries-get';
import { catalogCategoryGet } from './functions/catalog/catalog-category-get';
import { catalogCategoryProductsSearch } from './functions/catalog/catalog-category-products-search';
import { catalogProductGet } from './functions/catalog/catalog-product-get';
import { catalogProductPriceStockGet } from './functions/catalog/catalog-product-price-stock-get';
import { catalogRelatedProductsGet } from './functions/catalog/catalog-related-products-get';
import { searchProducts } from './functions/search/search-products';
import { newsletterSubscribe } from './functions/newsletter/newsletter-subscribe';
import { cartWishlistCountGet } from './functions/cart/cart-wishlist-count-get';
import { cartGet } from './functions/cart/cart-get';
import { cartValidate } from './functions/cart/cart-validate';
import { cartItemAdd } from './functions/cart/cart-item-add';
import { cartItemUpdate } from './functions/cart/cart-item-update';
import { cartItemRemove } from './functions/cart/cart-item-remove';
import { promotionValidate } from './functions/cart/promotion-validate';
import { cartWishlistMerge } from './functions/cart/cart-wishlist-merge';
import { wishlistGet } from './functions/wishlist/wishlist-get';
import { ordersListGet } from './functions/orders/orders-list-get';
import { orderGet } from './functions/orders/order-get';
import { accountGet } from './functions/account/account-get';
import { accountUpdate } from './functions/account/account-update';
import { authLogin } from './functions/auth/auth-login';
import { addressesGet } from './functions/account/addresses-get';
import { addressSave } from './functions/account/address-save';
import { addressDelete } from './functions/account/address-delete';
import { inventoryProductsSearch } from './functions/inventory/inventory-products-search';
import { inventoryProductGet } from './functions/inventory/inventory-product-get';
import { inventoryProductCreate } from './functions/inventory/inventory-product-create';
import { inventoryProductUpdate } from './functions/inventory/inventory-product-update';
import { billingCreate } from './functions/billing/billing-create';
import { billingGet } from './functions/billing/billing-get';
import { billingList } from './functions/billing/billing-list';
import { analyticsSummary } from './functions/analytics/analytics-summary';
import { analyticsDailySales } from './functions/analytics/analytics-daily-sales';

/**
 * Dev-only convenience: mounts every function at its own path (matching its GCF
 * function name) on a single local Express server, so the Next.js app can be
 * developed against one base URL instead of running 11 separate
 * functions-framework processes. Each handler is still a plain (req, res) HTTP
 * function usable standalone via functions-framework/GCF (see src/index.ts).
 */
const app = express();
app.use(express.json());

app.all('/nav-get', navGet);
app.all('/cms-homepage-get', cmsHomepageGet);
app.all('/cms-policy-get', cmsPolicyGet);
app.all('/catalog-product-summaries-get', catalogProductSummariesGet);
app.all('/catalog-category-get', catalogCategoryGet);
app.all('/catalog-category-products-search', catalogCategoryProductsSearch);
app.all('/catalog-product-get', catalogProductGet);
app.all('/catalog-product-price-stock-get', catalogProductPriceStockGet);
app.all('/catalog-related-products-get', catalogRelatedProductsGet);
app.all('/search-products', searchProducts);
app.all('/newsletter-subscribe', newsletterSubscribe);
app.all('/cart-wishlist-count-get', cartWishlistCountGet);
app.all('/cart-get', cartGet);
app.all('/cart-validate', cartValidate);
app.all('/cart-item-add', cartItemAdd);
app.all('/cart-item-update', cartItemUpdate);
app.all('/cart-item-remove', cartItemRemove);
app.all('/promotion-validate', promotionValidate);
app.all('/cart-wishlist-merge', cartWishlistMerge);
app.all('/wishlist-get', wishlistGet);
app.all('/orders-list-get', ordersListGet);
app.all('/order-get', orderGet);
app.all('/account-get', accountGet);
app.all('/account-update', accountUpdate);
app.all('/auth-login', authLogin);
app.all('/addresses-get', addressesGet);
app.all('/address-save', addressSave);
app.all('/address-delete', addressDelete);
app.all('/inventory-products-search', inventoryProductsSearch);
app.all('/inventory-product-get', inventoryProductGet);
app.all('/inventory-product-create', inventoryProductCreate);
app.all('/inventory-product-update', inventoryProductUpdate);
app.all('/billing-create', billingCreate);
app.all('/billing-get', billingGet);
app.all('/billing-list', billingList);
app.all('/analytics-summary', analyticsSummary);
app.all('/analytics-daily-sales', analyticsDailySales);

const port = process.env.PORT ? Number(process.env.PORT) : 8090;
app.listen(port, () => {
  console.log(`store_functions dev server listening on http://localhost:${port}`);
});
