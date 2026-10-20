import Link from 'next/link';

export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  searchParams,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  function hrefFor(targetPage: number) {
    const params = new URLSearchParams(
      Object.entries(searchParams).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    params.set('page', String(targetPage));
    return `${basePath}?${params.toString()}`;
  }

  return (
    <nav aria-label="Pagination" className="pagination">
      {page > 1 && <Link href={hrefFor(page - 1)}>← Previous</Link>}
      <span>
        Page {page} of {totalPages}
      </span>
      {page < totalPages && <Link href={hrefFor(page + 1)}>Next →</Link>}
    </nav>
  );
}
