import type { ProductSummary } from '@/lib/types';
import { ProductCard } from './ProductCard';

export function ProductGrid({ products, emptyMessage }: { products: ProductSummary[]; emptyMessage?: string }) {
  if (products.length === 0) {
    return <p className="empty-state">{emptyMessage ?? 'No products found.'}</p>;
  }

  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
