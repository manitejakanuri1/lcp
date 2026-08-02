import { useState, useEffect } from 'react'
import { Layout } from '../components/layout/Layout'
import { Input, Button, Modal } from '../components/ui'
import { expensesApi, type Expense } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Plus, Pencil, Trash2 } from 'lucide-react'

const CATEGORIES = ['Rent', 'Salary', 'Electricity', 'Transport', 'Packaging', 'Miscellaneous'] as const

export function Expenses() {
    const { isFounder } = useAuth()
    const { addToast } = useToast()
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    })
    const [categoryFilter, setCategoryFilter] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
    const [formData, setFormData] = useState({
        category: 'Miscellaneous' as string,
        description: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0]
    })

    const fetchExpenses = async () => {
        setIsLoading(true)
        setError(null)
        try {
            const data = await expensesApi.getAll({
                startDate: dateRange.start,
                endDate: dateRange.end,
                category: categoryFilter || undefined,
            })
            setExpenses(data || [])
        } catch (err) {
            console.error('Error fetching expenses:', err)
            setError('Failed to load expenses. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchExpenses()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateRange, categoryFilter])

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(value)
    }

    const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
    const categoryTotals = expenses.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + (e.amount || 0)
        return acc
    }, {} as Record<string, number>)

    const openAddModal = () => {
        setEditingExpense(null)
        setFormData({
            category: 'Miscellaneous',
            description: '',
            amount: '',
            expense_date: new Date().toISOString().split('T')[0]
        })
        setIsModalOpen(true)
    }

    const openEditModal = (expense: Expense) => {
        setEditingExpense(expense)
        setFormData({
            category: expense.category,
            description: expense.description || '',
            amount: expense.amount.toString(),
            expense_date: expense.expense_date
        })
        setIsModalOpen(true)
    }

    const handleSubmit = async () => {
        if (!formData.amount || parseFloat(formData.amount) <= 0) {
            addToast('error', 'Please enter a valid amount')
            return
        }
        try {
            if (editingExpense) {
                await expensesApi.update(editingExpense.id, {
                    category: formData.category as Expense['category'],
                    description: formData.description || null,
                    amount: parseFloat(formData.amount),
                    expense_date: formData.expense_date
                })
                addToast('success', 'Expense updated')
            } else {
                await expensesApi.create({
                    category: formData.category,
                    description: formData.description || undefined,
                    amount: parseFloat(formData.amount),
                    expense_date: formData.expense_date
                })
                addToast('success', 'Expense added')
            }
            setIsModalOpen(false)
            fetchExpenses()
        } catch (err) {
            console.error('Error saving expense:', err)
            addToast('error', 'Failed to save expense')
        }
    }

    const handleDelete = async (expense: Expense) => {
        if (!confirm(`Delete expense "${expense.description || expense.category}" of ${formatCurrency(expense.amount)}?`)) return
        try {
            await expensesApi.delete(expense.id)
            addToast('success', 'Expense deleted')
            fetchExpenses()
        } catch (err) {
            console.error('Error deleting expense:', err)
            addToast('error', 'Failed to delete expense')
        }
    }

    const categoryColors: Record<string, string> = {
        Rent: 'bg-blue-500/10 text-blue-500',
        Salary: 'bg-green-500/10 text-green-500',
        Electricity: 'bg-yellow-500/10 text-yellow-500',
        Transport: 'bg-purple-500/10 text-purple-500',
        Packaging: 'bg-orange-500/10 text-orange-500',
        Miscellaneous: 'bg-gray-500/10 text-gray-500',
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
                            onClick={() => { setError(null); fetchExpenses(); }}
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
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--color-text)]">Expenses</h1>
                        <p className="text-[var(--color-text-muted)]">Track business operating expenses</p>
                    </div>
                    <Button variant="primary" onClick={openAddModal}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Expense
                    </Button>
                </div>

                {/* Filters */}
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
                    <div>
                        <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Category</label>
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm"
                        >
                            <option value="">All Categories</option>
                            {CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4">
                        <p className="text-sm text-[var(--color-text-muted)] mb-1">Total Expenses</p>
                        <p className="text-2xl font-bold text-red-500">{formatCurrency(totalAmount)}</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">{expenses.length} entries</p>
                    </div>
                    {Object.entries(categoryTotals).map(([cat, amount]) => (
                        <div key={cat} className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4">
                            <p className="text-sm text-[var(--color-text-muted)] mb-1">{cat}</p>
                            <p className="text-lg font-bold text-[var(--color-text)]">{formatCurrency(amount)}</p>
                        </div>
                    ))}
                </div>

                {/* Expenses List */}
                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-[var(--color-border)]/30">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-muted)]">Date</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-muted)]">Category</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-muted)]">Description</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-muted)]">Amount</th>
                                    {isFounder && (
                                        <th className="px-4 py-3 text-center text-sm font-medium text-[var(--color-text-muted)]">Actions</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-border)]">
                                {expenses.map((expense) => (
                                    <tr key={expense.id} className="hover:bg-[var(--color-border)]/20">
                                        <td className="px-4 py-3 text-sm text-[var(--color-text-muted)]">
                                            {new Date(expense.expense_date).toLocaleDateString('en-IN', {
                                                day: 'numeric', month: 'short', year: 'numeric'
                                            })}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoryColors[expense.category] || ''}`}>
                                                {expense.category}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-[var(--color-text)]">
                                            {expense.description || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right font-medium text-[var(--color-text)]">
                                            {formatCurrency(expense.amount)}
                                        </td>
                                        {isFounder && (
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button
                                                        onClick={() => openEditModal(expense)}
                                                        className="p-1 text-blue-500 hover:text-blue-600"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(expense)}
                                                        className="p-1 text-red-500 hover:text-red-600"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {expenses.length === 0 && (
                        <div className="p-8 text-center text-[var(--color-text-muted)]">
                            No expenses found for this period
                        </div>
                    )}
                </div>
            </div>

            {/* Add/Edit Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingExpense ? 'Edit Expense' : 'Add Expense'}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Category</label>
                        <select
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm"
                        >
                            {CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <Input
                        label="Amount (₹)"
                        type="number"
                        min="0"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        placeholder="Enter amount"
                    />
                    <Input
                        label="Description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Optional description"
                    />
                    <Input
                        label="Date"
                        type="date"
                        value={formData.expense_date}
                        onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    />
                    <div className="flex gap-3 pt-4">
                        <Button variant="secondary" fullWidth onClick={() => setIsModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="primary" fullWidth onClick={handleSubmit}>
                            {editingExpense ? 'Save Changes' : 'Add Expense'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </Layout>
    )
}
