import { useEffect, useRef, useState } from 'react'
import { Layout } from '../components/layout/Layout'
import { Button, Input, Modal } from '../components/ui'
import { productsApi, websiteApi, type WebsiteProduct } from '../lib/api'
import { SAREE_CATEGORIES, categoryLabel } from '../lib/categories'
import { useToast } from '../contexts/ToastContext'
import { Globe, ImagePlus, Printer, Trash2 } from 'lucide-react'
import { printThermalLabels } from '../components/inventory/ThermalLabel'
import type { Product } from '../lib/api'

// Suggestions only: any colour can be typed, and the server stores it in Title Case
// so "red" and "RED" land in the same website filter.
const COLOR_SUGGESTIONS = [
    'Red', 'Maroon', 'Pink', 'Rani Pink', 'Orange', 'Yellow', 'Mustard', 'Green', 'Bottle Green',
    'Parrot Green', 'Blue', 'Navy Blue', 'Sky Blue', 'Purple', 'Violet', 'Black', 'White',
    'Cream', 'Beige', 'Brown', 'Grey', 'Silver', 'Gold', 'Peach', 'Magenta', 'Multicolour',
]

type Tab = 'todo' | 'live'

/**
 * After Stock In, every saree lands here to get its website details: category,
 * colour variants (one photo each) and the "show on website" switch. Nothing is
 * public until the switch is on.
 */
