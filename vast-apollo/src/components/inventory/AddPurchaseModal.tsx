import { useState } from 'react'
import { Button, Input, Modal } from '../ui'
import { vendorBillsApi, type Product } from '../../lib/api'
import { v4 as uuidv4 } from 'uuid'

interface AddPurchaseModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

type ProductEntry = Omit<Product, 'id' | 'created_at' | 'vendor_bill_id' | 'vendor_name' | 'purchase_date' | 'status'>

const INITIAL_PRODUCT: ProductEntry = {
    sku: '',
    cost_price: 0,
    cost_code: '',
    selling_price_a: 0,
    selling_price_b: 0,
    selling_price_c: 0,
    saree_name: '',
    saree_type: '',
    material: '',
    color: '',
    hsn_code: '',
    quantity: 1,
    rack_location: ''
}

export function AddPurchaseModal({ isOpen, onClose, onSuccess }: AddPurchaseModalProps) {
    const [companyName, setCompanyName] = useState('')
    const [billNumber, setBillNumber] = useState('')
    const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0])
    const [items, setItems] = useState<ProductEntry[]>([{ ...INITIAL_PRODUCT }])
    const [isSubmitting, setIsSubmitting] = useState(false)

    // GST fields
    const [vendorGstNumber, setVendorGstNumber] = useState('')
    const [isLocalTransaction, setIsLocalTransaction] = useState(true)

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0)
    const gstRate = isLocalTransaction ? 5.0 : 5.0 // Same 5% total
    const cgstRate = isLocalTransaction ? 2.5 : 0
    const sgstRate = isLocalTransaction ? 2.5 : 0
    const igstRate = isLocalTransaction ? 0 : 5.0
    const gstAmount = (subtotal * gstRate) / 100
    const totalAmount = subtotal + gstAmount

    const generateSKU = () => {
        const shortUuid = uuidv4().split('-')[0].toUpperCase()
        return `S-${shortUuid}`
    }

    // Auto-fill company name from GST number
    const handleGstChange = async (gst: string) => {
        const formatted = gst.toUpperCase()
        setVendorGstNumber(formatted)

        // If GST is complete (15 characters), search for existing vendor
        if (formatted.length === 15) {
            try {
                const bills = await vendorBillsApi.getAll()
                const existingBill = bills.find(b => b.vendor_gst_number === formatted)
                if (existingBill && !companyName) {
                    setCompanyName(existingBill.company_name)
                }
            } catch (err) {
                console.error('Error fetching vendor bills:', err)
            }
        }
    }

    const handleItemChange = (index: number, field: keyof ProductEntry, value: any) => {
        const newItems = [...items]
        newItems[index] = { ...newItems[index], [field]: value }
        setItems(newItems)
    }

    const addItem = () => {
        const lastItem = items[items.length - 1]
        setItems([...items, { ...lastItem, sku: '' }]) // Copy previous item but clear SKU
    }

    const removeItem = (index: number) => {
        if (items.length === 1) return
        setItems(items.filter((_, i) => i !== index))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)

        try {
            // Prepare products
            const productsToCreates = items.map(item => ({
                ...item,
                sku: item.sku || generateSKU(), // Generate SKU if empty
                vendor_name: companyName, // Inherit from bill
                purchase_date: billDate,
                status: 'available' as const,
                saree_name: item.saree_type, // Use saree_type as saree_name
                selling_price: item.selling_price_a, // Backward compatibility
                selling_price_b: item.selling_price_b || item.selling_price_a, // Default to MRP
                selling_price_c: item.selling_price_c || item.selling_price_a  // Default to MRP
            }))

            await vendorBillsApi.create({
                company_name: companyName,
                bill_number: billNumber,
                bill_date: billDate,
                total_amount: totalAmount,
                vendor_gst_number: vendorGstNumber || null,
                is_local_transaction: isLocalTransaction,
                cgst_rate: cgstRate,
                sgst_rate: sgstRate,
                igst_rate: igstRate,
                gst_amount: gstAmount
            }, productsToCreates)

            onSuccess()
            onClose()
            // Reset form
            setCompanyName('')
            setBillNumber('')
            setVendorGstNumber('')
            setIsLocalTransaction(true)
            setItems([{ ...INITIAL_PRODUCT }])
        } catch (err) {
            console.error('Error creating purchase:', err)
            alert('Failed to save purchase bill')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="📥 Stock In (Receive Purchase)" size="lg">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Bill Header */}
                <div className="bg-[var(--color-surface-elevated)] p-4 rounded-xl border border-[var(--color-border)]">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <Input
                            label="Company GST Number"
                            value={vendorGstNumber}
                            onChange={(e) => handleGstChange(e.target.value)}
                            placeholder="e.g. 29ABCDE1234F1Z5"
                            maxLength={15}
                            required
                        />
                        <Input
                            label="Company Name (Vendor)"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            required
                            placeholder="e.g. Saree World"
                        />
                        <Input
                            label="Bill Number"
                            value={billNumber}
                            onChange={(e) => setBillNumber(e.target.value)}
                            placeholder="e.g. INV-2024-001"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                            type="date"
                            label="Bill Date"
                            value={billDate}
                            onChange={(e) => setBillDate(e.target.value)}
                            required
                        />
                        <div className="w-full">
                            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                Transaction Type
                            </label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={isLocalTransaction}
                                        onChange={() => setIsLocalTransaction(true)}
                                        className="w-4 h-4 text-indigo-500"
                                    />
                                    <span className="text-sm">Local State (CGST+SGST)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={!isLocalTransaction}
                                        onChange={() => setIsLocalTransaction(false)}
                                        className="w-4 h-4 text-indigo-500"
                                    />
                                    <span className="text-sm">Outside State (IGST)</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Items List */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-[var(--color-text)]">Products ({items.length})</h3>
                        <Button type="button" variant="secondary" onClick={addItem} size="sm">
                            + Add Item
                        </Button>
                    </div>

                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                        {items.map((item, index) => (
                            <div key={index} className="bg-[var(--color-surface-elevated)] p-4 rounded-xl border border-[var(--color-border)] relative">
                                <span className="absolute top-2 right-2 text-xs font-mono text-[var(--color-text-muted)]">#{index + 1}</span>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                                    <Input
                                        label="Saree Type"
                                        value={item.saree_type}
                                        onChange={(e) => handleItemChange(index, 'saree_type', e.target.value)}
                                        required
                                        placeholder="Type"
                                    />
                                    <Input
                                        label="Material"
                                        value={item.material}
                                        onChange={(e) => handleItemChange(index, 'material', e.target.value)}
                                        required
                                        placeholder="Material"
                                    />
                                    <Input
                                        label="Quantity"
                                        type="number"
                                        value={item.quantity.toString()}
                                        onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                                        min="1"
                                    />
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <Input
                                        label="Cost Price (₹)"
                                        type="number"
                                        value={item.cost_price.toString()}
                                        onChange={(e) => handleItemChange(index, 'cost_price', parseFloat(e.target.value) || 0)}
                                        required
                                    />
                                    <Input
                                        label="Cost Code"
                                        value={item.cost_code || ''}
                                        onChange={(e) => handleItemChange(index, 'cost_code', e.target.value)}
                                        placeholder="e.g. CC-001"
                                    />
                                    <Input
                                        label="MRP (₹)"
                                        type="number"
                                        value={item.selling_price_a.toString()}
                                        onChange={(e) => handleItemChange(index, 'selling_price_a', parseFloat(e.target.value) || 0)}
                                        required
                                    />
                                    <Input
                                        label="Discount Price (₹)"
                                        type="number"
                                        value={item.selling_price_b.toString()}
                                        onChange={(e) => handleItemChange(index, 'selling_price_b', parseFloat(e.target.value) || 0)}
                                    />
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    <Input
                                        label="Price C (₹)"
                                        type="number"
                                        value={item.selling_price_c.toString()}
                                        onChange={(e) => handleItemChange(index, 'selling_price_c', parseFloat(e.target.value) || 0)}
                                    />
                                    <Input
                                        label="HSN Code"
                                        value={item.hsn_code || ''}
                                        onChange={(e) => handleItemChange(index, 'hsn_code', e.target.value)}
                                    />
                                    <div className="flex items-end">
                                        {items.length > 1 && (
                                            <Button type="button" variant="secondary" onClick={() => removeItem(index)} className="!text-red-500 !bg-red-500/10 w-full">
                                                Remove
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer with GST Summary */}
                <div className="space-y-4">
                    {/* GST Summary */}
                    <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-[var(--color-text-muted)]">Subtotal:</span>
                                <span className="font-medium text-[var(--color-text)]">₹{subtotal.toFixed(2)}</span>
                            </div>
                            {isLocalTransaction ? (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-[var(--color-text-muted)]">CGST (2.5%):</span>
                                        <span className="font-medium text-[var(--color-text)]">₹{(gstAmount / 2).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[var(--color-text-muted)]">SGST (2.5%):</span>
                                        <span className="font-medium text-[var(--color-text)]">₹{(gstAmount / 2).toFixed(2)}</span>
                                    </div>
                                </>
                            ) : (
                                <div className="flex justify-between">
                                    <span className="text-[var(--color-text-muted)]">IGST (5%):</span>
                                    <span className="font-medium text-[var(--color-text)]">₹{gstAmount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="col-span-2 border-t border-indigo-500/30 mt-2 pt-2 flex justify-between">
                                <span className="font-semibold text-[var(--color-text)]">Total Amount:</span>
                                <span className="font-bold text-lg text-indigo-500">₹{totalAmount.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
                        <Button type="button" variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" loading={isSubmitting}>
                            💾 Save Purchase Bill
                        </Button>
                    </div>
                </div>
            </form>
        </Modal>
    )
}
