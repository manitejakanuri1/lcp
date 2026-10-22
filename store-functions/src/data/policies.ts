import { query } from '../shared/db';
import type { Policy } from '../shared/types';

interface PolicyRow {
  id: string;
  slug: string;
  title: string;
  last_updated: string;
}

/** A published policy with its sections in order (store.policies / policy_sections). */
export async function findPolicy(slug: string): Promise<Policy | undefined> {
  const { rows } = await query<PolicyRow>(
    `SELECT id, slug, title, last_updated::text AS last_updated FROM store.policies WHERE slug = $1 AND status = 'published'`,
    [slug],
  );
  const p = rows[0];
  if (!p) return undefined;
  const sections = await query<{ anchor: string; heading: string; body_html: string }>(
    `SELECT anchor, heading, body_html FROM store.policy_sections WHERE policy_id = $1 ORDER BY position, anchor`,
    [p.id],
  );
  return {
    slug: p.slug,
    title: p.title,
    lastUpdated: p.last_updated,
    sections: sections.rows.map((s) => ({ id: s.anchor, heading: s.heading, bodyHtml: s.body_html })),
  };
}
