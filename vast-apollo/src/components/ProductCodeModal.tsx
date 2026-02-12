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
        const printContent = document.getElementById('barcode-print-content')
        if (!printContent) return

        // Clone the barcode content
        const barcodeHTML = printContent.querySelector('.barcode-container')?.innerHTML || ''

        // Create print window with proper mobile support
        const printWindow = window.open('', '_blank', 'width=400,height=600')
        if (!printWindow) return

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Print Barcode - ${product.sku}</title>
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    @media print {
                        @page {
                            margin: 0;
                            size: portrait;
                        }
                        body { margin: 1cm; }
                    }
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        padding: 20px;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        background: #f5f5f5;
                    }
                    .barcode-label {
                        background: white;
                        padding: 24px;
                        border-radius: 12px;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                        border: 2px solid #d1d5db;
                        width: 100%;
                        max-width: 320px;
                    }
                    .shop-name {
                        text-align: center;
                        margin-bottom: 16px;
                        padding-bottom: 16px;
                        border-bottom: 2px solid #d1d5db;
                    }
                    .shop-name h2 {
                        font-size: 20px;
                        font-weight: bold;
                        color: #000;
                        margin: 0;
                    }
                    .barcode-container {
                        display: flex;
                        justify-content: center;
                        margin-bottom: 16px;
                        min-height: 80px;
                    }
                    .barcode-container svg {
                        max-width: 100%;
                        height: auto;
                    }
                    .prices {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 8px;
                    }
                    .price-box {
                        padding: 12px;
                        border-radius: 8px;
                        text-align: center;
                    }
                    .price-box.mrp {
                        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    }
                    .price-box.discount {
                        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                    }
                    .price-label {
                        font-size: 10px;
                        font-weight: 700;
                        text-transform: uppercase;
                        margin-bottom: 4px;
                        color: #000;
                    }
                    .price-value {
                        font-size: 20px;
                        font-weight: bold;
                        color: #000;
                    }
                </style>
            </head>
            <body>
                <div class="barcode-label">
                    <div class="shop-name">
                        <h2>Lakshmi Saree Mandir</h2>
                    </div>
                    <div class="barcode-container">
                        ${barcodeHTML}
                    </div>
                    <div class="prices">
                        <div class="price-box mrp">
                            <p class="price-label">MRP</p>
                            <p class="price-value">₹${product.selling_price_a}</p>
                        </div>
                        <div class="price-box discount">
                            <p class="price-label">DISCOUNT</p>
                            <p class="price-value">₹${product.selling_price_b}</p>
                        </div>
                    </div>
                </div>
                <script>
                    // Wait for all content including SVG to load
                    function initPrint() {
                        // Check if barcode SVG is loaded
                        const svg = document.querySelector('svg');
                        if (svg && svg.getAttribute('width')) {
                            // SVG is ready, wait a bit more then print
                            setTimeout(() => {
                                window.print();
                                setTimeout(() => window.close(), 500);
                            }, 1500);
                        } else {
                            // SVG not ready, retry
                            setTimeout(initPrint, 200);
                        }
                    }

                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', initPrint);
                    } else {
                        initPrint();
                    }
                </script>
            </body>
            </html>
        `)
        printWindow.document.close()
    }

    const handleDownload = () => {
        const element = document.getElementById('barcode-print-content')
        if (!element) return

        // Create a canvas to convert HTML to image
        import('html2canvas').then((html2canvas) => {
            html2canvas.default(element, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
            }).then((canvas) => {
                canvas.toBlob((blob) => {
                    if (!blob) return
                    const url = URL.createObjectURL(blob)
                    const link = document.createElement('a')
                    link.download = `${product.sku}-barcode.png`
                    link.href = url
                    link.click()
                    URL.revokeObjectURL(url)
                })
            })
        }).catch(() => {
            // Fallback: just download the SVG
            const svg = element.querySelector('svg')
            if (!svg) return

            const svgData = new XMLSerializer().serializeToString(svg)
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
            const url = URL.createObjectURL(svgBlob)
            const link = document.createElement('a')
            link.download = `${product.sku}-barcode.svg`
            link.href = url
            link.click()
            URL.revokeObjectURL(url)
        })
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

                {/* Printable Barcode Label */}
                <div className="flex justify-center">
                    <div
                        id="barcode-print-content"
                        className="barcode-label bg-white p-6 rounded-xl shadow-lg border-2 border-gray-300"
                        style={{ width: '320px' }}
                    >
                        {/* Shop Name */}
                        <div className="shop-name text-center mb-3 pb-3 border-b-2 border-gray-300">
                            <h2 className="text-xl font-bold" style={{ color: '#000' }}>
                                Lakshmi Saree Mandir
                            </h2>
                        </div>

                        {/* Barcode */}
                        <div className="barcode-container flex justify-center mb-4">
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
                        <div className="prices grid grid-cols-2 gap-2">
                            <div className="price-box mrp bg-gradient-to-r from-green-500 to-green-600 text-white px-3 py-2 rounded-lg text-center">
                                <p className="price-label text-xs font-semibold">MRP</p>
                                <p className="price-value text-xl font-bold">₹{product.selling_price_a}</p>
                            </div>
                            <div className="price-box discount bg-gradient-to-r from-red-500 to-red-600 text-white px-3 py-2 rounded-lg text-center">
                                <p className="price-label text-xs font-semibold">DISCOUNT</p>
                                <p className="price-value text-xl font-bold">₹{product.selling_price_b}</p>
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
