import { useState, useEffect } from 'react'
import { Layout } from '../components/layout/Layout'
import { Button, Input, Modal } from '../components/ui'
import { vendorBillsApi, type VendorBill, type Product } from '../lib/api'

export function Purchases() {
    const [bills, setBills] = useState<VendorBill[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState('')
    const [selectedBill, setSelectedBill] = useState<(VendorBill & { products: Product[] }) | null>(null)
    const [isDetailLoading, setIsDetailLoading] = useState(false)
    const [isEditMode, setIsEditMode] = useState(false)
    const [editFormData, setEditFormData] = useState<Partial<VendorBill>>({})
    const [isDeleting, setIsDeleting] = useState(false)

    useEffect(() => {
        fetchBills()
    }, [])

    const fetchBills = async () => {
        setError(null)
        try {
            const data = await vendorBillsApi.getAll()
            setBills(data || [])
        } catch (err) {
            console.error('Error fetching bills:', err)
            setError('Failed to load purchase bills. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    const handleBillClick = async (bill: VendorBill) => {
        setIsDetailLoading(true)
        try {
            const detail = await vendorBillsApi.getById(bill.id)
            setSelectedBill(detail)
        } catch (err) {
            console.error('Error fetching bill details:', err)
        } finally {
            setIsDetailLoading(false)
        }
    }

    const handleEditBill = (e: React.MouseEvent, bill: VendorBill) => {
        e.stopPropagation()
        setEditFormData({
            company_name: bill.company_name,
            bill_number: bill.bill_number,
            bill_date: bill.bill_date,
            vendor_gst_number: bill.vendor_gst_number,
            total_amount: bill.total_amount,
            gst_amount: bill.gst_amount,
        })
        setSelectedBill(bill as VendorBill & { products: Product[] })
        setIsEditMode(true)
    }

    const handleUpdateBill = async () => {
        if (!selectedBill) return
        try {
            await vendorBillsApi.update(selectedBill.id, editFormData)
            setIsEditMode(false)
            setSelectedBill(null)
            fetchBills()
        } catch (err) {
            console.error('Error updating bill:', err)
            alert('Failed to update bill')
        }
    }

    const handleDeleteBill = async (e: React.MouseEvent, bill: VendorBill) => {
        e.stopPropagation()
        if (!confirm(`Delete bill from "${bill.company_name}"? This will also delete all associated products and cannot be undone.`)) return
        setIsDeleting(true)
        try {
            await vendorBillsApi.delete(bill.id)
            fetchBills()
        } catch (err) {
            console.error('Error deleting bill:', err)
            alert('Failed to delete bill')
        } finally {
            setIsDeleting(false)
        }
    }

    const filteredBills = bills.filter((b) =>
        b.company_name.toLowerCase().includes(filter.toLowerCase()) ||
        (b.bill_number && b.bill_number.toLowerCase().includes(filter.toLowerCase())) ||
        (b.vendor_gst_number && b.vendor_gst_number.toLowerCase().includes(filter.toLowerCase()))
    )

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(value)
    }

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr)
            return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        } catch {
            return dateStr
        }
    }

    return (
        <Layout>
            <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--color-text)]">Purchase Bills</h1>
                        <p className="text-[var(--color-text-muted)]">
                            {bills.length} total bills
                        </p>
                    </div>
                </div>

                {/* Search */}
                <div className="mb-6">
                    <Input
                        placeholder="Search by company name, bill number, or GST..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>

                {/* Bills List */}
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : error ? (
                    <div className="text-center py-12">
                        <p className="text-red-500 mb-4">{error}</p>
                        <button
                            onClick={() => { setError(null); setIsLoading(true); fetchBills(); }}
                            className="px-4 py-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-border)]/50 transition-colors text-sm text-[var(--color-text)]"
                        >
                            Retry
                        </button>
                    </div>
                ) : filteredBills.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-[var(--color-text-muted)]">
                            {filter ? 'No bills match your search' : 'No purchase bills yet'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredBills.map((bill) => (
                            <div
                                key={bill.id}
                                className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer"
                                onClick={() => handleBillClick(bill)}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-[var(--color-text)]">{bill.company_name}</span>
                                            {bill.bill_number && (
                                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-primary)]/10 text-[var(--color-accent-text)]">
                                                    #{bill.bill_number}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-sm text-[var(--color-text-muted)]">
                                            <span>{formatDate(bill.bill_date)}</span>
                                            {bill.vendor_gst_number && (
                                                <span className="font-mono text-xs">{bill.vendor_gst_number}</span>
                                            )}
                                            <span>
                                                {bill.is_local_transaction ? 'Local (CGST+SGST)' : 'Interstate (IGST)'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-right shrink-0">
                                            <p className="font-bold text-lg text-[var(--color-text)]">
                                                {formatCurrency(bill.total_amount)}
                                            </p>
                                            <p className="text-xs text-[var(--color-text-muted)]">
                                                GST: {formatCurrency(bill.gst_amount)}
                                            </p>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            <button
                                                onClick={(e) => handleEditBill(e, bill)}
                                                className="p-1.5 rounded-lg hover:bg-blue-500/10 text-blue-500 transition-colors text-sm"
                                                title="Edit"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteBill(e, bill)}
                                                className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors text-sm"
                                                title="Delete"
                                                disabled={isDeleting}
                                            >
                                                Del
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Bill Detail Modal */}
                <Modal
                    isOpen={(!!selectedBill && !isEditMode) || isDetailLoading}
                    onClose={() => setSelectedBill(null)}
                    title="Bill Details"
                    size="lg"
                >
                    {isDetailLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-10 h-10 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : selectedBill && (
                        <div className="space-y-6">
                            {/* Bill Header Info */}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-[var(--color-text-muted)]">Company</p>
                                    <p className="font-semibold text-[var(--color-text)]">{selectedBill.company_name}</p>
                                </div>
                                <div>
                                    <p className="text-[var(--color-text-muted)]">Bill Number</p>
                                    <p className="font-semibold text-[var(--color-text)]">{selectedBill.bill_number || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-[var(--color-text-muted)]">Bill Date</p>
                                    <p className="font-medium text-[var(--color-text)]">{formatDate(selectedBill.bill_date)}</p>
                                </div>
                                <div>
                                    <p className="text-[var(--color-text-muted)]">GST Number</p>
                                    <p className="font-mono text-sm text-[var(--color-text)]">{selectedBill.vendor_gst_number || '-'}</p>
                                </div>
                            </div>

                            {/* GST Summary */}
                            <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-xl p-4">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-[var(--color-text-muted)]">Subtotal:</span>
                                        <span className="font-medium text-[var(--color-text)]">
                                            {formatCurrency(selectedBill.total_amount - selectedBill.gst_amount)}
                                        </span>
                                    </div>
                                    {selectedBill.is_local_transaction ? (
                                        <>
                                            <div className="flex justify-between">
                                                <span className="text-[var(--color-text-muted)]">CGST ({selectedBill.cgst_rate}%):</span>
                                                <span className="font-medium text-[var(--color-text)]">{formatCurrency(selectedBill.gst_amount / 2)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-[var(--color-text-muted)]">SGST ({selectedBill.sgst_rate}%):</span>
                                                <span className="font-medium text-[var(--color-text)]">{formatCurrency(selectedBill.gst_amount / 2)}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex justify-between">
                                            <span className="text-[var(--color-text-muted)]">IGST ({selectedBill.igst_rate}%):</span>
                                            <span className="font-medium text-[var(--color-text)]">{formatCurrency(selectedBill.gst_amount)}</span>
                                        </div>
                                    )}
                                    <div className="col-span-2 border-t border-[var(--color-primary)]/30 mt-2 pt-2 flex justify-between">
                                        <span className="font-semibold text-[var(--color-text)]">Total:</span>
                                        <span className="font-bold text-lg text-[var(--color-accent-text)]">{formatCurrency(selectedBill.total_amount)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Products */}
                            <div>
                                <h3 className="font-semibold text-[var(--color-text)] mb-3">
                                    Products ({selectedBill.products?.length || 0})
                                </h3>
                                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                                    {selectedBill.products?.map((product) => (
                                        <div
                                            key={product.id}
                                            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="min-w-0">
                                                    <p className="font-mono text-xs text-[var(--color-accent-text)]">{product.sku}</p>
                                                    <p className="font-medium text-[var(--color-text)] truncate">
                                                        {product.saree_name || 'Unnamed'} - {product.material}
                                                    </p>
                                                    {product.color && (
                                                        <p className="text-xs text-[var(--color-text-muted)]">{product.color}</p>
                                                    )}
                                                </div>
                                                <div className="text-right shrink-0 ml-3">
                                                    <p className="text-xs text-[var(--color-text-muted)]">Qty: {product.quantity}</p>
                                                    <p className="text-sm text-[var(--color-danger-text)]">Cost: {formatCurrency(product.cost_price)}</p>
                                                    <p className="text-sm text-[var(--color-success-text)]">MRP: {formatCurrency(product.selling_price_a)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(!selectedBill.products || selectedBill.products.length === 0) && (
                                        <p className="text-center text-[var(--color-text-muted)] py-4">No products found</p>
                                    )}
                                </div>
                            </div>

                            <Button variant="secondary" fullWidth onClick={() => setSelectedBill(null)}>
                                Close
                            </Button>
                        </div>
                    )}
                </Modal>

                {/* Edit Bill Modal */}
                <Modal
                    isOpen={isEditMode}
                    onClose={() => { setIsEditMode(false); setSelectedBill(null) }}
                    title={`Edit Bill${selectedBill?.bill_number ? ` #${selectedBill.bill_number}` : ''}`}
                >
                    {selectedBill && (
                        <div className="space-y-4">
                            <Input
                                label="Company Name"
                                value={editFormData.company_name || ''}
                                onChange={(e) => setEditFormData({ ...editFormData, company_name: e.target.value })}
                            />
                            <Input
                                label="Bill Number"
                                value={editFormData.bill_number || ''}
                                onChange={(e) => setEditFormData({ ...editFormData, bill_number: e.target.value })}
                            />
                            <Input
                                label="Bill Date"
                                type="date"
                                value={editFormData.bill_date || ''}
                                onChange={(e) => setEditFormData({ ...editFormData, bill_date: e.target.value })}
                            />
                            <Input
                                label="GST Number"
                                value={editFormData.vendor_gst_number || ''}
                                onChange={(e) => setEditFormData({ ...editFormData, vendor_gst_number: e.target.value })}
                            />
                            <Input
                                label="Total Amount"
                                type="number"
                                value={editFormData.total_amount?.toString() || ''}
                                onChange={(e) => setEditFormData({ ...editFormData, total_amount: parseFloat(e.target.value) || 0 })}
                            />
                            <Input
                                label="GST Amount"
                                type="number"
                                value={editFormData.gst_amount?.toString() || ''}
                                onChange={(e) => setEditFormData({ ...editFormData, gst_amount: parseFloat(e.target.value) || 0 })}
                            />
                            <div className="flex gap-3 pt-4">
                                <Button variant="secondary" fullWidth onClick={() => { setIsEditMode(false); setSelectedBill(null) }}>
                                    Cancel
                                </Button>
                                <Button variant="primary" fullWidth onClick={handleUpdateBill}>
                                    Save Changes
                                </Button>
                            </div>
                        </div>
                    )}
                </Modal>
            </div>
        </Layout>
    )
}
