import { query } from '../shared/db';
import type { HomepageBlock } from '../shared/types';

/**
 * The home page's blocks: store.cms_blocks of the published page 'home', in order, skipping inactive
 * blocks and blocks outside their starts_at/ends_at window. Each row's `payload` carries the block's own
 * fields; `id` and `type` come from the row.
 */
export async function loadHomepageBlocks(): Promise<HomepageBlock[]> {
  const { rows } = await query<{ id: string; type: string; payload: Record<string, unknown> }>(
    `SELECT b.id, b.type, b.payload
       FROM store.cms_blocks b JOIN store.cms_pages pg ON pg.id = b.page_id
      WHERE pg.slug = 'home' AND pg.status = 'published' AND b.is_active
        AND (b.starts_at IS NULL OR b.starts_at <= NOW())
        AND (b.ends_at IS NULL OR b.ends_at > NOW())
      ORDER BY b.position, b.created_at`,
  );
  return rows.map((r) => ({ ...r.payload, id: r.id, type: r.type }) as unknown as HomepageBlock);
}
