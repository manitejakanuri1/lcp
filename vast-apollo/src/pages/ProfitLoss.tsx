import { useState, useEffect } from 'react'
import { Layout } from '../components/layout/Layout'
import { Input, Button } from '../components/ui'
import { reportsApi, type ProfitLossReport } from '../lib/api'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts'

export function ProfitLoss() {
    const [report, setReport] = useState<ProfitLossReport | null>(null)
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
            const result = await reportsApi.getProfitLoss(dateRange.start, dateRange.end)
            setReport(result)
        } catch (err) {
            console.error('Error fetching P&L report:', err)
            setError('Failed to load Profit & Loss report. Please try again.')
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

    const totals = report?.totals || { revenue: 0, cogs: 0, gross_profit: 0, expenses: 0, net_profit: 0 }
    const months = report?.months || []

    const chartData = months.map(m => ({
        month: formatMonth(m.month),
        Revenue: m.revenue,
        COGS: m.cogs,
        Expenses: m.expenses,
        'Net Profit': m.net_profit,
    }))

    return (
        <Layout>
            <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-[var(--color-text)]">Profit & Loss</h1>
                    <p className="text-[var(--color-text-muted)]">Revenue, costs, and profitability overview</p>
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
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4">
                        <p className="text-sm text-[var(--color-text-muted)] mb-1">Revenue</p>
                        <p className="text-2xl font-bold text-green-500">{formatCurrency(totals.revenue)}</p>
                    </div>
                    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4">
                        <p className="text-sm text-[var(--color-text-muted)] mb-1">Cost of Goods</p>
                        <p className="text-2xl font-bold text-red-500">{formatCurrency(totals.cogs)}</p>
                    </div>
                    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4">
                        <p className="text-sm text-[var(--color-text-muted)] mb-1">Gross Profit</p>
                        <p className="text-2xl font-bold text-blue-500">{formatCurrency(totals.gross_profit)}</p>
                    </div>
                    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4">
                        <p className="text-sm text-[var(--color-text-muted)] mb-1">Expenses</p>
                        <p className="text-2xl font-bold text-orange-500">{formatCurrency(totals.expenses)}</p>
                    </div>
                    <div className="col-span-2 lg:col-span-1 bg-[var(--color-surface-elevated)] border-2 border-[var(--color-primary)] rounded-xl p-4">
                        <p className="text-sm text-[var(--color-text-muted)] mb-1">Net Profit</p>
                        <p className={`text-2xl font-bold ${totals.net_profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {formatCurrency(totals.net_profit)}
                        </p>
                        {totals.revenue > 0 && (
                            <p className="text-xs text-[var(--color-text-muted)] mt-1">
                                Margin: {((totals.net_profit / totals.revenue) * 100).toFixed(1)}%
                            </p>
                        )}
                    </div>
                </div>

                {/* Chart */}
                {chartData.length > 0 && (
                    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-5 mb-8">
                        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">Monthly Overview</h3>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                    <XAxis
                                        dataKey="month"
                                        stroke="var(--color-text-muted)"
                                        fontSize={11}
                                    />
                                    <YAxis
                                        stroke="var(--color-text-muted)"
                                        fontSize={11}
                                        tickFormatter={(value) => `₹${value / 1000}k`}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'var(--color-surface-elevated)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: '8px'
                                        }}
                                        formatter={(value) => value !== undefined ? [formatCurrency(Number(value))] : null}
                                    />
                                    <Legend />
                                    <Bar dataKey="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="COGS" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Expenses" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

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
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">Revenue</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">COGS</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">Gross Profit</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">Expenses</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">Net Profit</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-border)]">
                                {months.map((row) => (
                                    <tr key={row.month} className="hover:bg-[var(--color-border)]/20">
                                        <td className="px-4 py-3 text-sm font-medium text-[var(--color-text)]">{formatMonth(row.month)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-green-500">{formatCurrency(row.revenue)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-red-500">{formatCurrency(row.cogs)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-blue-500">{formatCurrency(row.gross_profit)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-orange-500">{formatCurrency(row.expenses)}</td>
                                        <td className={`px-4 py-3 text-sm text-right font-semibold ${row.net_profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            {formatCurrency(row.net_profit)}
                                        </td>
                                    </tr>
                                ))}
                                {/* Totals row */}
                                {months.length > 0 && (
                                    <tr className="bg-[var(--color-border)]/20 font-semibold">
                                        <td className="px-4 py-3 text-sm text-[var(--color-text)]">Total</td>
                                        <td className="px-4 py-3 text-sm text-right text-green-500">{formatCurrency(totals.revenue)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-red-500">{formatCurrency(totals.cogs)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-blue-500">{formatCurrency(totals.gross_profit)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-orange-500">{formatCurrency(totals.expenses)}</td>
                                        <td className={`px-4 py-3 text-sm text-right ${totals.net_profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            {formatCurrency(totals.net_profit)}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {months.length === 0 && (
                        <div className="p-8 text-center text-[var(--color-text-muted)]">
                            No data found for this period
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    )
}
