import { useState, useEffect } from 'react'
import { Layout } from '../components/layout/Layout'
import { Input } from '../components/ui'
import { productsApi, type Product } from '../lib/api'

export function Search() {
    const [products, setProducts] = useState<Product[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [filters, setFilters] = useState({
        vendor: '',
        type: '',
        saree_name: '',
        minPrice: '',
        maxPrice: ''
    })

    const fetchProducts = async () => {
        setIsLoading(true)
        try {
            const data = await productsApi.getAll({
                status: 'available',
                search: searchTerm || undefined,
                vendor: filters.vendor || undefined,
                type: filters.type || undefined,
                saree_name: filters.saree_name || undefined,
                minPrice: filters.minPrice || undefined,
                maxPrice: filters.maxPrice || undefined
            })
            setProducts(data || [])
        } catch (err) {
            console.error('Error searching products:', err)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        const debounce = setTimeout(() => {
            fetchProducts()
        }, 300)

        return () => clearTimeout(debounce)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, filters])

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(value)
    }

    const clearFilters = () => {
        setSearchTerm('')
        setFilters({ vendor: '', type: '', saree_name: '', minPrice: '', maxPrice: '' })
    }

    return (
        <Layout>
            <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-24 md:pb-6">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-[var(--color-text)]">Search Products</h1>
                    <p className="text-[var(--color-text-muted)]">Find sarees by type, color, or price</p>
                </div>

                {/* Search Bar */}
                <div className="mb-4">
                    <Input
                        placeholder="Search by SKU, type, material, or color..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Filters */}
                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-2xl p-4 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-medium text-[var(--color-text)]">Filters</h3>
                        <button
                            onClick={clearFilters}
                            className="text-sm text-indigo-500 hover:underline"
                        >
                            Clear all
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <Input
                            placeholder="Company Name"
                            value={filters.vendor}
                            onChange={(e) => setFilters({ ...filters, vendor: e.target.value })}
                        />
                        <Input
                            placeholder="Saree Name"
                            value={filters.saree_name}
                            onChange={(e) => setFilters({ ...filters, saree_name: e.target.value })}
                        />
                        <Input
                            placeholder="Type (e.g., Banarasi)"
                            value={filters.type}
                            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                        />
                        <Input
                            type="number"
                            placeholder="Min Price"
                            value={filters.minPrice}
                            onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
                            min="0"
                        />
                        <Input
                            type="number"
                            placeholder="Max Price"
                            value={filters.maxPrice}
                            onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
                            min="0"
                        />
                    </div>
                </div>

                {/* Results */}
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : products.length === 0 ? (
                    <div className="text-center py-12 bg-red-500/10 border border-red-500/30 rounded-xl">
                        <p className="text-4xl mb-4">🔍</p>
                        <p className="text-xl font-semibold text-red-500">Not Found!</p>
                        <p className="text-[var(--color-text-muted)] mt-2">
                            No products match your search
                            {searchTerm && <span className="font-medium"> "{searchTerm}"</span>}
                        </p>
                        <button
                            onClick={clearFilters}
                            className="mt-4 px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-border)]/50 transition-colors text-sm"
                        >
                            Clear All Filters
                        </button>
                    </div>
                ) : (
                    <>
                        <p className="text-sm text-[var(--color-text-muted)] mb-4">
                            Found {products.length} product{products.length !== 1 ? 's' : ''}
                        </p>
                        <div className="space-y-3">
                            {products.map((product) => (
                                <div
                                    key={product.id}
                                    className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4 hover:shadow-lg transition-shadow"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-mono text-sm font-bold text-indigo-500">{product.sku}</span>
                                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
                                                    Available
                                                </span>
                                            </div>
                                            <p className="text-lg font-medium text-[var(--color-text)]">
                                                {product.saree_type}
                                            </p>
                                            <p className="text-[var(--color-text-muted)]">
                                                {product.material}
                                            </p>
                                        </div>

                                        <div className="text-right shrink-0">
                                            <p className="text-xl font-bold text-[var(--color-text)]">
                                                {formatCurrency(product.selling_price_a)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </Layout>
    )
}
