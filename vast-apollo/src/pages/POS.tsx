import { useState, useEffect, useRef } from 'react'
import { Layout } from '../components/layout/Layout'
import { Button, Input, Modal } from '../components/ui'
import { productsApi, billsApi, type Product } from '../lib/api'
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { printThermalReceipt } from '../components/ThermalReceipt'

interface CartItem {
    product: Product
    quantity: number
}

export function POS() {
    const [cart, setCart] = useState<CartItem[]>([])
    const [isScanning, setIsScanning] = useState(false)
    const [manualSku, setManualSku] = useState('')
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
    const [customerName, setCustomerName] = useState('')
    const [customerPhone, setCustomerPhone] = useState('')
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi'>('cash')
    const [isProcessing, setIsProcessing] = useState(false)
    const [lastBill, setLastBill] = useState<{ billNumber: string; total: number } | null>(null)
    const [lastBillData, setLastBillData] = useState<{ items: CartItem[]; customer: string; phone: string; payment: string } | null>(null)
    const [error, setError] = useState('')
    const scannerRef = useRef<Html5QrcodeScanner | null>(null)

    useEffect(() => {
        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(console.error)
            }
        }
    }, [])

    const startScanner = () => {
        setIsScanning(true)
        setTimeout(() => {
            const scanner = new Html5QrcodeScanner(
                'qr-reader',
                {
                    fps: 10,
                    qrbox: { width: 300, height: 100 },
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.CODE_39,
                        Html5QrcodeSupportedFormats.EAN_13,
                    ]
                },
                false
            )

            scanner.render(
                (decodedText) => {
                    addToCart(decodedText)
                    scanner.clear()
                    setIsScanning(false)
                },
                (error) => {
                    console.log('QR scan error:', error)
                }
            )

            scannerRef.current = scanner
        }, 100)
    }

    const stopScanner = () => {
        if (scannerRef.current) {
            scannerRef.current.clear().catch(console.error)
            scannerRef.current = null
        }
        setIsScanning(false)
    }

    const addToCart = async (sku: string) => {
        setError('')

        // Check if already in cart
        if (cart.some(item => item.product.sku === sku)) {
            setError('This item is already in the cart')
            return
        }

        try {
            const data = await productsApi.getBySku(sku)

            if (!data || data.status !== 'available') {
                setError('Product not found or already sold')
                return
            }

            setCart([...cart, { product: data, quantity: 1 }])
            setManualSku('')
        } catch (err) {
            setError('Error adding product to cart')
            console.error(err)
        }
    }

    const removeFromCart = (sku: string) => {
        setCart(cart.filter(item => item.product.sku !== sku))
    }

    const updateQuantity = (sku: string, newQty: number) => {
        if (newQty < 1) return
        setCart(cart.map(item =>
            item.product.sku === sku
                ? { ...item, quantity: Math.min(newQty, item.product.quantity || 999) }
                : item
        ))
    }

    const getTotal = () => {
        return cart.reduce((sum, item) => sum + item.product.selling_price_a * item.quantity, 0)
    }

    const getTotalCost = () => {
        return cart.reduce((sum, item) => sum + (item.product.cost_price || 0) * item.quantity, 0)
    }

    const getTotalQuantity = () => {
        return cart.reduce((sum, item) => sum + item.quantity, 0)
    }

    // GST Calculations (5% total = CGST 2.5% + SGST 2.5%)
    const CGST_RATE = 0.025 // 2.5%
    const SGST_RATE = 0.025 // 2.5%
    const getSubtotal = () => getTotal()
    const getCGSTAmount = () => Math.round(getSubtotal() * CGST_RATE)
    const getSGSTAmount = () => Math.round(getSubtotal() * SGST_RATE)
    const getTotalGST = () => getCGSTAmount() + getSGSTAmount()
    const getGrandTotal = () => getSubtotal() + getTotalGST()

    const handleCheckout = async () => {
        if (cart.length === 0) return
        setIsProcessing(true)

        try {
            // Generate bill number
            const { billNumber } = await billsApi.generateNumber()

            // Create bill with items (total includes GST)
            const billData = {
                bill_number: billNumber || '',
                customer_name: customerName || null,
                customer_phone: customerPhone || null,
                salesman_id: null,
                total_amount: getGrandTotal(), // Includes GST
                total_cost: getTotalCost(),
                payment_method: paymentMethod
            }

            const billItems = cart.map(item => ({
                product_id: item.product.id,
                selling_price: item.product.selling_price_a,
                cost_price: item.product.cost_price || 0,
                quantity: item.quantity
            }))

            const bill = await billsApi.create(billData, billItems)

            // Update inventory quantities
            for (const item of cart) {
                const newQty = (item.product.quantity || 1) - item.quantity
                await productsApi.update(item.product.id, {
                    quantity: Math.max(0, newQty),
                    status: newQty <= 0 ? 'sold' : 'available'
                })
            }

            // Save data for printing before clearing
            setLastBillData({ items: [...cart], customer: customerName, phone: customerPhone, payment: paymentMethod })

            // Success!
            setLastBill({ billNumber: bill.bill_number, total: bill.total_amount })
            setCart([])
            setCustomerName('')
            setCustomerPhone('')
            setIsCheckoutOpen(false)
        } catch (err) {
            console.error('Checkout error:', err)
            setError('Error processing checkout')
        } finally {
            setIsProcessing(false)
        }
    }

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(value)
    }


    return (
        <Layout>
            <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-24 md:pb-6">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-[var(--color-text)]">Point of Sale</h1>
                    <p className="text-[var(--color-text-muted)]">Scan product barcode to add to cart</p>
                </div>

                {/* Success Message */}
                {lastBill && (
                    <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <p className="text-[var(--color-success-text)] font-medium">Bill #{lastBill.billNumber} created!</p>
                                <p className="text-sm text-[var(--color-text-muted)]">Total: {formatCurrency(lastBill.total)}</p>
                            </div>
                            <Button variant="ghost" onClick={() => { setLastBill(null); setLastBillData(null); }}>✕</Button>
                        </div>
                        {lastBillData && (
                            <Button
                                variant="primary"
                                fullWidth
                                onClick={() => printThermalReceipt(lastBill.billNumber, lastBill.total, lastBillData.items, lastBillData.customer, lastBillData.phone, lastBillData.payment)}
                            >
                                🖨️ Print Receipt (MD80)
                            </Button>
                        )}
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-between">
                        <p className="text-[var(--color-danger-text)]">{error}</p>
                        <Button variant="ghost" onClick={() => setError('')}>✕</Button>
                    </div>
                )}

                {/* Scanner Section */}
                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-6 mb-6">
                    {isScanning ? (
                        <div>
                            <div id="qr-reader" className="mb-4 rounded-xl overflow-hidden" />
                            <Button variant="secondary" fullWidth onClick={stopScanner}>
                                Cancel Scanning
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <Button
                                variant="primary"
                                size="lg"
                                fullWidth
                                onClick={startScanner}
                            >
                                📷 Scan Barcode
                            </Button>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-[var(--color-border)]" />
                                </div>
                                <div className="relative flex justify-center text-sm">
                                    <span className="px-2 bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]">or</span>
                                </div>
                            </div>

                            <form onSubmit={(e) => { e.preventDefault(); addToCart(manualSku) }} className="flex gap-2">
                                <Input
                                    placeholder="Enter SKU manually (e.g., S-ABC123)"
                                    value={manualSku}
                                    onChange={(e) => setManualSku(e.target.value.toUpperCase())}
                                />
                                <Button type="submit" variant="secondary" disabled={!manualSku}>
                                    Add
                                </Button>
                            </form>
                        </div>
                    )}
                </div>

                {/* Cart */}
                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-[var(--color-border)]">
                        <h2 className="font-semibold text-[var(--color-text)]">Cart ({cart.length} items, {getTotalQuantity()} qty)</h2>
                    </div>

                    {cart.length === 0 ? (
                        <div className="p-8 text-center text-[var(--color-text-muted)]">
                            <p className="text-4xl mb-2">🛒</p>
                            <p>Scan items to add them here</p>
                        </div>
                    ) : (
                        <>
                            <div className="divide-y divide-[var(--color-border)]">
                                {cart.map((item) => (
                                    <div key={item.product.sku} className="p-4">
                                        <div className="flex items-start justify-between mb-2">
                                            <div>
                                                <p className="font-mono text-sm text-[var(--color-accent-text)]">{item.product.sku}</p>
                                                <p className="text-[var(--color-text)]">
                                                    {item.product.saree_name || 'Unnamed'} • {item.product.material}
                                                </p>
                                                <p className="text-xs text-[var(--color-text-muted)]">
                                                    Stock: {item.product.quantity || 1} | Price: {formatCurrency(item.product.selling_price_a)}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => removeFromCart(item.product.sku)}
                                                className="p-2 text-[var(--color-danger-text)] hover:bg-red-500/10 rounded-lg transition-colors"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => updateQuantity(item.product.sku, item.quantity - 1)}
                                                    className="w-8 h-8 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-border)]/50"
                                                >
                                                    -
                                                </button>
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => updateQuantity(item.product.sku, parseInt(e.target.value) || 1)}
                                                    className="w-14 h-8 text-center rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]"
                                                    min="1"
                                                    max={item.product.quantity || 999}
                                                />
                                                <button
                                                    onClick={() => updateQuantity(item.product.sku, item.quantity + 1)}
                                                    className="w-8 h-8 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-border)]/50"
                                                    disabled={item.quantity >= (item.product.quantity || 999)}
                                                >
                                                    +
                                                </button>
                                            </div>
                                            <p className="font-semibold text-[var(--color-text)]">
                                                {formatCurrency(item.product.selling_price_a * item.quantity)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Total */}
                            <div className="p-4 bg-[var(--color-border)]/30">
                                <div className="space-y-2 mb-4">
                                    <div className="flex justify-between text-[var(--color-text-muted)]">
                                        <span>Subtotal</span>
                                        <span>{formatCurrency(getSubtotal())}</span>
                                    </div>
                                    <div className="flex justify-between text-[var(--color-text-muted)]">
                                        <span>CGST (2.5%)</span>
                                        <span>{formatCurrency(getCGSTAmount())}</span>
                                    </div>
                                    <div className="flex justify-between text-[var(--color-text-muted)]">
                                        <span>SGST (2.5%)</span>
                                        <span>{formatCurrency(getSGSTAmount())}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-[var(--color-border)]">
                                        <span className="text-lg font-semibold text-[var(--color-text)]">Grand Total</span>
                                        <span className="text-2xl font-bold text-[var(--color-text)]">
                                            {formatCurrency(getGrandTotal())}
                                        </span>
                                    </div>
                                </div>
                                <Button
                                    variant="primary"
                                    size="lg"
                                    fullWidth
                                    onClick={() => setIsCheckoutOpen(true)}
                                >
                                    Proceed to Checkout
                                </Button>
                            </div>
                        </>
                    )}
                </div>

                {/* Checkout Modal */}
                <Modal isOpen={isCheckoutOpen} onClose={() => setIsCheckoutOpen(false)} title="Checkout">
                    <div className="space-y-4">
                        <Input
                            label="Customer Name (Optional)"
                            placeholder="Enter customer name"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                        />
                        <Input
                            label="Customer Phone (Optional)"
                            placeholder="Enter phone number"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                        />

                        <div>
                            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                Payment Method
                            </label>
                            <div className="flex gap-2">
                                {(['cash', 'card', 'upi'] as const).map((method) => (
                                    <button
                                        key={method}
                                        onClick={() => setPaymentMethod(method)}
                                        className={`
                      flex-1 py-3 rounded-xl font-medium capitalize transition-all
                      ${paymentMethod === method
                                                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                                                : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]'
                                            }
                    `}
                                    >
                                        {method === 'cash' && '💵 '}
                                        {method === 'card' && '💳 '}
                                        {method === 'upi' && '📱 '}
                                        {method}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-[var(--color-border)]">
                            <div className="flex justify-between text-lg font-semibold mb-4">
                                <span>Total Amount</span>
                                <span>{formatCurrency(getTotal())}</span>
                            </div>
                            <Button
                                variant="primary"
                                size="lg"
                                fullWidth
                                loading={isProcessing}
                                onClick={handleCheckout}
                            >
                                Complete Sale
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </Layout>
    )
}