export function Website() {
    const { addToast } = useToast()
    const [tab, setTab] = useState<Tab>('todo')
    const [products, setProducts] = useState<WebsiteProduct[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [selected, setSelected] = useState<WebsiteProduct | null>(null)

    const load = async (which: Tab = tab) => {
        setIsLoading(true)
        try {
            setProducts(await websiteApi.getProducts(which))
        } catch {
            addToast('error', 'Could not load products')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => { load(tab) }, [tab])

    // Keep the open editor and the list in step after each change
    const replace = (updated: WebsiteProduct) => {
        setSelected(updated)
        setProducts((list) => list.map((p) => (p.id === updated.id ? updated : p)))
    }

    return (
        <Layout>
            <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-[var(--color-text)]">Website</h1>
                    <p className="text-[var(--color-text-muted)]">
                        Add category and colour photos, then switch a saree on to show it on the website
                    </p>
                </div>

                <div className="flex gap-2 mb-6">
                    {([['todo', 'To do'], ['live', 'On website']] as const).map(([id, label]) => (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                tab === id
                                    ? 'bg-[var(--color-primary)] text-white'
                                    : 'bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-text)]'
                            }`}
                        >
                            {label}{tab === id && !isLoading ? ` (${products.length})` : ''}
                        </button>
                    ))}
                </div>

                {isLoading ? (
                    <p className="text-[var(--color-text-muted)]">Loading…</p>
                ) : products.length === 0 ? (
                    <p className="text-[var(--color-text-muted)] py-12 text-center">
                        {tab === 'todo' ? 'Nothing to do — every saree in stock is on the website.' : 'No sarees on the website yet.'}
                    </p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {products.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => setSelected(p)}
                                className="text-left bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl overflow-hidden hover:border-[var(--color-primary)] transition-colors"
                            >
                                <div className="aspect-[4/3] bg-[var(--color-surface)] flex items-center justify-center">
                                    {p.image_url
                                        ? <img src={p.image_url} alt={p.saree_name || p.sku} className="w-full h-full object-cover" />
                                        : <ImagePlus className="w-8 h-8 text-[var(--color-text-muted)]" />}
                                </div>
                                <div className="p-3 space-y-1">
                                    <p className="font-semibold text-[var(--color-text)] truncate">{p.saree_name || 'Unnamed'}</p>
                                    <p className="text-xs font-mono text-[var(--color-text-muted)]">{p.sku}</p>
                                    <p className="text-sm text-[var(--color-text)]">₹{p.selling_price_b || p.selling_price_a}</p>
                                    <div className="flex flex-wrap gap-1 pt-1 text-xs">
                                        <span className={`px-2 py-0.5 rounded-full ${p.saree_type ? 'bg-green-500/10 text-[var(--color-success-text)]' : 'bg-amber-500/10 text-amber-600'}`}>
                                            {p.saree_type ? categoryLabel(p.saree_type) : 'No category'}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded-full ${p.product_colors.length ? 'bg-green-500/10 text-[var(--color-success-text)]' : 'bg-amber-500/10 text-amber-600'}`}>
                                            {p.product_colors.length} colour{p.product_colors.length === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {selected && (
                <ProductEditor
                    product={selected}
                    onChange={replace}
                    onClose={() => setSelected(null)}
                    onMovedTab={() => { setSelected(null); load(tab) }}
                />
            )}
        </Layout>
    )
}

function ProductEditor({ product, onChange, onClose, onMovedTab }: {
    product: WebsiteProduct
    onChange: (p: WebsiteProduct) => void
    onClose: () => void
    onMovedTab: () => void
}) {
    const { addToast } = useToast()
    const [colorName, setColorName] = useState('')
    const [colorPieces, setColorPieces] = useState('')
    const [colorFile, setColorFile] = useState<File | null>(null)
    const [colorPreview, setColorPreview] = useState<string | null>(null)
    useEffect(() => {
        if (!colorFile) { setColorPreview(null); return }
        const url = URL.createObjectURL(colorFile)
        setColorPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [colorFile])
    const [busy, setBusy] = useState(false)
    const colorInput = useRef<HTMLInputElement>(null)
    const mainInput = useRef<HTMLInputElement>(null)
    // Gallery: index 0 = main photo, then each colour. A new colour jumps into view.
    const [shown, setShown] = useState(0)
    const [mainColor, setMainColor] = useState(product.color || '')
    const [mainPieces, setMainPieces] = useState(product.main_color_pieces ? String(product.main_color_pieces) : '')
    const gallery = [
        { key: 'main', url: product.image_url, name: product.color || 'Main photo', pieces: product.main_color_pieces || 0 },
        ...product.product_colors.map((c) => ({ key: c.id, url: c.image_url, name: c.color_name, pieces: c.pieces || 0 })),
    ]
    const current = gallery[Math.min(shown, gallery.length - 1)]
    const totalListed = gallery.reduce((sum, g) => sum + g.pieces, 0)

    const run = async (work: () => Promise<void>, failure: string) => {
        setBusy(true)
        try { await work() } catch (err) {
            addToast('error', err instanceof Error && err.message ? err.message : failure)
        } finally { setBusy(false) }
    }

    const setCategory = (saree_type: string) => run(async () => {
        await websiteApi.update(product.id, { saree_type })
        onChange({ ...product, saree_type })
    }, 'Could not save category')

    const changeMainPhoto = (file: File) => run(async () => {
        const res = await productsApi.uploadPhoto(product.id, file)
        onChange({ ...product, image_url: res.product?.image_url ?? res.image_url })
    }, 'Could not upload photo')

    const addColor = () => run(async () => {
        if (!colorName.trim() || !colorFile) {
            addToast('error', 'Choose a colour and a photo')
            return
        }
        const color = await websiteApi.addColor(product.id, colorName, parseInt(colorPieces) || 0, colorFile)
        onChange({ ...product, product_colors: [...product.product_colors, color] })
        setShown(product.product_colors.length + 1)
        setColorName('')
        setColorPieces('')
        setColorFile(null)
        if (colorInput.current) colorInput.current.value = ''
    }, 'Could not add colour')

    const removeColor = (id: string) => run(async () => {
        await websiteApi.removeColor(id)
        onChange({ ...product, product_colors: product.product_colors.filter((c) => c.id !== id) })
        setShown(0)
    }, 'Could not remove colour')

    const saveMainColor = () => run(async () => {
        const saved = await websiteApi.update(product.id, { color: mainColor, main_color_pieces: parseInt(mainPieces) || 0 })
        onChange({ ...product, color: saved.color, main_color_pieces: saved.main_color_pieces })
        setMainColor(saved.color || '')
    }, 'Could not save main colour')

    const toggleWebsite = () => run(async () => {
        const on = !product.on_website
        if (on && (!product.saree_type || !product.image_url)) {
            addToast('error', 'Add a category and a main photo before showing it on the website')
            return
        }
        await websiteApi.update(product.id, { on_website: on })
        addToast('success', on ? 'Now on the website' : 'Removed from the website')
        onMovedTab()
    }, 'Could not update')

    return (
        <Modal isOpen onClose={onClose} title={product.saree_name || product.sku} size="full">
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
                {/* Main photo, from Stock In */}
                <div className="space-y-3">
                    {/* Gallery: big photo + thumbnails (beside on laptop, below on phone) */}
                    <div className="flex flex-col lg:flex-row gap-2">
                        <div className="flex-1 aspect-[3/4] bg-[var(--color-surface)] rounded-xl overflow-hidden flex items-center justify-center border border-[var(--color-border)]">
                            {current.url
                                ? <img src={current.url} alt={current.name} className="w-full h-full object-cover" />
                                : <span className="text-sm text-[var(--color-text-muted)]">No main photo yet</span>}
                        </div>
                        {gallery.length > 1 && (
                            <div className="flex lg:flex-col gap-2 overflow-auto lg:max-h-[426px]">
                                {gallery.map((g, i) => (
                                    <button key={g.key} type="button" title={g.name} onClick={() => setShown(i)}
                                        className={`shrink-0 w-14 h-[74px] rounded-lg overflow-hidden border-2 ${i === shown ? 'border-[var(--color-primary)]' : 'border-transparent opacity-70'}`}>
                                        {g.url && <img src={g.url} alt={g.name} className="w-full h-full object-cover" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <p className="text-sm font-medium text-[var(--color-text)]">
                        {current.name}{current.pieces ? ` · ${current.pieces} pcs` : ''}
                    </p>
                    <input ref={mainInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        onChange={(e) => e.target.files?.[0] && changeMainPhoto(e.target.files[0])} />
                    <Button type="button" variant="secondary" fullWidth disabled={busy} onClick={() => mainInput.current?.click()}>
                        {product.image_url ? 'Change main photo' : 'Add main photo'}
                    </Button>
                    {/* Colour of the main photo itself */}
                    <div className="grid grid-cols-[1fr_5rem_auto] gap-2 items-end">
                        <Input label="Main photo colour" list="color-suggestions" placeholder="e.g. Teal"
                            value={mainColor} onChange={(e) => setMainColor(e.target.value)} />
                        <Input label="Pieces" type="number" min="0" placeholder="0"
                            value={mainPieces} onChange={(e) => setMainPieces(e.target.value)} />
                        <Button type="button" variant="secondary" disabled={busy} onClick={saveMainColor}>Save</Button>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] font-mono">{product.sku} · {product.quantity} in stock · ₹{product.selling_price_b || product.selling_price_a}</p>
                </div>

                <div className="space-y-6">
                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Website Category</label>
                        <select
                            value={product.saree_type || ''}
                            disabled={busy}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full sm:w-80 px-4 py-3 text-base bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-[var(--color-text)]"
                        >
                            <option value="">Select a category…</option>
                            {SAREE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                    </div>

                    {/* Colours */}
                    <div>
                        <div className="flex items-center justify-between mb-3 gap-3">
                        <h3 className="text-sm font-semibold text-[var(--color-text)]">
                            Colours ({product.product_colors.length})
                            {totalListed > 0 && (
                                <span className="font-normal text-[var(--color-text-muted)]">
                                    {' '}· {gallery.filter((g) => g.pieces).map((g) => `${g.name} ${g.pieces}`).join(' + ')} = {totalListed} of {product.quantity} in stock
                                </span>
                            )}
                        </h3>
                        {product.product_colors.some((c) => c.sku) && (
                            <Button type="button" variant="secondary" onClick={() => printThermalLabels(
                                product.product_colors.filter((c) => c.sku).flatMap((c) => Array.from(
                                    { length: Math.max(1, c.pieces || 1) },
                                    () => ({
                                        ...(product as unknown as Product),
                                        sku: c.sku as string,
                                        saree_name: `${product.saree_name || ''} ${c.color_name}`.trim(),
                                    })
                                ))
                            )}>
                                <Printer className="w-4 h-4 mr-2" />
                                Print colour labels
                            </Button>
                        )}
                        </div>
                        {product.product_colors.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                                {product.product_colors.map((c) => (
                                    <div key={c.id} className="border border-[var(--color-border)] rounded-xl overflow-hidden bg-[var(--color-surface-elevated)]">
                                        <div className="aspect-[3/4] bg-[var(--color-surface)]">
                                            {c.image_url && <img src={c.image_url} alt={c.color_name} className="w-full h-full object-cover" />}
                                        </div>
                                        <div className="flex items-center justify-between px-3 py-2">
                                            <span className="text-sm font-medium text-[var(--color-text)] truncate">
                                                {c.color_name}{c.pieces ? ` · ${c.pieces} pcs` : ''}
                                                {c.sku && <span className="block font-mono text-xs text-[var(--color-text-muted)]">{c.sku}</span>}
                                            </span>
                                            <button type="button" title="Remove colour" disabled={busy}
                                                onClick={() => removeColor(c.id)}
                                                className="p-1 text-[var(--color-danger-text)] hover:bg-red-500/10 rounded">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add a colour */}
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end p-4 border border-dashed border-[var(--color-border)] rounded-xl">
                            <Input
                                label="Colour"
                                list="color-suggestions"
                                placeholder="e.g. Maroon"
                                value={colorName}
                                onChange={(e) => setColorName(e.target.value)}
                            />
                            <datalist id="color-suggestions">
                                {COLOR_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
                            </datalist>
                            <Input
                                label="Pieces"
                                type="number"
                                min="0"
                                className="sm:w-24"
                                placeholder="0"
                                value={colorPieces}
                                onChange={(e) => setColorPieces(e.target.value)}
                            />
                            <div>
                                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Photo of this colour</label>
                                <input ref={colorInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                                    onChange={(e) => setColorFile(e.target.files?.[0] || null)} />
                                {/* Show the picked photo itself, not its file name */}
                                {colorPreview ? (
                                    <div className="relative w-24 h-32 rounded-lg overflow-hidden border border-[var(--color-border)]">
                                        <img src={colorPreview} alt="Chosen colour" className="w-full h-full object-cover cursor-pointer"
                                            onClick={() => colorInput.current?.click()} />
                                        <button type="button" title="Remove photo"
                                            onClick={() => { setColorFile(null); if (colorInput.current) colorInput.current.value = '' }}
                                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs">✕</button>
                                    </div>
                                ) : (
                                    <button type="button" onClick={() => colorInput.current?.click()}
                                        className="w-24 h-32 rounded-lg border-2 border-dashed border-[var(--color-border)] flex flex-col items-center justify-center gap-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)]">
                                        <ImagePlus className="w-6 h-6" />
                                        Choose photo
                                    </button>
                                )}
                            </div>
                            <Button type="button" variant="primary" disabled={busy} onClick={addColor}>
                                + Add colour
                            </Button>
                        </div>
                    </div>

                    {/* Publish */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
                        <div className="flex items-center gap-2 text-[var(--color-text)]">
                            <Globe className="w-5 h-5" />
                            <span className="font-medium">{product.on_website ? 'Showing on the website' : 'Not on the website yet'}</span>
                        </div>
                        <Button type="button" variant={product.on_website ? 'secondary' : 'primary'} disabled={busy} onClick={toggleWebsite}>
                            {product.on_website ? 'Remove from website' : 'Show on website'}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    )
}
