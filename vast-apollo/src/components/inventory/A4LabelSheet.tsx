import Barcode from 'react-barcode'
import type { Product } from '../../lib/api'

interface A4LabelSheetProps {
    products: Product[]
    shopName?: string
}

const LABELS_PER_PAGE = 21 // 3 columns × 7 rows

export function printA4Labels(products: Product[], shopName: string = 'LAKSHMI SAREE MANDIR') {
    const totalPages = Math.ceil(products.length / LABELS_PER_PAGE)

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
        alert('Please allow popups to print labels')
        return
    }

    const labelsHtml = products.map((product, index) => {
        const pageBreak = (index > 0 && index % LABELS_PER_PAGE === 0) ? 'page-break-before: always;' : ''
        const isFirstOnPage = index % LABELS_PER_PAGE === 0

        return `
            ${isFirstOnPage && index > 0 ? '<div class="page-break"></div>' : ''}
            <div class="label">
                <div class="shop-name">${shopName}</div>
                <div class="barcode-container">
                    <svg id="barcode-${index}"></svg>
                </div>
                <div class="sku">${product.sku}</div>
                <div class="prices">
                    <span class="price-item"><strong>MRP:</strong> ₹${product.selling_price_a.toLocaleString('en-IN')}</span>
                    <span class="price-item"><strong>Disc:</strong> ₹${(product.selling_price_b || product.selling_price_a).toLocaleString('en-IN')}</span>
                </div>
                <div class="cost-code">${product.cost_code || ''}</div>
            </div>
        `
    }).join('')

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Barcode Labels - A4 Sheet</title>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                @page {
                    size: A4;
                    margin: 10mm 5mm 10mm 5mm;
                }

                body {
                    font-family: Arial, Helvetica, sans-serif;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }

                .labels-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 2mm;
                    width: 100%;
                }

                .page-break {
                    page-break-before: always;
                    grid-column: 1 / -1;
                    height: 0;
                }

                .label {
                    border: 1px solid #ccc;
                    border-radius: 3px;
                    padding: 3mm 2mm;
                    text-align: center;
                    height: 36mm;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    align-items: center;
                    overflow: hidden;
                }

                .shop-name {
                    font-size: 7pt;
                    font-weight: bold;
                    letter-spacing: 0.5px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    width: 100%;
                }

                .barcode-container {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    min-height: 0;
                }

                .barcode-container svg {
                    max-width: 100%;
                    height: auto;
                    max-height: 14mm;
                }

                .sku {
                    font-size: 6.5pt;
                    font-family: 'Courier New', monospace;
                    color: #333;
                    margin-top: 0.5mm;
                }

                .prices {
                    display: flex;
                    justify-content: center;
                    gap: 3mm;
                    font-size: 7pt;
                    margin-top: 0.5mm;
                    width: 100%;
                }

                .price-item {
                    white-space: nowrap;
                }

                .cost-code {
                    font-size: 6.5pt;
                    font-weight: bold;
                    color: #555;
                    margin-top: 0.5mm;
                    letter-spacing: 0.5px;
                }

                @media print {
                    .label {
                        border: 0.5px solid #ddd;
                    }

                    .no-print {
                        display: none !important;
                    }
                }

                .print-header {
                    text-align: center;
                    padding: 10px 0 15px;
                    border-bottom: 1px solid #eee;
                    margin-bottom: 10px;
                }

                .print-header h2 {
                    font-size: 16px;
                    color: #333;
                }

                .print-header p {
                    font-size: 12px;
                    color: #888;
                    margin-top: 4px;
                }

                .print-btn {
                    display: inline-block;
                    margin-top: 10px;
                    padding: 8px 24px;
                    background: #6366f1;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 14px;
                    cursor: pointer;
                }

                .print-btn:hover {
                    background: #4f46e5;
                }
            </style>
        </head>
        <body>
            <div class="print-header no-print">
                <h2>📄 A4 Label Sheet</h2>
                <p>${products.length} labels across ${totalPages} page${totalPages > 1 ? 's' : ''}</p>
                <button class="print-btn" onclick="window.print()">🖨️ Print Labels</button>
            </div>

            <div class="labels-grid">
                ${labelsHtml}
            </div>

            <script>
                // Generate barcodes after page loads
                window.onload = function() {
                    ${products.map((product, index) => `
                        try {
                            JsBarcode("#barcode-${index}", "${product.sku}", {
                                format: "CODE128",
                                width: 1.5,
                                height: 35,
                                displayValue: false,
                                margin: 0
                            });
                        } catch(e) {
                            console.error("Barcode error for ${product.sku}:", e);
                        }
                    `).join('')}
                };
            <\/script>
        </body>
        </html>
    `)
    printWindow.document.close()
}
