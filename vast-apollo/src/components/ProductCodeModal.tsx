import { Modal, Button } from './ui'
import { BarcodeDisplay } from './BarcodeDisplay'
import type { Product } from '../lib/api'
import { printThermalLabels } from './inventory/ThermalLabel'

interface ProductCodeModalProps {
    isOpen: boolean
    onClose: () => void
    product: Product
}

export function ProductCodeModal({ isOpen, onClose, product }: ProductCodeModalProps) {
    const handlePrint = () => {
        printThermalLabels([product])
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Product Barcode">
            <div className="space-y-6">
                {/* Product Info */}
                <div className="bg-[var(--color-surface)] rounded-lg p-4 print:hidden">
                    <h3 className="font-semibold text-[var(--color-text)] mb-2">
                        {product.saree_name}
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                            <span className="text-[var(--color-text-muted)]">SKU:</span>{' '}
                            <span className="font-mono text-[var(--color-text)]">{product.sku}</span>
                        </div>
                        <div>
                            <span className="text-[var(--color-text-muted)]">Material:</span>{' '}
                            <span className="text-[var(--color-text)]">{product.material}</span>
                        </div>
                        <div>
                            <span className="text-[var(--color-text-muted)]">Price:</span>{' '}
                            <span className="text-[var(--color-text)]">₹{product.selling_price_a}</span>
                        </div>
                    </div>
                </div>

                {/* Printable Barcode Label */}
                <div className="flex justify-center">
                    <div
                        id="barcode-print-content"
                        style={{
                            width: '320px',
                            backgroundColor: '#ffffff',
                            padding: '24px',
                            borderRadius: '12px',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                            border: '2px solid #d1d5db'
                        }}
                    >
                        {/* Shop Name */}
                        <div style={{
                            textAlign: 'center',
                            marginBottom: '16px',
                            paddingBottom: '16px',
                            borderBottom: '2px solid #d1d5db'
                        }}>
                            <h2 style={{
                                fontSize: '20px',
                                fontWeight: 'bold',
                                color: '#000000',
                                margin: 0
                            }}>
                                Lakshmi Saree Mandir
                            </h2>
                        </div>

                        {/* Barcode */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            marginBottom: '16px'
                        }}>
                            <BarcodeDisplay
                                value={product.sku}
                                width={2}
                                height={60}
                                format="CODE128"
                                displayValue={true}
                                fontSize={16}
                            />
                        </div>

                        {/* Price Boxes */}
                        <div style={{
                            display: 'flex',
                            gap: '8px',
                            width: '100%'
                        }}>
                            <div style={{
                                backgroundColor: '#10b981',
                                padding: '12px',
                                borderRadius: '8px',
                                textAlign: 'center',
                                flex: '1',
                                width: '50%'
                            }}>
                                <p style={{
                                    fontSize: '10px',
                                    fontWeight: '700',
                                    textTransform: 'uppercase',
                                    marginBottom: '4px',
                                    color: '#000000',
                                    margin: '0 0 4px 0'
                                }}>MRP</p>
                                <p style={{
                                    fontSize: '20px',
                                    fontWeight: 'bold',
                                    color: '#000000',
                                    margin: 0
                                }}>₹{product.selling_price_a}</p>
                            </div>
                            <div style={{
                                backgroundColor: '#ef4444',
                                padding: '12px',
                                borderRadius: '8px',
                                textAlign: 'center',
                                flex: '1',
                                width: '50%'
                            }}>
                                <p style={{
                                    fontSize: '10px',
                                    fontWeight: '700',
                                    textTransform: 'uppercase',
                                    marginBottom: '4px',
                                    color: '#000000',
                                    margin: '0 0 4px 0'
                                }}>DISCOUNT</p>
                                <p style={{
                                    fontSize: '20px',
                                    fontWeight: 'bold',
                                    color: '#000000',
                                    margin: 0
                                }}>₹{product.selling_price_b}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 print:hidden">
                    <Button
                        variant="primary"
                        onClick={handlePrint}
                        fullWidth
                    >
                        🖨️ Print Label (MD80)
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        fullWidth
                    >
                        Close
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
