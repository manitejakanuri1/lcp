import { Modal, Button } from './ui'
import { BarcodeDisplay } from './BarcodeDisplay'
import type { Product } from '../lib/api'

interface ProductCodeModalProps {
    isOpen: boolean
    onClose: () => void
    product: Product
}

export function ProductCodeModal({ isOpen, onClose, product }: ProductCodeModalProps) {
    const handlePrint = () => {
        window.print()
    }

    const handleDownload = () => {
        const svg = document.querySelector('svg.barcode-svg') as SVGElement
        if (!svg) return

        const svgData = new XMLSerializer().serializeToString(svg)
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
        const dataUrl = URL.createObjectURL(svgBlob)

        const link = document.createElement('a')
        link.download = `${product.sku}-barcode.svg`
        link.href = dataUrl
        link.click()
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Product Barcode">
            <div className="space-y-6">
                {/* Product Info */}
                <div className="bg-[var(--color-surface)] rounded-lg p-4">
                    <h3 className="font-semibold text-[var(--color-text)] mb-2">
                        {product.saree_name}
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                            <span className="text-[var(--color-text-muted)]">SKU:</span>{' '}
                            <span className="font-mono text-[var(--color-text)]">{product.sku}</span>
                        </div>
                        <div>
                            <span className="text-[var(--color-text-muted)]">Type:</span>{' '}
                            <span className="text-[var(--color-text)]">{product.saree_type}</span>
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

                {/* Barcode Display */}
                <div className="bg-white rounded-lg p-6 print:p-0">
                    <div className="flex flex-col items-center">
                        <h4 className="text-sm font-medium text-gray-700 mb-4 print:hidden">
                            Barcode (Code128)
                        </h4>
                        <div className="bg-white p-6 rounded-lg border-2 border-gray-200">
                            <BarcodeDisplay
                                value={product.sku}
                                width={2}
                                height={80}
                                format="CODE128"
                                displayValue={true}
                                fontSize={18}
                            />
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
                        🖨️ Print Barcode
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleDownload}
                        fullWidth
                    >
                        💾 Download
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
