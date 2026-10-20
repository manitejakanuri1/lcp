import { useEffect, useRef, useState } from 'react'
import { Layout } from '../components/layout/Layout'
import { Button, Input, Modal } from '../components/ui'
import { productsApi, websiteApi, type WebsiteProduct } from '../lib/api'
import { SAREE_CATEGORIES, categoryLabel } from '../lib/categories'
import { useToast } from '../contexts/ToastContext'
import { Globe, ImagePlus, Pencil, Printer, Trash2 } from 'lucide-react'
import { printThermalLabels } from '../components/inventory/ThermalLabel'
import { useAuth } from '../contexts/AuthContext'
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
                                {/* A saree photo is about 3 wide to 5 tall with the model's face
                                    in the top tenth. A 4:3 box showed only the middle 44% of it,
                                    so every card was a headless saree. Tall box, and contain
                                    rather than cover, everywhere a saree is shown. */}
                                <div className="aspect-[3/4] bg-[var(--color-surface)] flex items-center justify-center">
                                    {p.image_url
                                        ? <img src={p.image_url} alt={p.saree_name || p.sku} className="w-full h-full object-contain" />
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
                                        {p.product_colors.some((c) => !c.image_url) && (
                                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                                                {p.product_colors.filter((c) => !c.image_url).length} without photo
                                            </span>
                                        )}
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
    // Pictures cut out of a vendor colour sheet, waiting to be named and kept
    const [sheet, setSheet] = useState<{ url: string; name: string; pieces: string; keep: boolean; attachTo?: string }[]>([])
    // One picture from the sheet can be the saree's main photo instead of a colour row.
    const [sheetMain, setSheetMain] = useState<number | null>(null)
    const sheetInput = useRef<HTMLInputElement>(null)
    const colorInput = useRef<HTMLInputElement>(null)
    const mainInput = useRef<HTMLInputElement>(null)
    // Gallery: index 0 = main photo, then each colour. A new colour jumps into view.
    const [shown, setShown] = useState(0)
    const [mainColor, setMainColor] = useState(product.color || '')
    const [mainPieces, setMainPieces] = useState(product.main_color_pieces ? String(product.main_color_pieces) : '')
    const preview = sheetMain !== null ? sheet[sheetMain] : null
    const gallery = [
        {
            key: 'main',
            url: preview?.url || product.image_url,
            name: preview ? (preview.name.trim() || 'Chosen main photo') : (product.color || 'Main photo'),
            pieces: preview ? (parseInt(preview.pieces) || 0) : (product.main_color_pieces || 0),
        },
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

    // The colour being corrected, if any: its id plus the two fields as typed so far.
    const [editing, setEditing] = useState<{ id: string; name: string; pieces: string } | null>(null)

    const saveEdit = () => run(async () => {
        if (!editing) return
        if (!editing.name.trim()) {
            addToast('error', 'Type a colour name')
            return
        }
        const saved = await websiteApi.editColor(editing.id, {
            color_name: editing.name.trim(),
            pieces: parseInt(editing.pieces) || 0,
        })
        onChange({
            ...product,
            product_colors: product.product_colors.map((c) => (c.id === saved.id ? saved : c)),
        })
        setEditing(null)
    }, 'Could not save the colour')

    const addColor = () => run(async () => {
        if (!colorName.trim()) {
            addToast('error', 'Type a colour name')
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

    const loadSheet = (file: File) => run(async () => {
        const photos = await websiteApi.splitSheet(file)
        if (!photos.length) {
            addToast('error', 'No pictures found in that file')
            return
        }
        setSheet(photos.map((url) => ({ url, name: '', pieces: '', keep: true, attachTo: '' })))
        setSheetMain(null)
    }, 'Could not read that file')

    // A split colour sheet comes back with the picture bytes written into the address itself.
    // fetch() would treat that as a trip to the network, and the shop only allows the network
    // for itself and the photo store - so the save failed. The bytes are already here; unpack
    // them. Anything that really is an address is still fetched.
    const fileFrom = async (url: string, name: string) => {
        if (url.startsWith('data:')) {
            const base64 = url.slice(url.indexOf(',') + 1)
            const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
            return new File([bytes], name, { type: 'image/jpeg' })
        }
        const blob = await (await fetch(url)).blob()
        return new File([blob], name, { type: 'image/jpeg' })
    }

    const saveSheet = () => run(async () => {
        const main = sheetMain !== null ? sheet[sheetMain] : null
        // The main photo is not also a colour row, or its pieces would be counted twice.
        const attach = sheet.filter((p, i) => p.keep && p.attachTo && i !== sheetMain)
        const chosen = sheet.filter((p, i) => p.keep && !p.attachTo && p.name.trim() && i !== sheetMain)
        if (!chosen.length && !attach.length && !main) {
            addToast('error', 'Tick a picture and type its colour')
            return
        }

        // A picture with no colour name cannot be saved: the website groups sarees by colour
        // and a nameless one would never appear under any of them. It used to be dropped in
        // silence, so a six-picture sheet quietly became four colours and the only clue was
        // the count afterwards. Say which ones, and save nothing until they are dealt with.
        const unnamed = sheet.filter((p, i) => p.keep && !p.attachTo && !p.name.trim() && i !== sheetMain)
        if (unnamed.length) {
            const which = sheet
                .map((p, i) => (unnamed.includes(p) ? i + 1 : 0))
                .filter(Boolean)
                .join(', ')
            addToast('error', `Picture ${which} has no colour name. Type one, or tap the picture to untick it.`)
            return
        }

        let next = { ...product }

        if (main) {
            const res = await productsApi.uploadPhoto(product.id, await fileFrom(main.url, 'main.jpg'))
            next = { ...next, image_url: res.product?.image_url ?? res.image_url }
            if (main.name.trim() || main.pieces) {
                const saved = await websiteApi.update(product.id, {
                    color: main.name.trim(),
                    main_color_pieces: parseInt(main.pieces) || 0,
                })
                next = { ...next, color: saved.color, main_color_pieces: saved.main_color_pieces }
                setMainColor(saved.color || '')
                setMainPieces(saved.main_color_pieces ? String(saved.main_color_pieces) : '')
            }
        }

        let colours = [...product.product_colors]
        for (const item of attach) {
            const saved = await websiteApi.setColorPhoto(item.attachTo as string,
                await fileFrom(item.url, 'colour.jpg'))
            colours = colours.map((c) => c.id === saved.id ? { ...c, image_url: saved.image_url } : c)
        }

        const added = []
        for (const [index, item] of chosen.entries()) {
            const file = await fileFrom(item.url, `colour-${index + 1}.jpg`)
            added.push(await websiteApi.addColor(product.id, item.name.trim(), parseInt(item.pieces) || 0, file))
        }

        onChange({ ...next, product_colors: [...colours, ...added] })
        setSheet([])
        setSheetMain(null)
        addToast('success', [
            main ? 'main photo set' : '',
            added.length ? `${added.length} colour${added.length === 1 ? '' : 's'} added` : '',
            attach.length ? `${attach.length} photo${attach.length === 1 ? '' : 's'} attached` : '',
        ].filter(Boolean).join(', '))
    }, 'Could not save the pictures')

    // One hidden file box serves every colour that still needs a picture.
    const lateInput = useRef<HTMLInputElement>(null)
    const lateFor = useRef<string | null>(null)
    const photoFor = useRef<(colorId: string) => void>(() => { })
    photoFor.current = (colorId: string) => {
        lateFor.current = colorId
        lateInput.current?.click()
    }

    const attachPhoto = (file: File) => run(async () => {
        const id = lateFor.current
        if (!id) return
        const saved = await websiteApi.setColorPhoto(id, file)
        onChange({
            ...product,
            product_colors: product.product_colors.map((c) => c.id === id ? { ...c, image_url: saved.image_url } : c),
        })
        addToast('success', 'Photo saved')
    }, 'Could not save the photo')

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

    const { isSalesman } = useAuth()
    const canEdit = !isSalesman

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
                                ? <img src={current.url} alt={current.name} className="w-full h-full object-contain" />
                                : <span className="text-sm text-[var(--color-text-muted)]">No main photo yet</span>}
                        </div>
                        {gallery.length > 1 && (
                            <div className="flex lg:flex-col gap-2 overflow-auto lg:max-h-[426px]">
                                {gallery.map((g, i) => (
                                    <button key={g.key} type="button" title={g.name} onClick={() => setShown(i)}
                                        className={`shrink-0 w-14 h-[74px] rounded-lg overflow-hidden border-2 ${i === shown ? 'border-[var(--color-primary)]' : 'border-transparent opacity-70'}`}>
                                        {g.url && <img src={g.url} alt={g.name} className="w-full h-full object-contain" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <p className="text-sm font-medium text-[var(--color-text)]">
                        {current.name}{current.pieces ? ` · ${current.pieces} pcs` : ''}
                        {preview && shown === 0 && (
                            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-600">
                                not saved yet
                            </span>
                        )}
                    </p>
                    {canEdit && (
                        <>
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
                        </>
                    )}
                    <p className="text-xs text-[var(--color-text-muted)] font-mono">{product.sku} · {product.quantity} in stock · ₹{product.selling_price_b || product.selling_price_a}</p>
                </div>

                <div className="space-y-6">
                    {/* Category */}
                    <div className={canEdit ? '' : 'hidden'}>
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
                            {/* The main photo carries a colour of its own, kept on the saree
                                rather than as a row. Counting only the rows called a saree
                                with five colours a saree with four. */}
                            Colours ({product.product_colors.length + (product.color ? 1 : 0)})
                            {totalListed > 0 && (
                                <span className="font-normal text-[var(--color-text-muted)]">
                                    {' '}· {gallery.filter((g) => g.pieces).map((g) => `${g.name} ${g.pieces}`).join(' + ')} = {totalListed} of {product.quantity} in stock
                                </span>
                            )}
                        </h3>
                        {(product.product_colors.some((c) => c.sku) || product.main_color_pieces > 0) && (
                            <Button type="button" variant="secondary" onClick={() => printThermalLabels(
                                // The main photo colour has no colour row: it uses the saree's own barcode.
                                [
                                    { sku: product.sku, barcode_no: product.barcode_no, color_name: product.color || '', pieces: product.main_color_pieces || 0 },
                                    ...product.product_colors.filter((c) => c.sku).map((c) => ({ sku: c.sku as string, barcode_no: c.barcode_no, color_name: c.color_name, pieces: c.pieces || 0 })),
                                ].filter((c) => c.pieces > 0).flatMap((c) => Array.from(
                                    { length: c.pieces },
                                    () => ({
                                        ...(product as unknown as Product),
                                        sku: c.sku,
                                        barcode_no: c.barcode_no,
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
                                            {c.image_url ? (
                                                <img src={c.image_url} alt={c.color_name} className="w-full h-full object-contain" />
                                            ) : canEdit ? (
                                                <button type="button" disabled={busy}
                                                    onClick={() => photoFor.current?.(c.id)}
                                                    className="w-full h-full flex flex-col items-center justify-center gap-1 text-xs text-[var(--color-text-muted)] border-2 border-dashed border-[var(--color-border)] rounded-xl hover:border-[var(--color-primary)]">
                                                    <ImagePlus className="w-6 h-6" />
                                                    Add photo
                                                </button>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs text-[var(--color-text-muted)]">
                                                    No photo yet
                                                </div>
                                            )}
                                        </div>
                                        {editing?.id === c.id ? (
                                            <div className="px-3 py-2 space-y-2">
                                                <Input label="Colour" list="color-suggestions" autoFocus
                                                    value={editing.name}
                                                    onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                                                <Input label="Pieces" type="number" min="0"
                                                    value={editing.pieces}
                                                    onChange={(e) => setEditing({ ...editing, pieces: e.target.value })} />
                                                <div className="flex gap-2">
                                                    <Button type="button" fullWidth disabled={busy} onClick={saveEdit}>Save</Button>
                                                    <Button type="button" variant="secondary" disabled={busy}
                                                        onClick={() => setEditing(null)}>Cancel</Button>
                                                </div>
                                            </div>
                                        ) : (
                                        <div className="flex items-center justify-between px-3 py-2">
                                            <span className="text-sm font-medium text-[var(--color-text)] truncate">
                                                {c.color_name}{c.pieces ? ` · ${c.pieces} pcs` : ''}
                                                {c.sku && <span className="block font-mono text-xs text-[var(--color-text-muted)]">{c.sku}</span>}
                                            </span>
                                            {canEdit && (
                                                <span className="flex items-center shrink-0">
                                                    <button type="button" title="Edit colour and pieces" disabled={busy}
                                                        onClick={() => setEditing({ id: c.id, name: c.color_name, pieces: c.pieces ? String(c.pieces) : '' })}
                                                        className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-indigo-500/10 rounded">
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button type="button" title="Remove colour" disabled={busy}
                                                        onClick={() => removeColor(c.id)}
                                                        className="p-1 text-[var(--color-danger-text)] hover:bg-red-500/10 rounded">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </span>
                                            )}
                                        </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <input ref={lateInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) attachPhoto(file)
                                if (lateInput.current) lateInput.current.value = ''
                            }} />

                        {/* Colours from a vendor sheet */}
                        {canEdit && (
                            <div className="mb-4">
                                <input ref={sheetInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) loadSheet(file)
                                        if (sheetInput.current) sheetInput.current.value = ''
                                    }} />
                                <Button type="button" variant="secondary" disabled={busy}
                                    onClick={() => sheetInput.current?.click()}>
                                    <ImagePlus className="w-4 h-4 mr-2" />
                                    Add colours from PDF
                                </Button>

                                {sheet.length > 0 && (
                                    <div className="mt-3 p-4 border border-[var(--color-border)] rounded-xl">
                                        <p className="text-sm text-[var(--color-text-muted)] mb-3">
                                            {sheet.length} picture{sheet.length === 1 ? '' : 's'} found. Type a colour for each one you want to keep,
                                            and mark one as the main photo if you like.
                                        </p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                            {sheet.map((item, i) => (
                                                <div key={i} className={`border rounded-xl overflow-hidden ${item.keep ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)] opacity-60'}`}>
                                                    <button type="button" className="block w-full aspect-[3/4] bg-[var(--color-surface)]"
                                                        onClick={() => setSheet(sheet.map((p, j) => j === i ? { ...p, keep: !p.keep } : p))}>
                                                        <img src={item.url} alt={`Picture ${i + 1}`} className="w-full h-full object-contain" />
                                                    </button>
                                                    <div className="p-2 space-y-2">
                                                        <input list="color-suggestions" placeholder="Colour" value={item.name}
                                                            onChange={(e) => {
                                                                setSheet(sheet.map((p, j) => j === i ? { ...p, name: e.target.value, keep: true } : p))
                                                                if (sheetMain === i) setMainColor(e.target.value)
                                                            }}
                                                            className="w-full px-2 py-1.5 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]" />
                                                        <input type="number" min="0" placeholder="Pieces" value={item.pieces}
                                                            onChange={(e) => {
                                                                setSheet(sheet.map((p, j) => j === i ? { ...p, pieces: e.target.value } : p))
                                                                if (sheetMain === i) setMainPieces(e.target.value)
                                                            }}
                                                            className="w-full px-2 py-1.5 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]" />
                                                        {product.product_colors.some((c) => !c.image_url) && (
                                                            <select value={item.attachTo || ''}
                                                                onChange={(e) => setSheet(sheet.map((p, j) => j === i ? { ...p, attachTo: e.target.value } : p))}
                                                                className="w-full px-2 py-1.5 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]">
                                                                <option value="">New colour</option>
                                                                {product.product_colors.filter((c) => !c.image_url).map((c) => (
                                                                    <option key={c.id} value={c.id}>Photo for {c.color_name}</option>
                                                                ))}
                                                            </select>
                                                        )}
                                                        <label className="flex items-center gap-2 text-xs text-[var(--color-text)]">
                                                            <input type="radio" name="sheet-main" checked={sheetMain === i}
                                                                onChange={() => {
                                                                    const next = sheetMain === i ? null : i
                                                                    setSheetMain(next)
                                                                    setShown(0)
                                                                    if (next !== null) {
                                                                        setMainColor(sheet[next].name.trim())
                                                                        setMainPieces(sheet[next].pieces)
                                                                    }
                                                                }} />
                                                            Main photo
                                                        </label>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-2 mt-3">
                                            <Button type="button" variant="primary" disabled={busy} onClick={saveSheet}>
                                                Save ticked pictures
                                            </Button>
                                            <Button type="button" variant="secondary" disabled={busy} onClick={() => setSheet([])}>
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Add a colour */}
                        <div className={`grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end p-4 border border-dashed border-[var(--color-border)] rounded-xl ${canEdit ? '' : 'hidden'}`}>
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
                                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                                    Photo of this colour <span className="text-[var(--color-text-muted)]">(can wait)</span>
                                </label>
                                <input ref={colorInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                                    onChange={(e) => setColorFile(e.target.files?.[0] || null)} />
                                {/* Show the picked photo itself, not its file name */}
                                {colorPreview ? (
                                    <div className="relative w-24 h-32 rounded-lg overflow-hidden border border-[var(--color-border)]">
                                        <img src={colorPreview} alt="Chosen colour" className="w-full h-full object-contain cursor-pointer"
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
                    <div className={`flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 ${canEdit ? '' : 'hidden'}`}>
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
