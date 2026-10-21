import { useEffect, useState } from 'react'
import { request } from './api'

/**
 * Storefront categories, as the website holds them.
 *
 * The id is written to products.saree_type and is what the website looks the shelf up by;
 * the label is only what the shop reads. Both now come from store.categories, so renaming a
 * shelf on the Website screen changes the word everywhere at once. The list below is the
 * fallback used for the first paint and when the shop is offline - names drift there, ids
 * do not, and an id is the part that matters.
 */
export interface SareeCategory {
    id: string
    label: string
}

const FALLBACK: SareeCategory[] = [
    { id: 'pattu-silk', label: 'Soft Silk Pattu' },
    { id: 'cotton', label: 'Cotton' },
    { id: 'fancy', label: 'Georgette' },
    { id: 'budget', label: 'Under ₹2,000' },
    { id: 'sets', label: 'Langavoni' },
]

// Held outside React so categoryLabel() works in a plain function, and so the list is
// fetched once per visit rather than once per screen.
let loaded: SareeCategory[] | null = null
let inFlight: Promise<SareeCategory[]> | null = null
const listeners = new Set<(list: SareeCategory[]) => void>()

export function loadCategories(): Promise<SareeCategory[]> {
    if (loaded) return Promise.resolve(loaded)
    inFlight ??= request<{ slug: string; title: string }[]>('/website/categories')
        .then((rows) => {
            loaded = rows.map((row) => ({ id: row.slug, label: row.title }))
            for (const listener of listeners) listener(loaded)
            return loaded
        })
        .catch(() => FALLBACK)
        .finally(() => { inFlight = null })
    return inFlight
}

/** The list for a dropdown. Starts with the fallback and swaps in the real names when they land. */
export function useCategories(): SareeCategory[] {
    const [list, setList] = useState<SareeCategory[]>(loaded ?? FALLBACK)
    useEffect(() => {
        listeners.add(setList)
        loadCategories().then(setList)
        return () => { listeners.delete(setList) }
    }, [])
    return list
}

/** Label for display; falls back to the raw value so unknown ids stay visible. */
export function categoryLabel(id: string | null | undefined): string {
    if (!id) return 'Uncategorised'
    return (loaded ?? FALLBACK).find((c) => c.id === id)?.label ?? id
}

/** Kept for the two screens that only need the ids; prefer useCategories() for anything shown. */
export const SAREE_CATEGORIES = FALLBACK
