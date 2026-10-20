import Image from 'next/image';
import Link from 'next/link';
import { formatPrice } from '@/lib/format';
import type { ProductSummary } from '@/lib/types';
import { WishlistToggle } from './WishlistToggle';

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <article className="product-card">
      <Link href={`/product/${product.slug}`} className="product-card-image">
        <Image src={product.image} alt={product.name} width={360} height={460} />
        {product.badge && <span className="badge">{product.badge}</span>}
        {!product.inStock && <span className="badge sold-out">Sold out</span>}
      </Link>
      {/* Sibling of the image link (a button inside an anchor is invalid); positioned over it by .wishlist-toggle. */}
      <WishlistToggle productId={product.id} productName={product.name} />
      <p className="rating">★ {product.rating.toFixed(1)}</p>
      <h3>
        <Link href={`/product/${product.slug}`}>{product.name}</Link>
      </h3>
      <p className="price">
        {formatPrice(product.discountPrice ?? product.price)}
        {product.discountPrice && <s>{formatPrice(product.price)}</s>}
      </p>
    </article>
  );
}
