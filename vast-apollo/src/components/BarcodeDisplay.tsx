import Barcode from 'react-barcode'

interface BarcodeDisplayProps {
    value: string
    width?: number
    height?: number
    format?: 'CODE128' | 'CODE39' | 'EAN13' | 'UPC'
    displayValue?: boolean
    fontSize?: number
    margin?: number
}

export function BarcodeDisplay({
    value,
    width = 2,
    height = 50,
    format = 'CODE128',
    displayValue = true,
    fontSize = 14,
    margin = 10
}: BarcodeDisplayProps) {
    return (
        <div className="flex items-center justify-center">
            <Barcode
                value={value}
                format={format}
                width={width}
                height={height}
                displayValue={displayValue}
                fontSize={fontSize}
                margin={margin}
                background="transparent"
                lineColor="var(--barcode-color, #000000)"
            />
        </div>
    )
}
