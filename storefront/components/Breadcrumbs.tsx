import Link from 'next/link';
import type { Breadcrumb } from '@/lib/types';

export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {items.map((item, index) => (
          <li key={item.href}>
            {index === items.length - 1 ? <span aria-current="page">{item.label}</span> : <Link href={item.href}>{item.label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
