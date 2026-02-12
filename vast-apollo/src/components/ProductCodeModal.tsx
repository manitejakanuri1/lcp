import { Modal, Button } from './ui'
import { BarcodeDisplay } from './BarcodeDisplay'
import type { Product } from '../lib/api'

interface ProductCodeModalProps {
    isOpen: boolean
    onClose: () => void
    product: Product
}

export function ProductCodeModal({ isOpen, onClose, product }: ProductCodeModalProps) {
    const handleDownload = async () => {
        const element = document.getElementById('barcode-print-content')
        if (!element) {
            console.error('Barcode element not found')
            alert('Failed to download barcode. Element not found.')
            return
        }

        try {
            // Import html2canvas dynamically
            const html2canvasModule = await import('html2canvas')
            const html2canvas = html2canvasModule.default || html2canvasModule

            console.log('Generating barcode image...')

            // Convert HTML to canvas with high quality settings
            const canvas = await html2canvas(element, {
                backgroundColor: '#ffffff',
                scale: 3, // Higher resolution for better print quality
                logging: true, // Enable logging for debugging
                useCORS: true,
                allowTaint: true, // Allow tainted canvas
                removeContainer: false,
                imageTimeout: 0,
                onclone: (clonedDoc: Document) => {
                    // Ensure styles are copied
                    const clonedElement = clonedDoc.getElementById('barcode-print-content')
                    if (clonedElement) {
                        clonedElement.style.display = 'block'
                        clonedElement.style.visibility = 'visible'
                    }
                }
            })

            console.log('Canvas created, converting to blob...')

            // Convert canvas to blob and download
            canvas.toBlob((blob) => {
                if (!blob) {
                    console.error('Failed to create blob')
                    alert('Failed to create image. Please try again.')
                    return
                }

                console.log('Blob created, initiating download...')

                // Create download link
                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.download = `${product.sku}-barcode-label.png`
                link.href = url

                // Trigger download
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)

                // Cleanup
                setTimeout(() => URL.revokeObjectURL(url), 1000)

                console.log('Download initiated successfully')
            }, 'image/png', 1.0)
        } catch (error) {
            console.error('Download failed:', error)
            alert(`Failed to download barcode: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }

    const handlePrint = async () => {
        // On mobile, just download instead of printing (to avoid print dialog issues)
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

        if (isMobile) {
            // Mobile: download the image instead
            await handleDownload()
            return
        }

        // Desktop: use print dialog
        const printContent = document.getElementById('barcode-print-content')
        if (!printContent) return

        const barcodeHTML = printContent.querySelector('.barcode-container')?.innerHTML || ''

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
                    function initPrint() {
                        const svg = document.querySelector('svg');
                        if (svg && svg.getAttribute('width')) {
                            setTimeout(() => {
                                window.print();
                                setTimeout(() => window.close(), 500);
                            }, 1000);
                        } else {
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
                        onClick={handleDownload}
                        fullWidth
                    >
                        💾 Download Barcode
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handlePrint}
                        fullWidth
                    >
                        🖨️ Print
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
