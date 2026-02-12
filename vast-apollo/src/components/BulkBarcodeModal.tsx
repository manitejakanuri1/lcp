import { useState } from 'react'
import { Modal, Button, Input } from './ui'
import { BarcodeDisplay } from './BarcodeDisplay'
import type { Product } from '../lib/api'

interface BarcodeItem {
    product: Product
    quantity: number
}

interface BulkBarcodeModalProps {
    isOpen: boolean
    onClose: () => void
    products: Product[]
}

export function BulkBarcodeModal({ isOpen, onClose, products }: BulkBarcodeModalProps) {
    const [selectedItems, setSelectedItems] = useState<BarcodeItem[]>([])
    const [searchTerm, setSearchTerm] = useState('')

    const addItem = (product: Product) => {
        const existing = selectedItems.find(item => item.product.id === product.id)
        if (existing) {
            setSelectedItems(selectedItems.map(item =>
                item.product.id === product.id
                    ? { ...item, quantity: item.quantity + 1 }
                    : item
            ))
        } else {
            setSelectedItems([...selectedItems, { product, quantity: 1 }])
        }
    }

    const updateQuantity = (productId: string, quantity: number) => {
        if (quantity <= 0) {
            setSelectedItems(selectedItems.filter(item => item.product.id !== productId))
        } else {
            setSelectedItems(selectedItems.map(item =>
                item.product.id === productId
                    ? { ...item, quantity }
                    : item
            ))
        }
    }

    const removeItem = (productId: string) => {
        setSelectedItems(selectedItems.filter(item => item.product.id !== productId))
    }

    const handleDownload = async () => {
        const element = document.getElementById('bulk-barcode-sheet')
        if (!element) {
            alert('Failed to generate barcode sheet.')
            return
        }

        try {
            const html2canvasModule = await import('html2canvas')
            const html2canvas = html2canvasModule.default || html2canvasModule

            console.log('Generating bulk barcode sheet...')

            const canvas = await html2canvas(element, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                useCORS: true,
                allowTaint: true,
                imageTimeout: 0,
            })

            canvas.toBlob((blob) => {
                if (!blob) {
                    alert('Failed to create image. Please try again.')
                    return
                }

                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                const timestamp = new Date().getTime()
                link.download = `bulk-barcodes-${timestamp}.png`
                link.href = url

                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)

                setTimeout(() => URL.revokeObjectURL(url), 1000)
                console.log('Download successful')
            }, 'image/png', 1.0)
        } catch (error) {
            console.error('Download failed:', error)
            alert(`Failed to download: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }

    // Generate array of labels - each product repeated by its quantity
    const labels: Product[] = []
    selectedItems.forEach(item => {
        for (let i = 0; i < item.quantity; i++) {
            labels.push(item.product)
        }
    })

    const filteredProducts = products.filter(p =>
        p.saree_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const totalLabels = labels.length

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Bulk Barcode Generator" size="lg">
            <div className="space-y-4">
                {/* Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                    💡 Add products with quantities to generate a single A4 sheet with all barcodes
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Left: Product Selection */}
                    <div className="space-y-3">
                        <h3 className="font-semibold">Select Products</h3>
                        <Input
                            type="text"
                            placeholder="Search products..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <div className="border rounded-lg max-h-64 overflow-y-auto">
                            {filteredProducts.slice(0, 20).map(product => (
                                <div
                                    key={product.id}
                                    className="p-2 hover:bg-gray-100 cursor-pointer border-b flex justify-between items-center"
                                    onClick={() => addItem(product)}
                                >
                                    <div className="flex-1">
                                        <div className="font-medium text-sm">{product.saree_name}</div>
                                        <div className="text-xs text-gray-500">{product.sku}</div>
                                    </div>
                                    <Button variant="secondary" size="sm">+</Button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Selected Items */}
                    <div className="space-y-3">
                        <h3 className="font-semibold">
                            Selected Items ({totalLabels} labels)
                        </h3>
                        <div className="border rounded-lg max-h-64 overflow-y-auto">
                            {selectedItems.length === 0 ? (
                                <div className="p-4 text-center text-gray-500">
                                    No items selected yet
                                </div>
                            ) : (
                                selectedItems.map(item => (
                                    <div
                                        key={item.product.id}
                                        className="p-2 border-b flex justify-between items-center"
                                    >
                                        <div className="flex-1">
                                            <div className="font-medium text-sm">{item.product.saree_name}</div>
                                            <div className="text-xs text-gray-500">{item.product.sku}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="1"
                                                value={item.quantity}
                                                onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 0)}
                                                className="w-16 px-2 py-1 border rounded text-center"
                                            />
                                            <button
                                                onClick={() => removeItem(item.product.id)}
                                                className="text-red-500 hover:text-red-700"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Summary */}
                {totalLabels > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="text-sm font-semibold text-green-800">
                            Total: {totalLabels} labels ({Math.ceil(totalLabels / 21)} A4 sheet{Math.ceil(totalLabels / 21) > 1 ? 's' : ''})
                        </div>
                    </div>
                )}

                {/* Hidden A4 Sheet */}
                {totalLabels > 0 && (
                    <div
                        id="bulk-barcode-sheet"
                        style={{
                            position: 'absolute',
                            left: '-9999px',
                            width: '210mm',
                            height: '297mm',
                            backgroundColor: '#ffffff',
                            padding: '5mm',
                            boxSizing: 'border-box'
                        }}
                    >
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gridTemplateRows: 'repeat(7, 1fr)',
                            gap: '0',
                            width: '100%',
                            height: '100%'
                        }}>
                            {labels.slice(0, 21).map((product, index) => (
                                <div
                                    key={index}
                                    style={{
                                        border: '2px solid #000000',
                                        backgroundColor: '#ffffff',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '4px',
                                        boxSizing: 'border-box'
                                    }}
                                >
                                    {/* Shop Name */}
                                    <div style={{
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        color: '#000000',
                                        marginBottom: '3px',
                                        textAlign: 'center',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        Lakshmi Saree Mandir
                                    </div>

                                    {/* Barcode */}
                                    <div style={{ marginBottom: '3px' }}>
                                        <BarcodeDisplay
                                            value={product.sku}
                                            width={1.3}
                                            height={28}
                                            format="CODE128"
                                            displayValue={true}
                                            fontSize={9}
                                        />
                                    </div>

                                    {/* Prices */}
                                    <div style={{
                                        display: 'flex',
                                        gap: '3px',
                                        width: '100%',
                                        fontSize: '10px',
                                        color: '#000000'
                                    }}>
                                        <div style={{
                                            flex: 1,
                                            textAlign: 'center',
                                            padding: '2px'
                                        }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '9px' }}>MRP</div>
                                            <div style={{ fontWeight: 'bold' }}>₹{product.selling_price_a}</div>
                                        </div>
                                        <div style={{
                                            flex: 1,
                                            textAlign: 'center',
                                            padding: '2px'
                                        }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '9px' }}>DISC</div>
                                            <div style={{ fontWeight: 'bold' }}>₹{product.selling_price_b}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                    <Button
                        variant="primary"
                        onClick={handleDownload}
                        fullWidth
                        disabled={totalLabels === 0}
                    >
                        📄 Download Barcode Sheet
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
