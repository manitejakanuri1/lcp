/**
 * Storefront categories.
 *
 * These ids are written to products.saree_type and read by the website, which
 * treats a recognised value as an override for its own keyword guessing. They must
 * stay in step with VALID_CATEGORIES in the storefront's src/lib/inventory.ts —
 * an unrecognised id is ignored there and the saree falls back to the guess.
 */
export const SAREE_CATEGORIES = [
    { id: 'pattu-silk', label: 'Pattu & Silk' },
    { id: 'cotton', label: 'Cotton' },
    { id: 'fancy', label: 'Georgette & Fancy' },
    { id: 'budget', label: 'Under ₹500' },
    { id: 'sets', label: 'Langavoni & Dresses' },
] as const

export type SareeCategory = (typeof SAREE_CATEGORIES)[number]['id']

/** Label for display; falls back to the raw value so unknown ids stay visible. */
export function categoryLabel(id: string | null | undefined): string {
    if (!id) return 'Uncategorised'
    return SAREE_CATEGORIES.find((c) => c.id === id)?.label ?? id
}
