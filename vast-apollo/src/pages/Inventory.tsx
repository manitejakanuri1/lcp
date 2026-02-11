import { useState, useEffect, useRef } from 'react'
import { Layout } from '../components/layout/Layout'
import { Button, Input, Modal } from '../components/ui'
import { productsApi, type Product } from '../lib/api'
import { AddPurchaseModal } from '../components/inventory/AddPurchaseModal'
import { QRCodeSVG } from 'qrcode.react'
import { v4 as uuidv4 } from 'uuid'

export function Inventory() {
    const [products, setProducts] = useState<Product[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [filter, setFilter] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const dateInputRef = useRef<HTMLInputElement>(null)
    const [isEditMode, setIsEditMode] = useState(false)
    const [editFormData, setEditFormData] = useState<Partial<Product>>({})
    const [isDeleting, setIsDeleting] = useState(false)
    const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false)

    // Form state
    const [formData, setFormData] = useState({
        vendor_name: '',
        hsn_code: '',
        purchase_date: new Date().toISOString().split('T')[0],
        cost_price: '',
        cost_code: '',
        selling_price_a: '',
        selling_price_b: '',
        selling_price_c: '',
        saree_name: '',
        saree_type: '',
        material: '',
        color: '',
        quantity: '1',

    })

    useEffect(() => {
        fetchProducts()
    }, [])

    const fetchProducts = async () => {
        try {
            const data = await productsApi.getAll()
            setProducts(data || [])
        } catch (err) {
            console.error('Error fetching products:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const generateSKU = () => {
        const shortUuid = uuidv4().split('-')[0].toUpperCase()
        return `S-${shortUuid}`
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)

        try {
            const newProduct = {
                sku: generateSKU(),
                vendor_name: formData.vendor_name,
                hsn_code: formData.hsn_code || null,
                purchase_date: formData.purchase_date,
                cost_price: parseFloat(formData.cost_price),
                cost_code: formData.cost_code || null,
                selling_price: parseFloat(formData.selling_price_a), // Backwards compatibility
                selling_price_a: parseFloat(formData.selling_price_a),
                selling_price_b: parseFloat(formData.selling_price_b),
                selling_price_c: parseFloat(formData.selling_price_c),
                saree_name: formData.saree_name,
                saree_type: formData.saree_type,
                material: formData.material,
                color: formData.color || null,
                quantity: parseInt(formData.quantity) || 1,
                rack_location: null,
                status: 'available' as const,
                vendor_bill_id: null // Manual entry has no bill
            }

            await productsApi.create(newProduct)

            // Reset form and refresh
            setFormData({
                vendor_name: '',
                hsn_code: '',
                purchase_date: new Date().toISOString().split('T')[0],
                cost_price: '',
                cost_code: '',
                selling_price_a: '',
                selling_price_b: '',
                selling_price_c: '',
                saree_name: '',
                saree_type: '',
                material: '',
                color: '',
                quantity: '1',

            })
            setIsModalOpen(false)
            fetchProducts()
        } catch (err) {
            console.error('Error adding product:', err)
        } finally {
            setIsSubmitting(false)
        }
    }

    const filteredProducts = products.filter((p) =>
        p.sku.toLowerCase().includes(filter.toLowerCase()) ||
        p.saree_type.toLowerCase().includes(filter.toLowerCase()) ||
        p.material.toLowerCase().includes(filter.toLowerCase()) ||
        (p.color && p.color.toLowerCase().includes(filter.toLowerCase()))
    )

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(value)
    }

    const handleEdit = (product: Product) => {
        setEditFormData({
            vendor_name: product.vendor_name,
            hsn_code: product.hsn_code,
            purchase_date: product.purchase_date,
            cost_price: product.cost_price,
            cost_code: product.cost_code,
            selling_price_a: product.selling_price_a,
            selling_price_b: product.selling_price_b,
            selling_price_c: product.selling_price_c,
            saree_name: product.saree_name,
            saree_type: product.saree_type,
            material: product.material,
            quantity: product.quantity,
            rack_location: product.rack_location
        })
        setIsEditMode(true)
    }

    const handleUpdate = async () => {
        if (!selectedProduct) return
        setIsSubmitting(true)

        try {
            await productsApi.update(selectedProduct.id, editFormData)
            setIsEditMode(false)
            setSelectedProduct(null)
            fetchProducts()
        } catch (err) {
            console.error('Error updating product:', err)
            alert('Error updating product')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async (product: Product) => {
        if (!confirm(`Are you sure you want to delete "${product.sku}"? This cannot be undone.`)) {
            return
        }
        setIsDeleting(true)

        try {
            await productsApi.delete(product.id)
            setSelectedProduct(null)
            fetchProducts()
        } catch (err) {
            console.error('Error deleting product:', err)
            alert('Error deleting product')
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <Layout>
            <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--color-text)]">Inventory</h1>
                        <p className="text-[var(--color-text-muted)]">
                            {products.length} total items • {products.filter(p => p.status === 'available').length} available
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setIsPurchaseModalOpen(true)}>
                            📥 Stock In
                        </Button>
                        <Button variant="primary" onClick={() => setIsModalOpen(true)}>
                            + Add Product
                        </Button>
                    </div>
                </div>

                {/* Search */}
                <div className="mb-6">
                    <Input
                        placeholder="Search by SKU, type, material, or color..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>

                {/* Products Grid */}
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : filteredProducts.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-[var(--color-text-muted)]">No products found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredProducts.map((product) => (
                            <div
                                key={product.id}
                                className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-4 hover:shadow-lg transition-shadow cursor-pointer"
                                onClick={() => setSelectedProduct(product)}
                            >
                                <div className="flex gap-4">
                                    {/* QR Code */}
                                    <div className="w-20 h-20 bg-white rounded-lg flex items-center justify-center shrink-0">
                                        <QRCodeSVG value={product.sku} size={72} level="M" />
                                    </div>

                                    {/* Details */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-mono text-sm font-bold text-indigo-500">{product.sku}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${product.status === 'available'
                                                ? 'bg-green-500/10 text-green-500'
                                                : 'bg-red-500/10 text-red-500'
                                                }`}>
                                                {product.status}
                                            </span>
                                            {product.quantity > 1 && (
                                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500">
                                                    Qty: {product.quantity}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[var(--color-text)] font-medium truncate">
                                            {product.saree_type} • {product.material}
                                        </p>
                                        {product.color && (
                                            <p className="text-sm text-[var(--color-text-muted)]">{product.color}</p>
                                        )}
                                        <div className="flex gap-4 mt-2 text-sm">
                                            <span className="text-red-500">Cost: {formatCurrency(product.cost_price)}</span>
                                            <span className="text-green-500">Sell: {formatCurrency(product.selling_price_a)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add Product Modal */}
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Product" size="lg">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                label="Company Name"
                                value={formData.vendor_name}
                                onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                                required
                            />
                            <Input
                                label="HSN Code"
                                placeholder="e.g., 5007"
                                value={formData.hsn_code}
                                onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                            />
                            <div className="w-full">
                                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                                    Purchase Date (DD-MM-YYYY)
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="30-01-2026"
                                        value={formData.purchase_date}
                                        onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                                        className="flex-1 px-4 py-3 text-base bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                        required
                                    />
                                    <input
                                        ref={dateInputRef}
                                        type="date"
                                        onChange={(e) => {
                                            const date = new Date(e.target.value);
                                            const dd = String(date.getDate()).padStart(2, '0');
                                            const mm = String(date.getMonth() + 1).padStart(2, '0');
                                            const yyyy = date.getFullYear();
                                            setFormData({ ...formData, purchase_date: `${dd}-${mm}-${yyyy}` });
                                        }}
                                        className="sr-only"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => dateInputRef.current?.showPicker()}
                                        className="px-4 py-3 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors"
                                    >
                                        📅
                                    </button>
                                </div>
                            </div>
                            <Input
                                type="number"
                                label="Cost Price (₹)"
                                value={formData.cost_price}
                                onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                                required
                                min="0"
                                step="0.01"
                            />
                            <Input
                                label="Cost Code"
                                placeholder="e.g., ABC123"
                                value={formData.cost_code}
                                onChange={(e) => setFormData({ ...formData, cost_code: e.target.value.toUpperCase() })}
                            />
                            <Input
                                label="Saree Name"
                                placeholder="e.g., Kanchipuram Silk"
                                value={formData.saree_name}
                                onChange={(e) => setFormData({ ...formData, saree_name: e.target.value })}
                                required
                            />
                            <Input
                                label="Saree Type"
                                placeholder="e.g., Banarasi, Kanjeevaram"
                                value={formData.saree_type}
                                onChange={(e) => setFormData({ ...formData, saree_type: e.target.value })}
                                required
                            />
                            <Input
                                label="Material"
                                placeholder="e.g., Silk, Cotton"
                                value={formData.material}
                                onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                                required
                            />
                            <Input
                                type="number"
                                label="Quantity"
                                value={formData.quantity}
                                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                required
                                min="1"
                            />

                        </div>

                        {/* Selling Prices Section */}
                        <div className="mt-4 p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
                            <h4 className="text-sm font-semibold text-green-500 mb-3">💰 Selling Prices (₹)</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <Input
                                    type="number"
                                    label="MRP (₹)"
                                    value={formData.selling_price_a}
                                    onChange={(e) => setFormData({ ...formData, selling_price_a: e.target.value })}
                                    required
                                    min="0"
                                    step="0.01"
                                />
                                <Input
                                    type="number"
                                    label="Discount Price"
                                    value={formData.selling_price_b}
                                    onChange={(e) => setFormData({ ...formData, selling_price_b: e.target.value })}
                                    required
                                    min="0"
                                    step="0.01"
                                />
                                <Input
                                    type="number"
                                    label="Price C (Special)"
                                    value={formData.selling_price_c}
                                    onChange={(e) => setFormData({ ...formData, selling_price_c: e.target.value })}
                                    required
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-4">
                            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" variant="primary" loading={isSubmitting}>
                                Add Product
                            </Button>
                        </div>
                    </form>
                </Modal>

                {/* Product Detail Modal */}
                <Modal
                    isOpen={!!selectedProduct}
                    onClose={() => { setSelectedProduct(null); setIsEditMode(false); }}
                    title={isEditMode ? "Edit Product" : "Product Details"}
                    size="md"
                >
                    {selectedProduct && !isEditMode && (
                        <div className="space-y-6">
                            {/* QR Code for printing */}
                            <div className="flex justify-center">
                                <div id="qr-code-label" className="bg-white p-6 rounded-xl shadow-lg border-2 border-gray-300" style={{ width: '280px' }}>
                                    {/* Shop Name Header */}
                                    <div className="text-center mb-3 pb-3 border-b-2 border-gray-300">
                                        <h2 className="text-xl font-bold" style={{ color: '#000' }}>Lakshmi Saree Mandir</h2>
                                    </div>

                                    {/* QR Code */}
                                    <div className="flex justify-center mb-3">
                                        <QRCodeSVG value={selectedProduct.sku} size={140} level="H" />
                                    </div>

                                    {/* SKU */}
                                    <p className="text-center font-mono font-bold text-gray-800 text-sm mb-3">{selectedProduct.sku}</p>

                                    {/* Price Section */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-gradient-to-r from-green-500 to-green-600 text-white px-3 py-2 rounded-lg text-center">
                                            <p className="text-xs font-semibold">MRP</p>
                                            <p className="text-xl font-bold">₹{selectedProduct.selling_price_a}</p>
                                        </div>
                                        <div className="bg-gradient-to-r from-red-500 to-red-600 text-white px-3 py-2 rounded-lg text-center">
                                            <p className="text-xs font-semibold">DISCOUNT</p>
                                            <p className="text-xl font-bold">₹{selectedProduct.selling_price_b}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Print Button */}
                            <div className="flex justify-center">
                                <Button
                                    variant="primary"
                                    onClick={() => window.print()}
                                >
                                    🖨️ Print QR Code Label
                                </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-[var(--color-text-muted)]">Type</p>
                                    <p className="font-medium">{selectedProduct.saree_type}</p>
                                </div>
                                <div>
                                    <p className="text-[var(--color-text-muted)]">Material</p>
                                    <p className="font-medium">{selectedProduct.material}</p>
                                </div>

                                <div>
                                    <p className="text-[var(--color-text-muted)]">Quantity</p>
                                    <p className="font-medium">{selectedProduct.quantity}</p>
                                </div>
                                <div>
                                    <p className="text-[var(--color-text-muted)]">Cost Price</p>
                                    <p className="font-medium text-red-500">{formatCurrency(selectedProduct.cost_price)}</p>
                                </div>
                            </div>

                            {/* Selling Prices */}
                            <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
                                <h4 className="text-sm font-semibold text-green-500 mb-3">💰 Selling Prices</h4>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div>
                                        <p className="text-[var(--color-text-muted)]">MRP</p>
                                        <p className="font-medium text-green-500">{formatCurrency(selectedProduct.selling_price_a)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[var(--color-text-muted)]">Discount Price</p>
                                        <p className="font-medium text-blue-500">{formatCurrency(selectedProduct.selling_price_b)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[var(--color-text-muted)]">Price C</p>
                                        <p className="font-medium text-purple-500">{formatCurrency(selectedProduct.selling_price_c)}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-[var(--color-text-muted)]">Company Name</p>
                                    <p className="font-medium">{selectedProduct.vendor_name}</p>
                                </div>
                                <div>
                                    <p className="text-[var(--color-text-muted)]">HSN Code</p>
                                    <p className="font-medium">{selectedProduct.hsn_code || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-[var(--color-text-muted)]">Status</p>
                                    <p className={`font-medium ${selectedProduct.status === 'available' ? 'text-green-500' : 'text-red-500'}`}>
                                        {selectedProduct.status}
                                    </p>
                                </div>
                            </div>

                            <Button
                                variant="secondary"
                                fullWidth
                                onClick={() => {
                                    // Print QR label
                                    const printWindow = window.open('', '_blank')
                                    if (printWindow) {
                                        printWindow.document.write(`
                      <html>
                        <head>
                          <title>Print QR - ${selectedProduct.sku}</title>
                          <style>
                            body { display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
                            .label { text-align: center; padding: 10mm; }
                            .sku { font-family: monospace; font-weight: bold; margin-top: 5mm; font-size: 14pt; }
                          </style>
                        </head>
                        <body>
                          <div class="label">
                            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${selectedProduct.sku}" />
                            <div class="sku">${selectedProduct.sku}</div>
                          </div>
                          <script>window.onload = () => { window.print(); window.close(); }</script>
                        </body>
                      </html>
                    `)
                                        printWindow.document.close()
                                    }
                                }}
                            >
                                🖨️ Print QR Label
                            </Button>

                            <div className="flex gap-3 mt-3">
                                <Button
                                    variant="secondary"
                                    fullWidth
                                    onClick={() => handleEdit(selectedProduct)}
                                >
                                    ✏️ Edit
                                </Button>
                                <Button
                                    variant="secondary"
                                    fullWidth
                                    onClick={() => handleDelete(selectedProduct)}
                                    loading={isDeleting}
                                    className="!bg-red-500/10 !text-red-500 hover:!bg-red-500/20"
                                >
                                    🗑️ Delete
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Edit Mode */}
                    {isEditMode && selectedProduct && (
                        <div className="space-y-4">
                            <h3 className="font-semibold text-lg">Editing: {selectedProduct.sku}</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Company Name"
                                    value={editFormData.vendor_name || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, vendor_name: e.target.value })}
                                />
                                <Input
                                    label="HSN Code"
                                    value={editFormData.hsn_code || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, hsn_code: e.target.value })}
                                />
                                <Input
                                    label="Saree Name"
                                    value={editFormData.saree_name || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, saree_name: e.target.value })}
                                />
                                <Input
                                    label="Saree Type"
                                    value={editFormData.saree_type || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, saree_type: e.target.value })}
                                />
                                <Input
                                    label="Material"
                                    value={editFormData.material || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, material: e.target.value })}
                                />
                                <Input
                                    type="number"
                                    label="Cost Price (₹)"
                                    value={editFormData.cost_price?.toString() || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, cost_price: parseFloat(e.target.value) })}
                                />
                                <Input
                                    label="Cost Code"
                                    value={editFormData.cost_code || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, cost_code: e.target.value.toUpperCase() })}
                                />
                                <Input
                                    type="number"
                                    label="MRP (₹)"
                                    value={editFormData.selling_price_a?.toString() || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, selling_price_a: parseFloat(e.target.value) })}
                                />
                                <Input
                                    type="number"
                                    label="Discount Price (₹)"
                                    value={editFormData.selling_price_b?.toString() || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, selling_price_b: parseFloat(e.target.value) })}
                                />
                                <Input
                                    type="number"
                                    label="Price C (₹)"
                                    value={editFormData.selling_price_c?.toString() || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, selling_price_c: parseFloat(e.target.value) })}
                                />
                                <Input
                                    type="number"
                                    label="Quantity"
                                    min="1"
                                    value={editFormData.quantity?.toString() || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, quantity: e.target.value ? parseInt(e.target.value) : undefined })}
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <Button
                                    variant="secondary"
                                    fullWidth
                                    onClick={() => setIsEditMode(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    fullWidth
                                    onClick={handleUpdate}
                                    loading={isSubmitting}
                                >
                                    💾 Save Changes
                                </Button>
                            </div>
                        </div>
                    )}
                </Modal>

                <AddPurchaseModal
                    isOpen={isPurchaseModalOpen}
                    onClose={() => setIsPurchaseModalOpen(false)}
                    onSuccess={fetchProducts}
                />
            </div>
        </Layout>
    )
}
