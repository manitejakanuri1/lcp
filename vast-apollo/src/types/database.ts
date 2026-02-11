export type UserRole = 'founder' | 'salesman' | 'accounting'
export type ProductStatus = 'available' | 'sold'
export type PaymentMethod = 'cash' | 'card' | 'upi'

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    email: string
                    full_name: string | null
                    role: UserRole
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id: string
                    email: string
                    full_name?: string | null
                    role?: UserRole
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    email?: string
                    full_name?: string | null
                    role?: UserRole
                    created_at?: string
                    updated_at?: string
                }
            }
            products: {
                Row: {
                    id: string
                    sku: string
                    vendor_name: string
                    hsn_code: string | null
                    purchase_date: string
                    cost_price: number
                    selling_price: number
                    saree_type: string
                    material: string
                    color: string | null
                    rack_location: string | null
                    image_url: string | null
                    status: ProductStatus
                    created_by: string | null
                    vendor_bill_id: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    sku: string
                    vendor_name: string
                    hsn_code?: string | null
                    purchase_date: string
                    cost_price: number
                    selling_price: number
                    saree_type: string
                    material: string
                    color?: string | null
                    rack_location?: string | null
                    image_url?: string | null
                    status?: ProductStatus
                    created_by?: string | null
                    vendor_bill_id?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    sku?: string
                    vendor_name?: string
                    hsn_code?: string | null
                    purchase_date?: string
                    cost_price?: number
                    selling_price?: number
                    saree_type?: string
                    material?: string
                    color?: string | null
                    rack_location?: string | null
                    image_url?: string | null
                    status?: ProductStatus
                    created_by?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            bills: {
                Row: {
                    id: string
                    bill_number: string
                    customer_name: string | null
                    customer_phone: string | null
                    salesman_id: string | null
                    total_amount: number
                    total_cost: number
                    payment_method: PaymentMethod
                    notes: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    bill_number: string
                    customer_name?: string | null
                    customer_phone?: string | null
                    salesman_id?: string | null
                    total_amount: number
                    total_cost?: number
                    payment_method?: PaymentMethod
                    notes?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    bill_number?: string
                    customer_name?: string | null
                    customer_phone?: string | null
                    salesman_id?: string | null
                    total_amount?: number
                    total_cost?: number
                    payment_method?: PaymentMethod
                    notes?: string | null
                    created_at?: string
                }
            }
            bill_items: {
                Row: {
                    id: string
                    bill_id: string | null
                    product_id: string | null
                    selling_price: number
                    cost_price: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    bill_id?: string | null
                    product_id?: string | null
                    selling_price: number
                    cost_price?: number
                    created_at?: string
                }
                Update: {
                    id?: string
                    bill_id?: string | null
                    product_id?: string | null
                    selling_price?: number
                    cost_price?: number
                    created_at?: string
                }
            }
            vendor_bills: {
                Row: {
                    id: string
                    company_name: string
                    bill_number: string | null
                    bill_date: string
                    total_amount: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    company_name: string
                    bill_number?: string | null
                    bill_date?: string
                    total_amount?: number
                    created_at?: string
                }
                Update: {
                    id?: string
                    company_name?: string
                    bill_number?: string | null
                    bill_date?: string
                    total_amount?: number
                    created_at?: string
                }
            }
        }
        Functions: {
            generate_bill_number: {
                Args: Record<string, never>
                Returns: string
            }
            get_analytics_summary: {
                Args: {
                    start_date?: string | null
                    end_date?: string | null
                }
                Returns: {
                    total_sales: number
                    total_cost: number
                    total_profit: number
                    total_items_sold: number
                    total_items_in_stock: number
                }[]
            }
            get_daily_sales: {
                Args: {
                    days_back?: number
                }
                Returns: {
                    sale_date: string
                    total_amount: number
                    total_profit: number
                    bill_count: number
                }[]
            }
        }
    }
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Product = Database['public']['Tables']['products']['Row']
export type Bill = Database['public']['Tables']['bills']['Row']
export type BillItem = Database['public']['Tables']['bill_items']['Row']

export type ProductInsert = Database['public']['Tables']['products']['Insert']
export type BillInsert = Database['public']['Tables']['bills']['Insert']
export type BillItemInsert = Database['public']['Tables']['bill_items']['Insert']

// Salesman view of product (without sensitive fields)
export interface ProductSalesman {
    id: string
    sku: string
    saree_type: string
    material: string
    color: string | null
    selling_price: number
    rack_location: string | null
    image_url: string | null
    status: ProductStatus
    created_at: string
}

// Cart item for POS
export interface CartItem {
    product: Product | ProductSalesman
    quantity: number
}

// Analytics types
export interface AnalyticsSummary {
    total_sales: number
    total_cost: number
    total_profit: number
    total_items_sold: number
    total_items_in_stock: number
}

export interface DailySales {
    sale_date: string
    total_amount: number
    total_profit: number
    bill_count: number
}

export type VendorBill = Database['public']['Tables']['vendor_bills']['Row']
export type VendorBillInsert = Database['public']['Tables']['vendor_bills']['Insert']
