import { useState, useEffect } from 'react'
import { Layout } from '../components/layout/Layout'
import { Input } from '../components/ui'
import { productsApi, type Product } from '../lib/api'

export function Search() {
    const [products, setProducts] = useState<Product[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [filters, setFilters] = useState({
        vendor: '',
        saree_name: '',
        minPrice: '',
        maxPrice: ''
    })

    const fetchProducts = async () => {
        setIsLoading(true)
        setError(null)
        try {
            const data = await productsApi.getAll({
                status: 'available',
                search: searchTerm || undefined,
                vendor: filters.vendor || undefined,
                saree_name: filters.saree_name || undefined,
                minPrice: filters.minPrice || undefined,
                maxPrice: filters.maxPrice || undefined
            })
            setProducts(data || [])
        } catch (err) {
            console.error('Error searching products:', err)
            setError('Failed to search products. Please try again.')
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
        setFilters({ vendor: '', saree_name: '', minPrice: '', maxPrice: '' })
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
                <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-medium text-[var(--color-text)]">Filters</h3>
                        <button
                            onClick={clearFilters}
                            className="text-sm text-[var(--color-primary)] hover:underline"
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
                        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : error ? (
                    <div className="text-center py-12 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl">
                        <p className="text-red-500 mb-4">{error}</p>
                        <button
                            onClick={() => { setError(null); fetchProducts(); }}
                            className="px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-border)]/50 transition-colors text-sm"
                        >
                            Retry
                        </button>
                    </div>
                ) : products.length === 0 ? (
                    <div className="text-center py-12 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl">
                        <p className="text-base font-medium text-[var(--color-text)]">No results found</p>
                        <p className="text-sm text-[var(--color-text-muted)] mt-1">
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
                                                <span className="font-mono text-sm font-bold text-[var(--color-accent-text)]">{product.sku}</span>
                                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
                                                    Available
                                                </span>
                                            </div>
                                            <p className="text-lg font-medium text-[var(--color-text)]">
                                                {product.saree_name || 'Unnamed'}
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
