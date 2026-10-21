import { useEffect, useState } from 'react'
import { Layout } from '../components/layout/Layout'
import { Button, Input } from '../components/ui'
import { siteApi, type SitePayload, type SiteProduct, type SiteSetting } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { Globe } from 'lucide-react'

/**
 * The customer website, as the shop sees it.
 *
 * The Colours screen is about one saree at a time. This one is about the site: which shelf a
 * saree sits on, which sections the home page shows, and the words in the header and footer.
 * All three used to be changeable only in SQL, which is why the home page shelves stood
 * empty and the footer claimed a certification the shop does not hold.
 */
export function WebsiteAdmin() {
    const { addToast } = useToast()
    const [site, setSite] = useState<SitePayload | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    // Only the keys the shop has typed into are sent, so a save cannot overwrite wording
    // someone else changed in the meantime.
    const [wording, setWording] = useState<Record<string, string>>({})

    const load = async () => {
        setIsLoading(true)
        try {
            setSite(await siteApi.get())
        } catch {
            addToast('error', 'Could not load the website settings')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const run = async (work: () => Promise<void>, failure: string) => {
        setBusy(true)
        try {
            await work()
        } catch (error) {
            addToast('error', error instanceof Error ? error.message : failure)
        } finally {
            setBusy(false)
        }
    }

    // The tick moves on screen first and the shop is told only if the save fails. A tick box
    // whose state waits for the network snaps back to where it was and then jumps forward,
    // which reads as the tap having been missed.
    const toggleShelf = async (saree: SiteProduct, slug: string) => {
        const shelves = saree.shelves.includes(slug)
            ? saree.shelves.filter((s) => s !== slug)
            : [...saree.shelves, slug]
        if (!shelves.length) {
            addToast('error', 'A saree has to sit on at least one shelf')
            return
        }

        const move = (from: string[], to: string[]) => setSite((current) => current && {
            ...current,
            products: current.products.map((p) => (p.id === saree.id ? { ...p, shelves: to } : p)),
            // The counts beside each shelf move with the tick, so the shop watches an empty
            // shelf fill up without reloading the screen.
            shelves: current.shelves.map((shelf) => {
                const had = from.includes(shelf.slug)
                const has = to.includes(shelf.slug)
                return had === has ? shelf : { ...shelf, products: shelf.products + (has ? 1 : -1) }
            }),
        })

        move(saree.shelves, shelves)
        setBusy(true)
        try {
            await siteApi.setShelves(saree.id, shelves)
        } catch (error) {
            move(shelves, saree.shelves)
            addToast('error', error instanceof Error ? error.message : 'Could not save the shelves')
        } finally {
            setBusy(false)
        }
    }

    // Optimistic for the same reason as the shelves above.
    const toggleSection = async (id: string, isActive: boolean) => {
        const show = (state: boolean) => setSite((current) => current && {
            ...current,
            sections: current.sections.map((s) => (s.id === id ? { ...s, is_active: state } : s)),
        })

        show(isActive)
        setBusy(true)
        try {
            await siteApi.setSection(id, isActive)
        } catch (error) {
            show(!isActive)
            addToast('error', error instanceof Error ? error.message : 'Could not change the section')
        } finally {
            setBusy(false)
        }
    }

    const saveWording = () => run(async () => {
        if (!Object.keys(wording).length) {
            addToast('error', 'Nothing has been changed')
            return
        }
        // trust_badge is a title and a subtitle in one setting, so its two boxes are held as
        // "trust_badge.title" and "trust_badge.subtitle" and folded back into one object here.
        // The parts not typed into are carried over from what the website holds now, or the
        // save would blank them.
        const changes: Record<string, unknown> = {}
        for (const [name, text] of Object.entries(wording)) {
            const [key, part] = name.split('.')
            if (!part) { changes[key] = text; continue }
            const held = site?.settings.find((setting) => setting.key === key)?.value
            changes[key] = { ...(held as object), ...(changes[key] as object), [part]: text }
        }
        await siteApi.saveSettings(changes)
        setWording({})
        await load()
        addToast('success', 'Wording saved')
    }, 'Could not save the wording')

    // Most settings are one sentence. trust_badge is a title and a subtitle shown together at
    // the top of every page, so it becomes two boxes rather than one unreadable line - it is
    // where "Silk Mark Certified" is written, which is exactly the sort of claim the shop
    // needs to be able to take down itself.
    const parts = (setting: SiteSetting) => {
        if (setting.value && typeof setting.value === 'object') {
            return Object.entries(setting.value as Record<string, string>).map(([part, text]) => ({
                name: `${setting.key}.${part}`,
                label: `${setting.description || setting.key} — ${part}`,
                text: String(text ?? ''),
            }))
        }
        return [{
            name: setting.key,
            label: setting.description || setting.key,
            text: typeof setting.value === 'string' ? setting.value : String(setting.value ?? ''),
        }]
    }

    return (
        <Layout>
            <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-[var(--color-text)]">Website</h1>
                    <p className="text-[var(--color-text-muted)]">
                        Shelves, home page sections and the wording customers read
                    </p>
                </div>

                {isLoading && <p className="text-[var(--color-text-muted)]">Loading…</p>}

                {site && (
                    <div className="space-y-6">
                        {/* ---------------- shelves ---------------- */}
                        <section className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4 sm:p-5">
                            <h2 className="font-semibold text-[var(--color-text)]">Shelves</h2>
                            <p className="text-sm text-[var(--color-text-muted)] mb-4">
                                A shelf showing 0 sarees looks broken to a customer. Tick a shelf to put the saree on it.
                            </p>

                            <div className="flex flex-wrap gap-2 mb-5">
                                {site.shelves.map((shelf) => (
                                    <span
                                        key={shelf.slug}
                                        className={`text-xs px-2.5 py-1 rounded-full border ${shelf.products === 0
                                            ? 'border-[var(--color-danger)] text-[var(--color-danger)]'
                                            : 'border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
                                    >
                                        {shelf.title} · {shelf.products}
                                    </span>
                                ))}
                            </div>

                            {site.products.length === 0 && (
                                <p className="text-sm text-[var(--color-text-muted)]">
                                    No saree is on the website yet. Put one up from the Colours screen first.
                                </p>
                            )}

                            <div className="space-y-4">
                                {site.products.map((saree) => (
                                    <div key={saree.id} className="flex gap-3">
                                        {saree.image_url && (
                                            <img
                                                src={saree.image_url}
                                                alt={saree.saree_name || saree.sku}
                                                className="w-14 h-20 object-contain rounded-lg bg-[var(--color-surface)] shrink-0"
                                            />
                                        )}
                                        <div className="min-w-0">
                                            <p className="font-medium text-[var(--color-text)]">{saree.saree_name || saree.sku}</p>
                                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1.5">
                                                {site.shelves.map((shelf) => (
                                                    <label key={shelf.slug} className="flex items-center gap-1.5 text-sm text-[var(--color-text)] cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={saree.shelves.includes(shelf.slug)}
                                                            disabled={busy}
                                                            onChange={() => toggleShelf(saree, shelf.slug)}
                                                        />
                                                        {shelf.title}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* ---------------- home page sections ---------------- */}
                        <section className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4 sm:p-5">
                            <h2 className="font-semibold text-[var(--color-text)]">Home page sections</h2>
                            <p className="text-sm text-[var(--color-text-muted)] mb-4">
                                Switch off anything you do not want a customer to see. A section asking for an empty
                                shelf shows nothing but its heading.
                            </p>

                            <div className="space-y-1">
                                {site.sections.map((section) => {
                                    const shelf = section.collection_slug
                                        ? site.shelves.find((s) => s.slug === section.collection_slug)
                                        : null
                                    const empty = shelf ? shelf.products === 0 : false
                                    return (
                                        <label
                                            key={section.id}
                                            className="flex items-center gap-3 py-2 border-b border-[var(--color-border)] last:border-0 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={section.is_active}
                                                disabled={busy}
                                                onChange={(event) => toggleSection(section.id, event.target.checked)}
                                            />
                                            <span className="text-sm text-[var(--color-text)] flex-1 min-w-0">
                                                {section.title || section.type}
                                                {section.collection_slug && (
                                                    <span className="text-[var(--color-text-muted)]"> · {section.collection_slug}</span>
                                                )}
                                            </span>
                                            {empty && (
                                                <span className="text-xs text-[var(--color-danger)] shrink-0">shelf empty</span>
                                            )}
                                        </label>
                                    )
                                })}
                            </div>
                        </section>

                        {/* ---------------- wording ---------------- */}
                        <section className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4 sm:p-5">
                            <h2 className="font-semibold text-[var(--color-text)]">Wording</h2>
                            <p className="text-sm text-[var(--color-text-muted)] mb-4">
                                The lines in the header and footer of every page. Say only what the shop can stand
                                behind — a claim a customer can disprove costs more than it earns.
                            </p>

                            <div className="space-y-4">
                                {site.settings.flatMap((setting) => parts(setting).map(({ name, label, text }) => (
                                    <Input
                                        key={name}
                                        label={label}
                                        value={wording[name] ?? text}
                                        disabled={busy}
                                        onChange={(event) => setWording((current) => ({ ...current, [name]: event.target.value }))}
                                    />
                                )))}
                            </div>

                            <div className="mt-4">
                                <Button disabled={busy || !Object.keys(wording).length} onClick={saveWording}>
                                    <Globe className="w-4 h-4" />
                                    Save wording
                                </Button>
                            </div>
                        </section>

                        <p className="text-xs text-[var(--color-text-muted)]">
                            The website keeps a copy of each page for speed, so a change here can take a few minutes
                            to appear.
                        </p>
                    </div>
                )}
            </div>
        </Layout>
    )
}
