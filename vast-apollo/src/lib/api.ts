// API Client - Calls backend server instead of Supabase directly
// All sensitive keys stay on the server

const API_BASE = 'http://localhost:3001/api';

async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        credentials: 'include', // Send cookies for auth
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
    }

    return response.json();
}

// ================== AUTH API ==================

export const authApi = {
    login: async (email: string, password: string) => {
        return request<{ user: User }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    },

    register: async (email: string, password: string, fullName: string, role: string) => {
        return request<{ message: string }>('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, fullName, role }),
        });
    },

    logout: async () => {
        return request<{ message: string }>('/auth/logout', {
            method: 'POST',
        });
    },

    getMe: async () => {
        return request<{ user: User }>('/auth/me');
    },
};

// ================== PRODUCTS API ==================

export interface Product {
    id: string;
    sku: string;
    vendor_name: string;
    hsn_code: string | null;
    purchase_date: string;
    cost_price: number;
    cost_code: string | null;     // Cost code for reference
    selling_price_a: number;  // Regular price
    selling_price_b: number;  // Discount tier B
    selling_price_c: number;  // Discount tier C
    saree_name: string;       // Name of saree
    saree_type: string;
    material: string;
    color: string | null;
    quantity: number;         // Number of sarees
    rack_location: string | null;
    status: 'available' | 'sold';
    vendor_bill_id: string | null;
    created_at: string;
}

export interface VendorBill {
    id: string;
    company_name: string;
    bill_number: string | null;
    bill_date: string;
    total_amount: number;
    vendor_gst_number: string | null;
    is_local_transaction: boolean;
    cgst_rate: number;
    sgst_rate: number;
    igst_rate: number;
    gst_amount: number;
    created_at: string;
}

export interface ProductFilters {
    status?: string;
    search?: string;
    vendor?: string;
    type?: string;
    saree_name?: string;
    color?: string;
    minPrice?: string;
    maxPrice?: string;
}

export const productsApi = {
    getAll: async (filters: ProductFilters = {}) => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value) params.append(key, value);
        });
        const query = params.toString() ? `?${params.toString()}` : '';
        return request<Product[]>(`/products${query}`);
    },

    getBySku: async (sku: string) => {
        return request<Product>(`/products/sku/${sku}`);
    },

    create: async (product: Omit<Product, 'id' | 'created_at'>) => {
        return request<Product>('/products', {
            method: 'POST',
            body: JSON.stringify(product),
        });
    },

    update: async (id: string, product: Partial<Product>) => {
        return request<Product>(`/products/${id}`, {
            method: 'PUT',
            body: JSON.stringify(product),
        });
    },

    delete: async (id: string) => {
        return request<{ message: string }>(`/products/${id}`, {
            method: 'DELETE',
        });
    },

};

export const vendorBillsApi = {
    create: async (bill: Omit<VendorBill, 'id' | 'created_at'>, products: Omit<Product, 'id' | 'created_at' | 'vendor_bill_id'>[]) => {
        return request<VendorBill>('/vendor-bills', {
            method: 'POST',
            body: JSON.stringify({ bill, products }),
        });
    },

    getAll: async () => {
        return request<VendorBill[]>('/vendor-bills');
    },

    getById: async (id: string) => {
        return request<VendorBill & { products: Product[] }>(`/vendor-bills/${id}`);
    }
};

// ================== BILLS API ==================

export interface BillItem {
    product_id: string;
    selling_price: number;
    cost_price: number;
    quantity: number;
}

export interface Bill {
    id: string;
    bill_number: string;
    customer_name: string | null;
    customer_phone: string | null;
    salesman_id: string | null;
    total_amount: number;
    total_cost: number;
    payment_method: 'cash' | 'card' | 'upi';
    created_at: string;
    bill_items?: BillItem[];
}

export const billsApi = {
    getAll: async () => {
        return request<Bill[]>('/bills');
    },

    generateNumber: async () => {
        return request<{ billNumber: string }>('/bills/generate-number');
    },

    create: async (bill: Omit<Bill, 'id' | 'created_at' | 'bill_items'>, items: BillItem[]) => {
        return request<Bill>('/bills', {
            method: 'POST',
            body: JSON.stringify({ bill, items }),
        });
    },

    update: async (id: string, bill: Partial<Bill>) => {
        return request<Bill>(`/bills/${id}`, {
            method: 'PUT',
            body: JSON.stringify(bill),
        });
    },

    delete: async (id: string) => {
        return request<{ message: string }>(`/bills/${id}`, {
            method: 'DELETE',
        });
    },
};

// ================== ANALYTICS API ==================

export interface AnalyticsSummary {
    total_sales: number;
    total_cost: number;
    total_profit: number;
    total_items_sold: number;
    total_items_in_stock: number;
}

export interface DailySale {
    sale_date: string;
    total_amount: number;
    total_profit: number;
    bill_count: number;
}

export const analyticsApi = {
    getSummary: async (startDate?: string, endDate?: string) => {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        const query = params.toString() ? `?${params.toString()}` : '';
        return request<AnalyticsSummary[]>(`/analytics/summary${query}`);
    },

    getDailySales: async (days = 30) => {
        return request<DailySale[]>(`/analytics/daily-sales?days=${days}`);
    },
};

// ================== USERS API ==================

export interface User {
    id: string;
    email: string;
    full_name: string | null;
    role: 'founder' | 'salesman';
    created_at: string;
}

export const usersApi = {
    getAll: async () => {
        return request<User[]>('/users');
    },

    updateRole: async (id: string, role: string) => {
        return request<User>(`/users/${id}/role`, {
            method: 'PUT',
            body: JSON.stringify({ role }),
        });
    },
};

// Health check
export const healthCheck = async () => {
    return request<{ status: string; timestamp: string }>('/health');
};
