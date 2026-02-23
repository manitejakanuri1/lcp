import type { Product } from '../../lib/api'

/**
 * Print thermal labels (50mm × 30mm) for ATPOS MD80 80mm Bluetooth printer.
 * Opens a print dialog with labels sized for direct thermal printing.
 * Also supports PDF download for mobile.
 */
export function printThermalLabels(products: Product[], shopName: string = 'LAKSHMI SAREE MANDIR') {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
        alert('Please allow popups to print labels')
        return
    }

    const labelsHtml = products.map((product, index) => `
        <div class="label" id="label-${index}">
            <div class="shop-name">${shopName}</div>
            <div class="barcode-container">
                <svg id="barcode-${index}"></svg>
            </div>
            <div class="saree-name">${product.saree_name || ''}</div>
            <div class="prices">
                <span class="price-mrp">MRP &#8377;${product.selling_price_a.toLocaleString('en-IN')}</span>
                <span class="price-disc">DISC &#8377;${product.selling_price_b.toLocaleString('en-IN')}</span>
            </div>
            ${product.cost_code ? `<div class="cost-code">Code: ${product.cost_code.toUpperCase()}</div>` : ''}
        </div>
    `).join('')

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Thermal Labels</title>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
            <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"><\/script>
            <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"><\/script>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                @page {
                    size: 50mm 30mm;
                    margin: 0;
                }

                body {
                    font-family: Arial, Helvetica, sans-serif;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }

                .label {
                    width: 50mm;
                    height: 30mm;
                    padding: 1.5mm 2mm;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: space-between;
                    page-break-after: always;
                    overflow: hidden;
                    background: white;
                }

                .label:last-child {
                    page-break-after: auto;
                }

                .shop-name {
                    font-size: 5.5pt;
                    font-weight: bold;
                    letter-spacing: 0.3px;
                    text-transform: uppercase;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    width: 100%;
                    text-align: center;
                    line-height: 1;
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
                    max-height: 9mm;
                }

                .saree-name {
                    font-size: 5.5pt;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    width: 100%;
                    text-align: center;
                    line-height: 1;
                }

                .prices {
                    display: flex;
                    justify-content: center;
                    gap: 3mm;
                    width: 100%;
                    line-height: 1;
                }

                .price-mrp, .price-disc {
                    font-size: 7pt;
                    font-weight: bold;
                    white-space: nowrap;
                }

                .cost-code {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 5pt;
                    text-align: center;
                    letter-spacing: 0.5px;
                    line-height: 1;
                }

                /* Screen-only preview styles */
                @media screen {
                    body {
                        background: #f0f0f0;
                        padding: 20px;
                    }

                    .labels-container {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px;
                        justify-content: center;
                    }

                    .label {
                        background: white;
                        border: 1px dashed #ccc;
                        border-radius: 2px;
                        page-break-after: auto;
                    }

                    .print-header {
                        text-align: center;
                        padding: 10px 0 20px;
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

                    .btn-row {
                        display: flex;
                        gap: 10px;
                        justify-content: center;
                        margin-top: 10px;
                        flex-wrap: wrap;
                    }

                    .print-btn, .pdf-btn {
                        display: inline-block;
                        padding: 8px 24px;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        font-size: 14px;
                        cursor: pointer;
                    }

                    .print-btn {
                        background: #6366f1;
                    }

                    .print-btn:hover {
                        background: #4f46e5;
                    }

                    .pdf-btn {
                        background: #059669;
                    }

                    .pdf-btn:hover {
                        background: #047857;
                    }

                    .pdf-btn:disabled {
                        background: #9ca3af;
                        cursor: wait;
                    }
                }

                @media print {
                    .print-header {
                        display: none !important;
                    }

                    .labels-container {
                        display: block;
                    }
                }
            </style>
        </head>
        <body>
            <div class="print-header">
                <h2>Thermal Labels (50mm x 30mm)</h2>
                <p>${products.length} label${products.length > 1 ? 's' : ''} for ATPOS MD80</p>
                <div class="btn-row">
                    <button class="print-btn" onclick="window.print()">Print Labels</button>
                    <button class="pdf-btn" id="pdf-btn" onclick="downloadPDF()">Download PDF</button>
                </div>
            </div>

            <div class="labels-container">
                ${labelsHtml}
            </div>

            <script>
                window.onload = function() {
                    ${products.map((product, index) => `
                        try {
                            JsBarcode("#barcode-${index}", "${product.sku}", {
                                format: "CODE128",
                                width: 1.2,
                                height: 30,
                                displayValue: true,
                                fontSize: 8,
                                margin: 0,
                                textMargin: 1
                            });
                        } catch(e) {
                            console.error("Barcode error for ${product.sku}:", e);
                        }
                    `).join('')}
                };

                async function downloadPDF() {
                    var btn = document.getElementById('pdf-btn');
                    btn.textContent = 'Generating...';
                    btn.disabled = true;

                    try {
                        var { jsPDF } = window.jspdf;
                        // 50mm x 30mm label size
                        var pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [30, 50] });
                        var labels = document.querySelectorAll('.label');
                        var scale = 4; // High resolution

                        for (var i = 0; i < labels.length; i++) {
                            if (i > 0) pdf.addPage([30, 50], 'landscape');

                            var canvas = await html2canvas(labels[i], {
                                scale: scale,
                                backgroundColor: '#ffffff',
                                useCORS: true,
                                logging: false,
                                width: labels[i].offsetWidth,
                                height: labels[i].offsetHeight
                            });

                            var imgData = canvas.toDataURL('image/png');
                            pdf.addImage(imgData, 'PNG', 0, 0, 50, 30);
                        }

                        pdf.save('labels.pdf');
                    } catch(e) {
                        console.error('PDF generation error:', e);
                        alert('Failed to generate PDF. Please try Print instead.');
                    }

                    btn.textContent = 'Download PDF';
                    btn.disabled = false;
                }
            <\/script>
        </body>
        </html>
    `)
    printWindow.document.close()
}
