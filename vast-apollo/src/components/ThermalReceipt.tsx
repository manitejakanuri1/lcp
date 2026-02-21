import type { Product } from '../lib/api'

interface CartItem {
    product: Product
    quantity: number
}

/**
 * Print an 80mm thermal receipt for ATPOS MD80 Bluetooth printer.
 * Opens a print dialog with a compact receipt sized for 80mm thermal roll paper.
 */
export function printThermalReceipt(
    billNumber: string,
    total: number,
    items: CartItem[],
    customer: string,
    phone: string,
    payment: string
): void {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
        alert('Please allow popups to print receipts')
        return
    }

    const now = new Date()
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

    const subtotal = items.reduce((sum, item) => sum + item.product.selling_price_a * item.quantity, 0)
    const cgst = Math.round(subtotal * 0.025)
    const sgst = Math.round(subtotal * 0.025)

    const itemsHtml = items.map((item, i) => `
        <div class="item">
            <div class="item-header">
                <span class="item-num">${i + 1}.</span>
                <span class="item-name">${item.product.saree_name || 'Unnamed'}</span>
                <span class="item-qty">${item.quantity} pc</span>
            </div>
            <div class="item-detail">
                <span class="item-sku">${item.product.sku}</span>
                <span class="item-amount">&#8377;${(item.product.selling_price_a * item.quantity).toLocaleString('en-IN')}</span>
            </div>
        </div>
    `).join('')

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Receipt - ${billNumber}</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                @page {
                    size: 80mm auto;
                    margin: 3mm;
                }

                body {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 10pt;
                    color: #000;
                    background: #fff;
                    width: 74mm;
                }

                .center { text-align: center; }
                .right { text-align: right; }
                .bold { font-weight: bold; }

                .shop-name {
                    font-size: 14pt;
                    font-weight: bold;
                    text-align: center;
                    letter-spacing: 1px;
                    margin-bottom: 2px;
                }

                .shop-tagline {
                    font-size: 8pt;
                    text-align: center;
                    margin-bottom: 6px;
                }

                .div-solid {
                    border-top: 1.5px solid #000;
                    margin: 4px 0;
                }

                .div-dash {
                    border-top: 1px dashed #000;
                    margin: 4px 0;
                }

                .meta {
                    display: flex;
                    justify-content: space-between;
                    font-size: 9pt;
                    margin: 2px 0;
                }

                .item {
                    margin: 3px 0;
                    font-size: 9pt;
                }

                .item-header {
                    display: flex;
                    gap: 4px;
                }

                .item-num {
                    min-width: 14px;
                    flex-shrink: 0;
                }

                .item-name {
                    flex: 1;
                    font-weight: bold;
                    overflow: hidden;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                }

                .item-qty {
                    white-space: nowrap;
                    flex-shrink: 0;
                }

                .item-detail {
                    display: flex;
                    justify-content: space-between;
                    padding-left: 18px;
                    color: #444;
                    font-size: 8.5pt;
                }

                .total-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 9pt;
                    margin: 2px 0;
                }

                .grand-total {
                    font-size: 13pt;
                    font-weight: bold;
                    display: flex;
                    justify-content: space-between;
                    margin: 3px 0;
                }

                .footer {
                    text-align: center;
                    font-size: 8.5pt;
                    margin-top: 6px;
                    line-height: 1.5;
                }

                /* Screen preview only */
                @media screen {
                    body {
                        background: #f0f0f0;
                        padding: 20px;
                        width: auto;
                    }

                    .receipt-wrapper {
                        background: white;
                        width: 74mm;
                        margin: 0 auto;
                        padding: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                    }

                    .print-header {
                        text-align: center;
                        padding-bottom: 16px;
                        margin-bottom: 12px;
                        border-bottom: 1px solid #ddd;
                    }

                    .print-header h2 {
                        font-family: Arial, sans-serif;
                        font-size: 15px;
                        color: #333;
                    }

                    .print-header p {
                        font-family: Arial, sans-serif;
                        font-size: 11px;
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
                        font-family: Arial, sans-serif;
                        font-size: 13px;
                        cursor: pointer;
                    }

                    .print-btn:hover { background: #4f46e5; }
                }

                @media print {
                    .print-header { display: none !important; }
                    .receipt-wrapper { padding: 0; box-shadow: none; }
                }
            </style>
        </head>
        <body>
            <div class="print-header">
                <h2>Thermal Receipt (80mm)</h2>
                <p>Bill #${billNumber} &mdash; ATPOS MD80</p>
                <button class="print-btn" onclick="window.print()">&#x1F5A8;&#xFE0F; Print Receipt</button>
            </div>

            <div class="receipt-wrapper">
                <div class="shop-name">LAKSHMI SAREE MANDIR</div>
                <div class="shop-tagline">Premium Sarees &amp; Traditional Wear</div>

                <div class="div-solid"></div>

                <div class="meta">
                    <span class="bold">Bill #${billNumber}</span>
                    <span>${dateStr} ${timeStr}</span>
                </div>

                ${customer || phone ? `
                <div class="div-dash"></div>
                ${customer ? `<div class="meta"><span>Customer:</span><span class="bold">${customer}</span></div>` : ''}
                ${phone ? `<div class="meta"><span>Phone:</span><span>${phone}</span></div>` : ''}
                ` : ''}

                <div class="meta">
                    <span>Payment:</span>
                    <span class="bold">${payment.toUpperCase()}</span>
                </div>

                <div class="div-solid"></div>

                ${itemsHtml}

                <div class="div-solid"></div>

                <div class="total-row">
                    <span>Subtotal</span>
                    <span>&#8377;${subtotal.toLocaleString('en-IN')}</span>
                </div>
                <div class="total-row">
                    <span>CGST (2.5%)</span>
                    <span>&#8377;${cgst.toLocaleString('en-IN')}</span>
                </div>
                <div class="total-row">
                    <span>SGST (2.5%)</span>
                    <span>&#8377;${sgst.toLocaleString('en-IN')}</span>
                </div>

                <div class="div-solid"></div>

                <div class="grand-total">
                    <span>TOTAL</span>
                    <span>&#8377;${total.toLocaleString('en-IN')}</span>
                </div>

                <div class="div-solid"></div>

                <div class="footer">
                    <div class="bold">Thank you for shopping with us!</div>
                    <div>Goods once sold will not be</div>
                    <div>taken back or exchanged.</div>
                    <div>Subject to local jurisdiction.</div>
                </div>
            </div>

            <script>
                window.onload = function() { window.print(); }
            <\/script>
        </body>
        </html>
    `)
    printWindow.document.close()
}
