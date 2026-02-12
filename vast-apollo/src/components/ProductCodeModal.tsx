import { useState } from 'react'
import { Modal, Button } from './ui'
import { QRCodeSVG } from 'qrcode.react'
import { BarcodeDisplay } from './BarcodeDisplay'
import type { Product } from '../lib/api'

interface ProductCodeModalProps {
    isOpen: boolean
    onClose: () => void
    product: Product
}

export function ProductCodeModal({ isOpen, onClose, product }: ProductCodeModalProps) {
    const [codeType, setCodeType] = useState<'qr' | 'barcode' | 'both'>('both')

    const handlePrint = () => {
        window.print()
    }

    const handleDownload = (type: 'qr' | 'barcode') => {
        const canvas = document.querySelector(
            type === 'qr' ? 'canvas' : 'svg'
        ) as HTMLCanvasElement | SVGElement

        if (!canvas) return

        let dataUrl: string

        if (type === 'qr') {
            // QR Code is rendered as SVG by qrcode.react, convert to canvas
            const svg = canvas as unknown as SVGSVGElement
            const svgData = new XMLSerializer().serializeToString(svg)
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
            dataUrl = URL.createObjectURL(svgBlob)
        } else {
            // Barcode is SVG
            const svg = canvas as unknown as SVGSVGElement
            const svgData = new XMLSerializer().serializeToString(svg)
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
            dataUrl = URL.createObjectURL(svgBlob)
        }

        const link = document.createElement('a')
        link.download = `${product.sku}-${type}.svg`
        link.href = dataUrl
        link.click()
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Product Codes">
            <div className="space-y-6">
                {/* Toggle Buttons */}
                <div className="flex gap-2 bg-[var(--color-surface)] p-1 rounded-lg">
                    <button
                        onClick={() => setCodeType('qr')}
                        className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
                            codeType === 'qr'
                                ? 'bg-indigo-500 text-white'
                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                        }`}
                    >
                        QR Code
                    </button>
                    <button
                        onClick={() => setCodeType('barcode')}
                        className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
                            codeType === 'barcode'
                                ? 'bg-indigo-500 text-white'
                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                        }`}
                    >
                        Barcode
                    </button>
                    <button
                        onClick={() => setCodeType('both')}
                        className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
                            codeType === 'both'
                                ? 'bg-indigo-500 text-white'
                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                        }`}
                    >
                        Both
                    </button>
                </div>

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

                {/* Code Display Area */}
                <div className="bg-white rounded-lg p-6 print:p-0">
                    <div className="flex flex-col items-center gap-6">
                        {/* QR Code */}
                        {(codeType === 'qr' || codeType === 'both') && (
                            <div className="flex flex-col items-center">
                                <h4 className="text-sm font-medium text-gray-700 mb-3 print:hidden">
                                    QR Code
                                </h4>
                                <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                                    <QRCodeSVG
                                        value={product.sku}
                                        size={200}
                                        level="H"
                                        includeMargin={true}
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-2 font-mono">{product.sku}</p>
                            </div>
                        )}

                        {/* Barcode */}
                        {(codeType === 'barcode' || codeType === 'both') && (
                            <div className="flex flex-col items-center">
                                <h4 className="text-sm font-medium text-gray-700 mb-3 print:hidden">
                                    Barcode (Code128)
                                </h4>
                                <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                                    <BarcodeDisplay
                                        value={product.sku}
                                        width={2}
                                        height={60}
                                        format="CODE128"
                                        displayValue={true}
                                        fontSize={16}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 print:hidden">
                    <Button
                        variant="secondary"
                        onClick={handlePrint}
                        fullWidth
                    >
                        🖨️ Print
                    </Button>
                    {codeType !== 'both' && (
                        <Button
                            variant="secondary"
                            onClick={() => handleDownload(codeType as 'qr' | 'barcode')}
                            fullWidth
                        >
                            💾 Download
                        </Button>
                    )}
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
