import { useState, useEffect } from 'react'
import { Layout } from '../components/layout/Layout'
import { Button, Input, Modal } from '../components/ui'
import { billsApi, type Bill } from '../lib/api'

export function SalesBills() {
    const [bills, setBills] = useState<Bill[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState('')
    const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
    const [isDetailLoading, setIsDetailLoading] = useState(false)
    const [isEditMode, setIsEditMode] = useState(false)
    const [editFormData, setEditFormData] = useState<Partial<Bill>>({})
    const [isDeleting, setIsDeleting] = useState(false)

    useEffect(() => {
        fetchBills()
    }, [])

    const fetchBills = async () => {
        setError(null)
        try {
            const data = await billsApi.getAll()
            setBills(data || [])
        } catch (err) {
            console.error('Error fetching bills:', err)
            setError('Failed to load sales bills. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    const handleBillClick = async (bill: Bill) => {
        setIsDetailLoading(true)
        try {
            const detail = await billsApi.getById(bill.id)
            setSelectedBill(detail)
        } catch (err) {
            console.error('Error fetching bill details:', err)
        } finally {
            setIsDetailLoading(false)
        }
    }

    const handleEditBill = (e: React.MouseEvent, bill: Bill) => {
        e.stopPropagation()
        setSelectedBill(bill)
        setEditFormData({
            customer_name: bill.customer_name,
            customer_phone: bill.customer_phone,
            payment_method: bill.payment_method,
        })
        setIsEditMode(true)
    }

    const handleUpdateBill = async () => {
        if (!selectedBill) return
        try {
            await billsApi.update(selectedBill.id, editFormData)
            setIsEditMode(false)
            setSelectedBill(null)
            fetchBills()
        } catch (err) {
            console.error('Error updating bill:', err)
            alert('Failed to update bill')
        }
    }

    const handleDeleteBill = async (e: React.MouseEvent, bill: Bill) => {
        e.stopPropagation()
        if (!confirm(`Delete bill #${bill.bill_number}? This will restore inventory and cannot be undone.`)) return
        setIsDeleting(true)
        try {
            await billsApi.delete(bill.id)
            fetchBills()
        } catch (err) {
            console.error('Error deleting bill:', err)
            alert('Failed to delete bill')
        } finally {
            setIsDeleting(false)
        }
    }

    const filteredBills = bills.filter((b) =>
        b.bill_number.toLowerCase().includes(filter.toLowerCase()) ||
        (b.customer_name && b.customer_name.toLowerCase().includes(filter.toLowerCase())) ||
        (b.customer_phone && b.customer_phone.includes(filter))
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

    const formatDateTime = (dateStr: string) => {
        try {
            const date = new Date(dateStr)
            return date.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        } catch {
            return dateStr
        }
    }

    const getPaymentBadgeClass = (method: string) => {
        switch (method) {
            case 'cash': return 'bg-green-500/10 text-green-500'
            case 'card': return 'bg-blue-500/10 text-blue-500'
            case 'upi': return 'bg-purple-500/10 text-purple-500'
            default: return 'bg-gray-500/10 text-gray-500'
        }
    }

    // GST calculation for sales: fixed 5% (CGST 2.5% + SGST 2.5%)
    const getGstBreakdown = (totalAmount: number) => {
        const subtotal = Math.round(totalAmount / 1.05)
        const cgst = Math.round(subtotal * 0.025)
        const sgst = Math.round(subtotal * 0.025)
        return { subtotal, cgst, sgst }
    }

    return (
        <Layout>
            <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--color-text)]">Sales Bills</h1>
                        <p className="text-[var(--color-text-muted)]">
                            {bills.length} total bills
                        </p>
                    </div>
                </div>

                {/* Search */}
                <div className="mb-6">
                    <Input
                        placeholder="Search by bill number, customer name, or phone..."
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
                            {filter ? 'No bills match your search' : 'No sales bills yet'}
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
                                            <span className="font-semibold text-[var(--color-text)]">
                                                {bill.customer_name || 'Walk-in Customer'}
                                            </span>
                                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-primary)]/10 text-[var(--color-accent-text)]">
                                                #{bill.bill_number}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-sm text-[var(--color-text-muted)]">
                                            <span>{formatDateTime(bill.created_at)}</span>
                                            {bill.customer_phone && (
                                                <span className="font-mono text-xs">{bill.customer_phone}</span>
                                            )}
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getPaymentBadgeClass(bill.payment_method)}`}>
                                                {bill.payment_method}
                                            </span>
                                            {bill.bill_items && (
                                                <span>{bill.bill_items.length} item{bill.bill_items.length !== 1 ? 's' : ''}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-right shrink-0">
                                            <p className="font-bold text-lg text-[var(--color-text)]">
                                                {formatCurrency(bill.total_amount)}
                                            </p>
                                            {bill.total_cost > 0 && (
                                                <p className="text-xs text-[var(--color-text-muted)]">
                                                    Profit: {formatCurrency(bill.total_amount - bill.total_cost)}
                                                </p>
                                            )}
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
                                    <p className="text-[var(--color-text-muted)]">Bill Number</p>
                                    <p className="font-semibold text-[var(--color-text)]">#{selectedBill.bill_number}</p>
                                </div>
                                <div>
                                    <p className="text-[var(--color-text-muted)]">Date</p>
                                    <p className="font-medium text-[var(--color-text)]">{formatDateTime(selectedBill.created_at)}</p>
                                </div>
                                <div>
                                    <p className="text-[var(--color-text-muted)]">Customer</p>
                                    <p className="font-semibold text-[var(--color-text)]">{selectedBill.customer_name || 'Walk-in Customer'}</p>
                                </div>
                                <div>
                                    <p className="text-[var(--color-text-muted)]">Phone</p>
                                    <p className="font-mono text-sm text-[var(--color-text)]">{selectedBill.customer_phone || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-[var(--color-text-muted)]">Payment Method</p>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getPaymentBadgeClass(selectedBill.payment_method)}`}>
                                        {selectedBill.payment_method}
                                    </span>
                                </div>
                            </div>

                            {/* GST Breakdown */}
                            {(() => {
                                const { subtotal, cgst, sgst } = getGstBreakdown(selectedBill.total_amount)
                                return (
                                    <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-xl p-4">
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-[var(--color-text-muted)]">Subtotal:</span>
                                                <span className="font-medium text-[var(--color-text)]">{formatCurrency(subtotal)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-[var(--color-text-muted)]">CGST (2.5%):</span>
                                                <span className="font-medium text-[var(--color-text)]">{formatCurrency(cgst)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-[var(--color-text-muted)]">SGST (2.5%):</span>
                                                <span className="font-medium text-[var(--color-text)]">{formatCurrency(sgst)}</span>
                                            </div>
                                            <div className="col-span-2 border-t border-[var(--color-primary)]/30 mt-2 pt-2 flex justify-between">
                                                <span className="font-semibold text-[var(--color-text)]">Total:</span>
                                                <span className="font-bold text-lg text-[var(--color-accent-text)]">{formatCurrency(selectedBill.total_amount)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })()}

                            {/* Items */}
                            <div>
                                <h3 className="font-semibold text-[var(--color-text)] mb-3">
                                    Items ({selectedBill.bill_items?.length || 0})
                                </h3>
                                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                                    {selectedBill.bill_items?.map((item, index) => (
                                        <div
                                            key={index}
                                            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="min-w-0">
                                                    {item.products?.sku && (
                                                        <p className="font-mono text-xs text-[var(--color-accent-text)]">{item.products.sku}</p>
                                                    )}
                                                    <p className="font-medium text-[var(--color-text)] truncate">
                                                        {item.products?.saree_name || 'Product'} {item.products?.material ? `- ${item.products.material}` : ''}
                                                    </p>
                                                    {item.products?.color && (
                                                        <p className="text-xs text-[var(--color-text-muted)]">{item.products.color}</p>
                                                    )}
                                                </div>
                                                <div className="text-right shrink-0 ml-3">
                                                    <p className="text-xs text-[var(--color-text-muted)]">Qty: {item.quantity || 1}</p>
                                                    <p className="text-sm text-[var(--color-success-text)]">Sold: {formatCurrency(item.selling_price)}</p>
                                                    <p className="text-sm text-[var(--color-danger-text)]">Cost: {formatCurrency(item.cost_price)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(!selectedBill.bill_items || selectedBill.bill_items.length === 0) && (
                                        <p className="text-center text-[var(--color-text-muted)] py-4">No items found</p>
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
                    title={`Edit Bill #${selectedBill?.bill_number}`}
                >
                    {selectedBill && (
                        <div className="space-y-4">
                            <Input
                                label="Customer Name"
                                value={editFormData.customer_name || ''}
                                onChange={(e) => setEditFormData({ ...editFormData, customer_name: e.target.value })}
                            />
                            <Input
                                label="Customer Phone"
                                value={editFormData.customer_phone || ''}
                                onChange={(e) => setEditFormData({ ...editFormData, customer_phone: e.target.value })}
                            />
                            <div>
                                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Payment Method</label>
                                <div className="flex gap-2">
                                    {(['cash', 'card', 'upi'] as const).map((method) => (
                                        <button
                                            key={method}
                                            onClick={() => setEditFormData({ ...editFormData, payment_method: method })}
                                            className={`flex-1 py-2 rounded-lg font-medium capitalize transition-all ${editFormData.payment_method === method
                                                ? 'bg-[var(--color-primary)] text-white'
                                                : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]'
                                                }`}
                                        >
                                            {method}
                                        </button>
                                    ))}
                                </div>
                            </div>
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
