import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPolicy } from '@/lib/cloud-functions/cms';
import { CloudFunctionError } from '@/lib/cloud-functions/client';
import { Breadcrumbs } from '@/components/Breadcrumbs';

export const revalidate = 300;

const KNOWN_POLICY_SLUGS = ['shipping', 'returns', 'privacy', 'terms'];

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return KNOWN_POLICY_SLUGS.map((slug) => ({ slug }));
}

async function loadPolicy(slug: string) {
  try {
    return await getPolicy(slug);
  } catch (error) {
    if (error instanceof CloudFunctionError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const policy = await loadPolicy(slug);
  if (!policy) return {};

  return { title: policy.title, alternates: { canonical: `/policies/${slug}` } };
}

export default async function PolicyPage({ params }: PageProps) {
  const { slug } = await params;
  const policy = await loadPolicy(slug);
  if (!policy) notFound();

  return (
    <div className="container policy-page">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: policy.title, href: `/policies/${slug}` }]} />
      <h1>{policy.title}</h1>
      <p className="muted">Last updated {new Date(policy.lastUpdated).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <nav aria-label="Table of contents" className="policy-toc">
        <ul>
          {policy.sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>{section.heading}</a>
            </li>
          ))}
        </ul>
      </nav>

      {policy.sections.map((section) => (
        <section key={section.id} id={section.id}>
          <h2>{section.heading}</h2>
          <div dangerouslySetInnerHTML={{ __html: section.bodyHtml }} />
        </section>
      ))}

      <p className="policy-contact">
        Questions? <a href="mailto:support@lakshmisarees.example">Contact support</a>.
      </p>
    </div>
  );
}
