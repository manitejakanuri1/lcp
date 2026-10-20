import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct, getRelatedProducts } from '@/lib/cloud-functions/catalog';
import { CloudFunctionError } from '@/lib/cloud-functions/client';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { VariantSelector } from '@/components/VariantSelector';
import { ProductRail } from '@/components/ProductRail';

export const revalidate = 300;
// No generateStaticParams: there is no "list all products" cloud function in this
// contract (tech_req only specifies get-by-slug functions), so product pages are
// generated on first request and cached from then on (dynamicParams defaults to true).

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function loadProduct(slug: string) {
  try {
    return await getProduct(slug);
  } catch (error) {
    if (error instanceof CloudFunctionError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return {};

  return {
    title: product.name,
    description: product.description,
    alternates: { canonical: `/product/${slug}` },
    openGraph: { images: [product.images[0]] },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) notFound();

  const category = product.categorySlugs[0];
  const { products: related } = await getRelatedProducts(slug);
  const primaryVariant = product.variants[0];

  return (
    <div className="container product-page">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: category, href: `/collections/${category}` },
          { label: product.name, href: `/product/${product.slug}` },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: product.name,
            image: product.images,
            description: product.description,
            offers: {
              '@type': 'Offer',
              price: primaryVariant.discountPrice ?? primaryVariant.price,
              priceCurrency: 'INR',
              availability: primaryVariant.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            },
          }),
        }}
      />

      <div className="pdp-layout">
        <div className="pdp-gallery">
          {product.images.map((image, index) => (
            <Image key={image} src={image} alt={`${product.name} — view ${index + 1}`} width={520} height={650} priority={index === 0} />
          ))}
        </div>

        <div className="pdp-info">
          <h1>{product.name}</h1>
          <p className="psub">{product.subtitle}</p>
          <p className="rating">★ {product.rating.toFixed(1)}</p>

          <VariantSelector product={product} />

          <details open>
            <summary>Description</summary>
            <p>{product.description}</p>
          </details>
          <details>
            <summary>Fabric & care</summary>
            <p>{product.fabric}</p>
            <p>{product.careInstructions}</p>
          </details>
          <details>
            <summary>Shipping & returns</summary>
            <p>
              See our <Link href="/policies/shipping">shipping</Link> and <Link href="/policies/returns">returns</Link> policies.
            </p>
          </details>
        </div>
      </div>

      {related.length > 0 && (
        <section>
          <h2>You may also like</h2>
          <ProductRail products={related} />
        </section>
      )}
    </div>
  );
}
