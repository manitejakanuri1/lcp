import { useState, useEffect } from 'react'
import { Layout } from '../components/layout/Layout'
import { Input, Button, Modal } from '../components/ui'
import { supabase } from '../lib/supabase'
import { billsApi } from '../lib/api'
import type { AnalyticsSummary, DailySales, Bill } from '../types/database'
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts'

export function Analytics() {
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
    const [dailySales, setDailySales] = useState<DailySales[]>([])
    const [recentBills, setRecentBills] = useState<Bill[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [dateRange, setDateRange] = useState({
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    })
    const [searchBill, setSearchBill] = useState('')
    const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
    const [isEditMode, setIsEditMode] = useState(false)
    const [editFormData, setEditFormData] = useState<Partial<Bill>>({})
    const [isDeleting, setIsDeleting] = useState(false)

    const fetchData = async () => {
        setIsLoading(true)
        try {
            // Fetch analytics summary
            const { data: summaryData } = await supabase.rpc('get_analytics_summary', {
                start_date: dateRange.start,
                end_date: dateRange.end
            } as never) as { data: AnalyticsSummary[] | null }
            if (summaryData && summaryData.length > 0) {
                setSummary(summaryData[0])
            }

            // Fetch daily sales
            const { data: salesData } = await supabase.rpc('get_daily_sales', { days_back: 30 } as never) as { data: DailySales[] | null }
            if (salesData) {
                setDailySales([...salesData].reverse())
            }

            // Fetch recent bills
            const { data: billsData } = await supabase
                .from('bills')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50)

            if (billsData) {
                setRecentBills(billsData)
            }
        } catch (err) {
            console.error('Error fetching analytics:', err)
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

    const filteredBills = recentBills.filter(bill =>
        bill.bill_number.toLowerCase().includes(searchBill.toLowerCase()) ||
        (bill.customer_name && bill.customer_name.toLowerCase().includes(searchBill.toLowerCase())) ||
        (bill.customer_phone && bill.customer_phone.includes(searchBill))
    )

    const profitMargin = summary && summary.total_sales > 0
        ? ((summary.total_profit / summary.total_sales) * 100).toFixed(1)
        : 0

    const handleEditBill = (bill: Bill) => {
        setSelectedBill(bill)
        setEditFormData({
            customer_name: bill.customer_name,
            customer_phone: bill.customer_phone,
            payment_method: bill.payment_method,
            total_amount: bill.total_amount
        })
        setIsEditMode(true)
    }

    const handleUpdateBill = async () => {
        if (!selectedBill) return
        try {
            await billsApi.update(selectedBill.id, editFormData)
            setIsEditMode(false)
            setSelectedBill(null)
            fetchData()
        } catch (err) {
            console.error('Error updating bill:', err)
            alert('Failed to update bill')
        }
    }

    const handleDeleteBill = async (bill: Bill) => {
        if (!confirm(`Delete bill #${bill.bill_number}? This action cannot be undone.`)) return
        setIsDeleting(true)
        try {
            await billsApi.delete(bill.id)
            fetchData()
        } catch (err) {
            console.error('Error deleting bill:', err)
            alert('Failed to delete bill')
        } finally {
            setIsDeleting(false)
        }
    }

    if (isLoading) {
        return (
            <Layout>
                <div className="min-h-[60vh] flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
            </Layout>
        )
    }

    return (
        <Layout>
            <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-[var(--color-text)]">Analytics</h1>
                    <p className="text-[var(--color-text-muted)]">Business performance and insights</p>
                </div>

                {/* Date Range Filter */}
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

                {/* Stats Cards */}
                {summary && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-5">
                            <p className="text-sm text-[var(--color-text-muted)] mb-1">Total Revenue</p>
                            <p className="text-2xl font-bold text-green-500">{formatCurrency(summary.total_sales)}</p>
                        </div>
                        <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-5">
                            <p className="text-sm text-[var(--color-text-muted)] mb-1">Total Cost</p>
                            <p className="text-2xl font-bold text-red-500">{formatCurrency(summary.total_cost)}</p>
                        </div>
                        <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-5">
                            <p className="text-sm text-[var(--color-text-muted)] mb-1">Net Profit</p>
                            <p className="text-2xl font-bold text-indigo-500">{formatCurrency(summary.total_profit)}</p>
                        </div>
                        <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-5">
                            <p className="text-sm text-[var(--color-text-muted)] mb-1">Profit Margin</p>
                            <p className="text-2xl font-bold text-[var(--color-text)]">{profitMargin}%</p>
                        </div>
                    </div>
                )}

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Revenue Chart */}
                    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-6">
                        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">Revenue Trend</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={dailySales}>
                                    <defs>
                                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                    <XAxis
                                        dataKey="sale_date"
                                        stroke="var(--color-text-muted)"
                                        fontSize={11}
                                        tickFormatter={(value) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric' })}
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
                                        formatter={(value) => value !== undefined ? [formatCurrency(Number(value)), 'Revenue'] : null}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="total_amount"
                                        stroke="#10b981"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorRevenue)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Profit Chart */}
                    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-6">
                        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">Daily Profit</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dailySales}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                    <XAxis
                                        dataKey="sale_date"
                                        stroke="var(--color-text-muted)"
                                        fontSize={11}
                                        tickFormatter={(value) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric' })}
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
                                        formatter={(value) => value !== undefined ? [formatCurrency(Number(value)), 'Profit'] : null}
                                    />
                                    <Bar dataKey="total_profit" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Bill History */}
                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-[var(--color-border)] flex flex-col sm:flex-row justify-between gap-4">
                        <h3 className="text-lg font-semibold text-[var(--color-text)]">Bill History</h3>
                        <div className="w-full sm:w-64">
                            <Input
                                placeholder="Search bills..."
                                value={searchBill}
                                onChange={(e) => setSearchBill(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-[var(--color-border)]/30">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-muted)]">Bill #</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-muted)]">Customer</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-muted)]">Date</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-muted)]">Payment</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">Amount</th>
                                    <th className="px-4 py-3 text-center text-sm font-medium text-[var(--color-text-muted)]">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-border)]">
                                {filteredBills.map((bill) => (
                                    <tr key={bill.id} className="hover:bg-[var(--color-border)]/20">
                                        <td className="px-4 py-3 text-sm font-mono text-indigo-500">{bill.bill_number}</td>
                                        <td className="px-4 py-3 text-sm text-[var(--color-text)]">
                                            {bill.customer_name || '-'}
                                            {bill.customer_phone && (
                                                <span className="text-[var(--color-text-muted)] ml-2">({bill.customer_phone})</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-[var(--color-text-muted)]">
                                            {new Date(bill.created_at).toLocaleDateString('en-IN', {
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${bill.payment_method === 'cash' ? 'bg-green-500/10 text-green-500' :
                                                bill.payment_method === 'card' ? 'bg-blue-500/10 text-blue-500' :
                                                    'bg-purple-500/10 text-purple-500'
                                                }`}>
                                                {bill.payment_method}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right font-medium text-[var(--color-text)]">
                                            {formatCurrency(bill.total_amount)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button
                                                    onClick={() => handleEditBill(bill)}
                                                    className="text-blue-500 hover:text-blue-600 text-sm"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteBill(bill)}
                                                    className="text-red-500 hover:text-red-600 text-sm"
                                                    disabled={isDeleting}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredBills.length === 0 && (
                        <div className="p-8 text-center text-[var(--color-text-muted)]">
                            No bills found
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Bill Modal */}
            <Modal isOpen={isEditMode} onClose={() => { setIsEditMode(false); setSelectedBill(null); }} title={`Edit Bill #${selectedBill?.bill_number}`}>
                {selectedBill && (
                    <div className="space-y-4">
                        <Input
                            label="Customer Name"
                            value={editFormData.customer_name || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, customer_name: e.target.value })}
                        />
                        <Input
                            label="Customer Phone"
                            value={editFormData.customer_phone || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, customer_phone: e.target.value })}
                        />
                        <div>
                            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Payment Method</label>
                            <div className="flex gap-2">
                                {(['cash', 'card', 'upi'] as const).map((method) => (
                                    <button
                                        key={method}
                                        onClick={() => setEditFormData({ ...editFormData, payment_method: method })}
                                        className={`flex-1 py-2 rounded-xl font-medium capitalize transition-all ${editFormData.payment_method === method
                                            ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                                            : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]'
                                            }`}
                                    >
                                        {method === 'cash' && '💵 '}{method === 'card' && '💳 '}{method === 'upi' && '📱 '}{method}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <Input
                            label="Total Amount (₹)"
                            type="number"
                            value={editFormData.total_amount?.toString() || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, total_amount: parseFloat(e.target.value) })}
                        />
                        <div className="flex gap-3 pt-4">
                            <Button variant="secondary" fullWidth onClick={() => { setIsEditMode(false); setSelectedBill(null); }}>
                                Cancel
                            </Button>
                            <Button variant="primary" fullWidth onClick={handleUpdateBill}>
                                💾 Save Changes
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </Layout>
    )
}
