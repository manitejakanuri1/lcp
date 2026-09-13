import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/layout/Layout'
import { useAuth } from '../contexts/AuthContext'
import { analyticsApi, type AnalyticsSummary, type DailySale } from '../lib/api'
import { IndianRupee, TrendingUp, ShoppingBag, Package, ShoppingCart, ArrowRight } from 'lucide-react'
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
    const { isFounder, isSalesman } = useAuth()
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
    const [dailySales, setDailySales] = useState<DailySale[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setError(null)
        try {
            const summaryData = await analyticsApi.getSummary()
            if (summaryData && summaryData.length > 0) {
                setSummary(summaryData[0])
            }

            const salesData = await analyticsApi.getDailySales(30)
            if (salesData) {
                setDailySales([...salesData].reverse())
            }
        } catch (err) {
            console.error('Error fetching dashboard data:', err)
            setError('Failed to load dashboard data. Please try again.')
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
        { name: 'Sold', value: summary.total_items_sold, color: '#2563eb' }
    ] : []

    const statCards = summary ? [
        {
            title: 'Total Sales',
            value: formatCurrency(summary.total_sales),
            icon: IndianRupee,
            iconBg: 'bg-emerald-500/10',
            iconColor: 'text-emerald-600 dark:text-emerald-400',
        },
        {
            title: 'Total Profit',
            value: formatCurrency(summary.total_profit),
            icon: TrendingUp,
            iconBg: 'bg-blue-500/10',
            iconColor: 'text-blue-600 dark:text-blue-400',
        },
        {
            title: 'Items Sold',
            value: summary.total_items_sold.toString(),
            icon: ShoppingBag,
            iconBg: 'bg-amber-500/10',
            iconColor: 'text-amber-600 dark:text-amber-400',
        },
        {
            title: 'In Stock',
            value: summary.total_items_in_stock.toString(),
            icon: Package,
            iconBg: 'bg-violet-500/10',
            iconColor: 'text-violet-600 dark:text-violet-400',
        }
    ] : []

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
                            onClick={() => { setError(null); setIsLoading(true); fetchData(); }}
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
            <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
                <div className="mb-6">
                    <h1 className="text-xl font-bold text-[var(--color-text)]">Dashboard</h1>
                    <p className="text-sm text-[var(--color-text-muted)]">Overview of your business performance</p>
                </div>

                {/* Quick POS Access */}
                {(isFounder || isSalesman) && (
                    <Link
                        to="/pos"
                        className="flex items-center gap-4 bg-[var(--color-primary)] text-white rounded-xl p-4 mb-6 hover:opacity-90 transition-opacity group"
                    >
                        <div className="w-11 h-11 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                            <ShoppingCart className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">Open POS</p>
                            <p className="text-xs text-white/70">Start a new sale</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-white/60 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {statCards.map((stat, index) => {
                        const Icon = stat.icon
                        return (
                            <div
                                key={index}
                                className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4 hover:shadow-md transition-shadow"
                            >
                                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${stat.iconBg} mb-3`}>
                                    <Icon className={`w-5 h-5 ${stat.iconColor}`} />
                                </div>
                                <p className="text-xs text-[var(--color-text-muted)] mb-0.5">{stat.title}</p>
                                <p className="text-xl font-bold text-[var(--color-text)]">{stat.value}</p>
                            </div>
                        )
                    })}
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Sales Chart */}
                    <div className="lg:col-span-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Sales Trend (30 Days)</h3>
                        <div className="h-64">
                            {dailySales.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={dailySales}>
                                        <defs>
                                            <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                                                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                        <XAxis
                                            dataKey="sale_date"
                                            stroke="var(--color-text-muted)"
                                            fontSize={11}
                                            tickFormatter={(value) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
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
                                                borderRadius: '8px',
                                                fontSize: '13px',
                                            }}
                                            formatter={(value) => value !== undefined ? [formatCurrency(Number(value)), 'Sales'] : null}
                                            labelFormatter={(label) => new Date(String(label)).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="total_amount"
                                            stroke="#2563eb"
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#colorSales)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-sm text-[var(--color-text-muted)]">
                                    No sales data available
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Stock Distribution */}
                    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Stock Distribution</h3>
                        <div className="h-64">
                            {stockData.some(d => d.value > 0) ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={stockData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={55}
                                            outerRadius={80}
                                            paddingAngle={4}
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
                                                borderRadius: '8px',
                                                fontSize: '13px',
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-sm text-[var(--color-text-muted)]">
                                    No stock data available
                                </div>
                            )}
                        </div>
                        <div className="flex justify-center gap-5 mt-3">
                            {stockData.map((item) => (
                                <div key={item.name} className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-xs text-[var(--color-text-muted)]">
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
