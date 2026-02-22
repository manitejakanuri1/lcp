import { useState, useEffect } from 'react'
import { Layout } from '../components/layout/Layout'
import { Input, Button } from '../components/ui'
import { reportsApi, type GSTMonthly } from '../lib/api'

export function GSTReport() {
    const [data, setData] = useState<GSTMonthly[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    })

    const fetchData = async () => {
        setIsLoading(true)
        setError(null)
        try {
            const result = await reportsApi.getGST(dateRange.start, dateRange.end)
            setData(result || [])
        } catch (err) {
            console.error('Error fetching GST report:', err)
            setError('Failed to load GST report. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateRange])

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(value)
    }

    const formatMonth = (m: string) => {
        const [year, month] = m.split('-')
        return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-IN', {
            month: 'short', year: 'numeric'
        })
    }

    const totals = data.reduce((acc, m) => ({
        input: acc.input + m.input_total,
        output: acc.output + m.output_total,
        purchases: acc.purchases + m.purchase_total,
        sales: acc.sales + m.sales_total,
    }), { input: 0, output: 0, purchases: 0, sales: 0 })

    const netLiability = totals.output - totals.input

    if (isLoading) {
        return (
            <Layout>
                <div className="min-h-[60vh] flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                </div>
            </Layout>
        )
    }

    if (error) {
        return (
            <Layout>
                <div className="min-h-[60vh] flex items-center justify-center">
                    <div className="text-center">
                        <p className="text-red-500 mb-4">{error}</p>
                        <button
                            onClick={() => { setError(null); fetchData(); }}
                            className="px-4 py-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-border)]/50 transition-colors text-sm text-[var(--color-text)]"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </Layout>
        )
    }

    return (
        <Layout>
            <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-[var(--color-text)]">GST Report</h1>
                    <p className="text-[var(--color-text-muted)]">Input vs Output GST summary (5% rate — 2.5% CGST + 2.5% SGST)</p>
                </div>

                {/* Date Range */}
                <div className="mb-6 flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-[var(--color-text)] mb-1">From</label>
                        <Input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--color-text)] mb-1">To</label>
                        <Input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                        />
                    </div>
                    <Button variant="secondary" onClick={fetchData}>Apply</Button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4">
                        <p className="text-sm text-[var(--color-text-muted)] mb-1">Input GST (Paid on Purchases)</p>
                        <p className="text-2xl font-bold text-red-500">{formatCurrency(totals.input)}</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">Purchases: {formatCurrency(totals.purchases)}</p>
                    </div>
                    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4">
                        <p className="text-sm text-[var(--color-text-muted)] mb-1">Output GST (Collected on Sales)</p>
                        <p className="text-2xl font-bold text-green-500">{formatCurrency(totals.output)}</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">Sales: {formatCurrency(totals.sales)}</p>
                    </div>
                    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4">
                        <p className="text-sm text-[var(--color-text-muted)] mb-1">Net GST Liability</p>
                        <p className={`text-2xl font-bold ${netLiability >= 0 ? 'text-[var(--color-primary)]' : 'text-green-500'}`}>
                            {formatCurrency(Math.abs(netLiability))}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">
                            {netLiability >= 0 ? 'Payable to Government' : 'Input Tax Credit Available'}
                        </p>
                    </div>
                </div>

                {/* Monthly Breakdown Table */}
                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-[var(--color-border)]">
                        <h3 className="text-lg font-semibold text-[var(--color-text)]">Monthly Breakdown</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-[var(--color-border)]/30">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-muted)]">Month</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">Purchases</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">Input CGST</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">Input SGST</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">Input IGST</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">Sales</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">Output CGST</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">Output SGST</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">Net Liability</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-border)]">
                                {data.map((row) => {
                                    const net = row.output_total - row.input_total
                                    return (
                                        <tr key={row.month} className="hover:bg-[var(--color-border)]/20">
                                            <td className="px-4 py-3 text-sm font-medium text-[var(--color-text)]">{formatMonth(row.month)}</td>
                                            <td className="px-4 py-3 text-sm text-right text-[var(--color-text-muted)]">{formatCurrency(row.purchase_total)}</td>
                                            <td className="px-4 py-3 text-sm text-right text-red-500">{formatCurrency(row.input_cgst)}</td>
                                            <td className="px-4 py-3 text-sm text-right text-red-500">{formatCurrency(row.input_sgst)}</td>
                                            <td className="px-4 py-3 text-sm text-right text-red-500">{formatCurrency(row.input_igst)}</td>
                                            <td className="px-4 py-3 text-sm text-right text-[var(--color-text-muted)]">{formatCurrency(row.sales_total)}</td>
                                            <td className="px-4 py-3 text-sm text-right text-green-500">{formatCurrency(row.output_cgst)}</td>
                                            <td className="px-4 py-3 text-sm text-right text-green-500">{formatCurrency(row.output_sgst)}</td>
                                            <td className={`px-4 py-3 text-sm text-right font-medium ${net >= 0 ? 'text-[var(--color-primary)]' : 'text-green-500'}`}>
                                                {net >= 0 ? '' : '-'}{formatCurrency(Math.abs(net))}
                                            </td>
                                        </tr>
                                    )
                                })}
                                {/* Totals row */}
                                {data.length > 0 && (
                                    <tr className="bg-[var(--color-border)]/20 font-semibold">
                                        <td className="px-4 py-3 text-sm text-[var(--color-text)]">Total</td>
                                        <td className="px-4 py-3 text-sm text-right text-[var(--color-text)]">{formatCurrency(totals.purchases)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-red-500">
                                            {formatCurrency(data.reduce((s, r) => s + r.input_cgst, 0))}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right text-red-500">
                                            {formatCurrency(data.reduce((s, r) => s + r.input_sgst, 0))}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right text-red-500">
                                            {formatCurrency(data.reduce((s, r) => s + r.input_igst, 0))}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right text-[var(--color-text)]">{formatCurrency(totals.sales)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-green-500">
                                            {formatCurrency(data.reduce((s, r) => s + r.output_cgst, 0))}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right text-green-500">
                                            {formatCurrency(data.reduce((s, r) => s + r.output_sgst, 0))}
                                        </td>
                                        <td className={`px-4 py-3 text-sm text-right ${netLiability >= 0 ? 'text-[var(--color-primary)]' : 'text-green-500'}`}>
                                            {netLiability >= 0 ? '' : '-'}{formatCurrency(Math.abs(netLiability))}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {data.length === 0 && (
                        <div className="p-8 text-center text-[var(--color-text-muted)]">
                            No GST data found for this period
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    )
}
