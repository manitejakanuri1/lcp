import { useState, useEffect } from 'react'
import { Layout } from '../components/layout/Layout'
import { analyticsApi, type AnalyticsSummary, type DailySale } from '../lib/api'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts'

export function Dashboard() {
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
    const [dailySales, setDailySales] = useState<DailySale[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            // Fetch analytics summary
            const summaryData = await analyticsApi.getSummary()
            if (summaryData && summaryData.length > 0) {
                setSummary(summaryData[0])
            }

            // Fetch daily sales
            const salesData = await analyticsApi.getDailySales(30)
            if (salesData) {
                setDailySales([...salesData].reverse())
            }
        } catch (err) {
            console.error('Error fetching dashboard data:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(value)
    }

    const stockData = summary ? [
        { name: 'In Stock', value: summary.total_items_in_stock, color: '#10b981' },
        { name: 'Sold', value: summary.total_items_sold, color: '#6366f1' }
    ] : []

    const statCards = summary ? [
        {
            title: 'Total Sales',
            value: formatCurrency(summary.total_sales),
            icon: '💰',
            color: 'from-green-500 to-emerald-500'
        },
        {
            title: 'Total Profit',
            value: formatCurrency(summary.total_profit),
            icon: '📈',
            color: 'from-indigo-500 to-purple-500'
        },
        {
            title: 'Items Sold',
            value: summary.total_items_sold.toString(),
            icon: '🛍️',
            color: 'from-orange-500 to-amber-500'
        },
        {
            title: 'In Stock',
            value: summary.total_items_in_stock.toString(),
            icon: '📦',
            color: 'from-blue-500 to-cyan-500'
        }
    ] : []

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
                    <h1 className="text-2xl font-bold text-[var(--color-text)]">Dashboard</h1>
                    <p className="text-[var(--color-text-muted)]">Overview of your business performance</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {statCards.map((stat, index) => (
                        <div
                            key={index}
                            className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-5 hover:shadow-lg transition-shadow"
                        >
                            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} mb-4`}>
                                <span className="text-2xl">{stat.icon}</span>
                            </div>
                            <p className="text-sm text-[var(--color-text-muted)] mb-1">{stat.title}</p>
                            <p className="text-2xl font-bold text-[var(--color-text)]">{stat.value}</p>
                        </div>
                    ))}
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Sales Chart */}
                    <div className="lg:col-span-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-6">
                        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">Sales Trend (30 Days)</h3>
                        <div className="h-72">
                            {dailySales.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={dailySales}>
                                        <defs>
                                            <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                        <XAxis
                                            dataKey="sale_date"
                                            stroke="var(--color-text-muted)"
                                            fontSize={12}
                                            tickFormatter={(value) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                        />
                                        <YAxis
                                            stroke="var(--color-text-muted)"
                                            fontSize={12}
                                            tickFormatter={(value) => `₹${value / 1000}k`}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'var(--color-surface-elevated)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: '8px'
                                            }}
                                            formatter={(value) => value !== undefined ? [formatCurrency(Number(value)), 'Sales'] : null}
                                            labelFormatter={(label) => new Date(String(label)).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="total_amount"
                                            stroke="#6366f1"
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#colorSales)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-[var(--color-text-muted)]">
                                    No sales data available
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Stock Distribution */}
                    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-6">
                        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">Stock Distribution</h3>
                        <div className="h-72">
                            {stockData.some(d => d.value > 0) ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={stockData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={90}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {stockData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'var(--color-surface-elevated)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: '8px'
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-[var(--color-text-muted)]">
                                    No stock data available
                                </div>
                            )}
                        </div>
                        <div className="flex justify-center gap-6 mt-4">
                            {stockData.map((item) => (
                                <div key={item.name} className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-sm text-[var(--color-text-muted)]">
                                        {item.name}: {item.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    )
}
