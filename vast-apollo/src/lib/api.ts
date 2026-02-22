// API Client - Calls backend server instead of Supabase directly
// All sensitive keys stay on the server

import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    // Get the current Supabase session token for auth
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...options.headers,
        },
        credentials: 'include', // Send cookies for auth
    });

    // Auto sign-out on expired/invalid session
    if (response.status === 401) {
        await supabase.auth.signOut()
        window.location.href = '/login'
        throw new Error('Session expired')
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
    }

    return response.json();
}

// ================== AUTH API ==================

export const authApi = {
    login: async (username: string, password: string) => {
        return request<{ user: User }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
    },

    register: async (username: string, email: string, password: string, fullName: string, role: string) => {
        return request<{ message: string }>('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password, fullName, role }),
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
    saree_name: string;       // Name of saree
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
        return request<VendorBill & { products: Product[] }>('/vendor-bills', {
            method: 'POST',
            body: JSON.stringify({ bill, products }),
        });
    },

    getAll: async () => {
        return request<VendorBill[]>('/vendor-bills');
    },

    getById: async (id: string) => {
        return request<VendorBill & { products: Product[] }>(`/vendor-bills/${id}`);
    },

    update: async (id: string, data: Partial<VendorBill>) => {
        return request<VendorBill>(`/vendor-bills/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    delete: async (id: string) => {
        return request<{ message: string }>(`/vendor-bills/${id}`, {
            method: 'DELETE',
        });
    },
};

// ================== BILLS API ==================

export interface BillItem {
    product_id: string;
    selling_price: number;
    cost_price: number;
    quantity: number;
    products?: Product;
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

    getById: async (id: string) => {
        return request<Bill>(`/bills/${id}`);
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
    username: string;
    full_name: string | null;
    role: 'founder' | 'salesman' | 'accounting';
    created_at: string;
    updated_at?: string;
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

    update: async (id: string, data: { full_name?: string; role?: string }) => {
        return request<User>(`/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    resetPassword: async (id: string, password: string) => {
        return request<{ message: string }>(`/users/${id}/password`, {
            method: 'PUT',
            body: JSON.stringify({ password }),
        });
    },
};

// ================== BILL IMAGE UPLOAD API ==================

export interface BillExtractedData {
    vendor: {
        company_name: string;
        gst_number: string;
        bill_number: string;
        bill_date: string;
    };
    transaction: {
        is_local: boolean;
    };
    items: Array<{
        saree_name: string;
        material: string;
        quantity: number;
        cost_price: number;
        hsn_code: string;
        color: string;
        cost_code: string;
        selling_price_a: number;
        selling_price_b: number;
        rack_location: string;
    }>;
}

export interface BillUploadResponse {
    success: boolean;
    storage_path: string;
    extracted_data: BillExtractedData;
    message: string;
}

export const inventoryApi = {
    uploadBill: async (file: File): Promise<BillUploadResponse> => {
        const formData = new FormData();
        formData.append('billImage', file);

        // Get the Supabase session token from localStorage or cookies
        let token: string | null = null;

        // Try to get token from cookie first
        token = document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] || null;

        // If not in cookie, try to get from Supabase session in localStorage
        if (!token) {
            try {
                const supabaseSession = localStorage.getItem('sb-ndheubawdszpumtzwolm-auth-token');
                if (supabaseSession) {
                    const sessionData = JSON.parse(supabaseSession);
                    token = sessionData?.access_token || null;
                }
            } catch (e) {
                console.error('Failed to parse Supabase session:', e);
            }
        }

        const headers: HeadersInit = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const uploadUrl = `${API_BASE}/inventory/upload-bill`;
        console.log('[API] Uploading to:', uploadUrl);
        console.log('[API] Has auth token:', !!token);

        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData, // Don't set Content-Type, browser will set it with boundary
            credentials: 'include',
            headers,
        });

        console.log('[API] Response status:', response.status, response.statusText);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Upload failed' }));
            console.error('[API] Error response:', error);
            throw new Error(error.error || 'Failed to upload bill');
        }

        return response.json();
    },

    getBillImageUrl: async (path: string): Promise<{ url: string }> => {
        return request<{ url: string }>(`/inventory/bill-image/${path}`);
    }
};

// Health check
export const healthCheck = async () => {
    return request<{ status: string; timestamp: string }>('/health');
};
