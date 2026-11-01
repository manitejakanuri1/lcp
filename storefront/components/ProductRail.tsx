import type { ProductSummary } from '@/lib/types';
import { ProductCard } from './ProductCard';

export function ProductRail({ products }: { products: ProductSummary[] }) {
  if (products.length === 0) return null;

  return (
    <div className="product-rail">
      {products.map((product) => (
        <div key={product.id} className="product-rail-item">
          {/* .product-rail is a fixed 220px column at every width. */}
          <ProductCard product={product} sizes="220px" />
        </div>
      ))}
    </div>
  );
}
