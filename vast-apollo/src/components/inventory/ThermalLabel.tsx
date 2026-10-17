import type { Product } from '../../lib/api'
// The label sheet opens in a blank window, and that window inherits this page's security
// rules: scripts from this site only, and no inline code at all. So the sheet carries no
// script of its own. Everything is drawn here, in the app, and the window is handed finished
// paper - the barcodes as pictures, the two buttons wired up from this side. It also means
// the shop can still print when its internet is down.
import JsBarcode from 'jsbarcode'
import { jsPDF } from 'jspdf'

/** One barcode, drawn here and handed over as a picture the label window can simply show. */
function barcodePng(value: string, height: number): string {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, value, { format: 'CODE128', width: 2, height, displayValue: false, margin: 0 })
    return canvas.toDataURL('image/png')
}

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

    const labelData = products.map((product) => ({
        shop: shopName,
        sku: product.sku,
        bars: String(product.barcode_no || product.sku),
        name: (product.saree_name || '').slice(0, 28),
        mrp: 'Rs.' + product.selling_price_a.toLocaleString('en-IN'),
        disc: 'Rs.' + product.selling_price_b.toLocaleString('en-IN'),
        code: product.cost_code ? product.cost_code.toUpperCase() : '',
    }))

    const safe = (text: string) => text.trim().replace(/[\/:*?"<>|]/g, '').replace(/\s+/g, '-')
    const fileName = [safe(products[0]?.saree_name || ''), safe(products[0]?.vendor_name || '')]
        .filter(Boolean).join('-') || 'labels'

    const labelsHtml = products.map((product, index) => `
        <div class="label" id="label-${index}">
            <div class="shop-name">${shopName}</div>
            <div class="barcode-container">
                <img class="barcode-img" alt="${product.barcode_no || product.sku}" src="${barcodePng(String(product.barcode_no || product.sku), 30)}">
            </div>
            <div class="sku-text">${product.sku}</div>
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
            <meta name="viewport" content="width=device-width, initial-scale=1">
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
                    padding: 1.5mm 2mm 5.5mm;
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

                .barcode-container img {
                    max-width: 100%;
                    height: auto;
                    max-height: 8mm;
                }

                .sku-text {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 6.5pt;
                    font-weight: bold;
                    letter-spacing: 0.3px;
                    text-align: center;
                    width: 100%;
                    line-height: 1;
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

                @media screen and (max-width: 640px) {
                    .btn-row {
                        flex-direction: column;
                        padding: 0 16px;
                    }

                    .print-btn, .pdf-btn {
                        width: 100%;
                        padding: 14px 16px;
                        font-size: 16px;
                    }
                }

                @media print {
                    .print-header {
                        display: none !important;
                    }

                    html, body {
                        width: 50mm;
                        height: auto;
                        margin: 0;
                        padding: 0;
                    }

                    .labels-container {
                        display: block;
                        margin: 0;
                        padding: 0;
                        gap: 0;
                    }

                    .label {
                        width: 50mm;
                        height: 29.6mm;
                        margin: 0;
                        border: 0;
                        border-radius: 0;
                        break-inside: avoid;
                        page-break-inside: avoid;
                        break-after: page;
                        page-break-after: always;
                    }

                    .label:last-child {
                        break-after: auto;
                        page-break-after: auto;
                    }
                }
            </style>
        </head>
        <body>
            <div class="print-header">
                <h2>Thermal Labels (50mm x 30mm)</h2>
                <p>${products.length} label${products.length > 1 ? 's' : ''} for ATPOS MD80</p>
                <div class="btn-row">
                    <button class="print-btn" id="print-btn" type="button">Print Labels</button>
                    <button class="pdf-btn" id="pdf-btn" type="button">Download PDF</button>
                </div>
            </div>

            <div class="labels-container">
                ${labelsHtml}
            </div>

        </body>
        </html>
    `)
    printWindow.document.close()

    // The buttons are wired from this side. A window opened blank shares this page's origin,
    // so its elements are reachable from here, and a listener added here is this page's code
    // running - which the rules allow, where an onclick="" inside the sheet would not be.
    printWindow.document.getElementById('print-btn')?.addEventListener('click', () => printWindow.print())

    const pdfButton = printWindow.document.getElementById('pdf-btn') as HTMLButtonElement | null
    pdfButton?.addEventListener('click', async () => {
        pdfButton.disabled = true
        try {
            // Each label is drawn straight into the PDF. Screenshotting 40 labels with
            // html2canvas took minutes and looked stuck.
            // 26 mm, not the 30 mm the sticker is sold as: the roll measured 26 mm of face
            // with a 2 mm gap, so a 30 mm page runs past the die-cut, the printer loses the
            // gap and feeds a whole blank sticker while hunting for the next one - a blank
            // between every label. The laptop never showed it because composite_labels.py
            // squeezes the page to 26 mm before sending; a phone prints the PDF as it is.
            // Nothing on the label moves: the lowest line sits at 24.6 mm.
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [26, 50] })

            for (let i = 0; i < labelData.length; i++) {
                pdfButton.textContent = `Generating ${i + 1}/${labelData.length}`
                await new Promise((resolve) => setTimeout(resolve, 0))

                if (i > 0) pdf.addPage([26, 50], 'landscape')
                const L = labelData[i]

                pdf.setFont('helvetica', 'bold')
                pdf.setFontSize(6)
                pdf.text(L.shop, 25, 3, { align: 'center' })

                pdf.addImage(barcodePng(L.bars, 60), 'PNG', 5, 4, 40, 7.5)

                pdf.setFont('courier', 'bold')
                pdf.setFontSize(6.5)
                pdf.text(L.sku, 25, 13.8, { align: 'center' })

                pdf.setFont('helvetica', 'normal')
                pdf.setFontSize(6)
                pdf.text(L.name, 25, 17.3, { align: 'center' })

                pdf.setFont('helvetica', 'bold')
                pdf.setFontSize(8)
                pdf.text('MRP ' + L.mrp, 24, 21.4, { align: 'right' })
                pdf.text('DISC ' + L.disc, 26, 21.4, { align: 'left' })

                if (L.code) {
                    pdf.setFont('courier', 'normal')
                    pdf.setFontSize(5)
                    pdf.text('Code: ' + L.code, 25, 24.6, { align: 'center' })
                }
            }

            const link = printWindow.document.createElement('a')
            link.href = (printWindow as Window & typeof globalThis).URL.createObjectURL(pdf.output('blob'))
            link.download = `${fileName}.pdf`
            printWindow.document.body.appendChild(link)
            link.click()
            setTimeout(() => { (printWindow as Window & typeof globalThis).URL.revokeObjectURL(link.href); link.remove() }, 30_000)
        } catch (err) {
            console.error('PDF generation error:', err)
            alert('Could not build the PDF. Please use Print instead.')
        }
        pdfButton.textContent = 'Download PDF'
        pdfButton.disabled = false
    })
}
