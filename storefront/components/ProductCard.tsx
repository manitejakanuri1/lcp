import Image from 'next/image';
import Link from 'next/link';
import { discountPercent, formatPrice } from '@/lib/format';
import type { ProductSummary } from '@/lib/types';
import { WishlistToggle } from './WishlistToggle';

// How wide the photo really ends up, so the browser can pick a file that size instead of
// guessing from width={360}. The default describes .product-grid: one column on a phone
// (auto-fill with a 220px minimum cannot fit two) and about 280px once the row fills out.
// A rail is a fixed 220px column and passes its own.
const GRID_SIZES = '(max-width: 600px) 92vw, 280px';

export function ProductCard({ product, sizes = GRID_SIZES }: { product: ProductSummary; sizes?: string }) {
  const off = discountPercent(product.price, product.discountPrice);

  return (
    <article className="product-card">
      <Link href={`/product/${product.slug}`} className="product-card-image">
        <Image src={product.image} alt={product.name} width={360} height={460} sizes={sizes} />
        {product.badge && <span className="badge">{product.badge}</span>}
        {!product.inStock && <span className="badge sold-out">Sold out</span>}
      </Link>
      {/* Sibling of the image link (a button inside an anchor is invalid); positioned over it by .wishlist-toggle. */}
      <WishlistToggle productId={product.id} productName={product.name} />
      {/* No star until a customer has actually left one: "★ 0.0" reads as a bad saree
          rather than as a new one. */}
      {product.rating > 0 && <p className="rating">★ {product.rating.toFixed(1)}</p>}
      <h3>
        <Link href={`/product/${product.slug}`}>{product.name}</Link>
      </h3>
      <p className="price">
        {formatPrice(product.discountPrice ?? product.price)}
        {product.discountPrice && <s>{formatPrice(product.price)}</s>}
        {off && <span className="off">{off}% OFF</span>}
      </p>
    </article>
  );
}
