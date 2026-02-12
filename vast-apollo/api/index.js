import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase with SERVICE ROLE key (server-side only!)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Security middleware
app.use(helmet());

// Dynamic CORS based on environment
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:4173',
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.PRODUCTION_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.some(allowed => origin.includes(allowed.replace('https://', '').replace('http://', '')))) {
            callback(null, true);
        } else {
            callback(null, true); // For development, allow all. In production, use: callback(new Error('Not allowed by CORS'))
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// JWT middleware
import jwt from 'jsonwebtoken';

const authenticateToken = (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(403).json({ error: 'Invalid token' });
    }
};

// ================== AUTH ROUTES ==================

// Login with username
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // First, find the user by username
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('username', username)
            .single();

        if (profileError || !profile) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Use the email from profile to authenticate
        const { data, error } = await supabase.auth.signInWithPassword({
            email: profile.email,
            password
        });

        if (error) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Create JWT
        const token = jwt.sign(
            {
                id: data.user.id,
                email: data.user.email,
                username: profile.username,
                role: profile.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Set HTTP-only cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({
            user: {
                id: data.user.id,
                email: data.user.email,
                username: profile.username,
                ...profile
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, fullName, role } = req.body;

        // Check if username already exists
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('username')
            .eq('username', username)
            .single();

        if (existingProfile) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const { data, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, role, username }
        });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        // Create profile
        await supabase.from('profiles').insert({
            id: data.user.id,
            email,
            username,
            full_name: fullName,
            role: role || 'salesman'
        });

        res.json({ message: 'User created successfully', username });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', req.user.id)
            .single();

        res.json({ user: { ...req.user, ...profile } });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ================== PRODUCTS ROUTES ==================

// Get all products
app.get('/api/products', async (req, res) => {
    try {
        const { status, search, type, color, minPrice, maxPrice, vendor, saree_name } = req.query;

        let query = supabase.from('products').select('*');

        if (status) query = query.eq('status', status);
        if (vendor) query = query.ilike('vendor_name', `%${vendor}%`);
        if (type) query = query.ilike('saree_type', `%${type}%`);
        if (saree_name) query = query.ilike('saree_name', `%${saree_name}%`);
        if (color) query = query.ilike('color', `%${color}%`);
        if (minPrice) query = query.gte('selling_price_a', parseFloat(minPrice));
        if (maxPrice) query = query.lte('selling_price_a', parseFloat(maxPrice));
        if (search) {
            query = query.or(`sku.ilike.%${search}%,saree_type.ilike.%${search}%,material.ilike.%${search}%,color.ilike.%${search}%,vendor_name.ilike.%${search}%,saree_name.ilike.%${search}%`);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Get product by SKU
app.get('/api/products/sku/:sku', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('sku', req.params.sku)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(404).json({ error: 'Product not found' });
    }
});

// Create product
app.post('/api/products', async (req, res) => {
    try {
        console.log('Creating product:', req.body);
        const { data, error } = await supabase
            .from('products')
            .insert(req.body)
            .select()
            .single();

        if (error) {
            console.error('Supabase error creating product:', error);
            throw error;
        }
        res.status(201).json(data);
    } catch (err) {
        console.error('Error creating product:', err);
        res.status(500).json({ error: err.message || 'Failed to create product' });
    }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
    try {
        console.log('Updating product:', req.params.id, req.body);
        const { data, error } = await supabase
            .from('products')
            .update(req.body)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            console.error('Update error:', error);
            throw error;
        }
        console.log('Update result:', data);
        res.json(data);
    } catch (err) {
        console.error('Failed to update product:', err);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
    try {
        console.log('Deleting product:', req.params.id);

        // First delete any bill_items referencing this product
        const { error: billItemsError } = await supabase
            .from('bill_items')
            .delete()
            .eq('product_id', req.params.id);

        if (billItemsError) {
            console.log('Bill items delete (may be empty):', billItemsError);
        }

        // Then delete the product
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', req.params.id);

        if (error) {
            console.error('Delete error:', error);
            throw error;
        }
        console.log('Product deleted successfully');
        res.json({ message: 'Product deleted' });
    } catch (err) {
        console.error('Failed to delete product:', err);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// ================== BILLS ROUTES ==================

// Get all bills
app.get('/api/bills', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('bills')
            .select('*, bill_items(*)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch bills' });
    }
});

// Generate bill number
app.get('/api/bills/generate-number', async (req, res) => {
    try {
        const { data, error } = await supabase.rpc('generate_bill_number');
        if (error) throw error;
        res.json({ billNumber: data });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate bill number' });
    }
});

// Create bill
app.post('/api/bills', async (req, res) => {
    try {
        const { bill, items } = req.body;

        // Create bill
        const { data: billData, error: billError } = await supabase
            .from('bills')
            .insert(bill)
            .select()
            .single();

        if (billError) throw billError;

        // Create bill items
        const billItems = items.map(item => ({
            ...item,
            bill_id: billData.id
        }));

        const { error: itemsError } = await supabase
            .from('bill_items')
            .insert(billItems);

        if (itemsError) throw itemsError;

        res.status(201).json(billData);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create bill' });
    }
});

// Update bill
app.put('/api/bills/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('bills')
            .update(req.body)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error updating bill:', err);
        res.status(500).json({ error: 'Failed to update bill' });
    }
});

// Delete bill (and restore inventory)
app.delete('/api/bills/:id', async (req, res) => {
    try {
        console.log('Deleting bill:', req.params.id);

        // First get bill items to restore inventory
        const { data: billItems, error: fetchError } = await supabase
            .from('bill_items')
            .select('product_id, quantity')
            .eq('bill_id', req.params.id);

        if (fetchError) {
            console.error('Error fetching bill items:', fetchError);
        }

        // Restore inventory quantities
        if (billItems && billItems.length > 0) {
            for (const item of billItems) {
                // Get current product
                const { data: product } = await supabase
                    .from('products')
                    .select('quantity')
                    .eq('id', item.product_id)
                    .single();

                if (product) {
                    const newQty = (product.quantity || 0) + (item.quantity || 1);
                    await supabase
                        .from('products')
                        .update({
                            quantity: newQty,
                            status: 'available' // Restore to available
                        })
                        .eq('id', item.product_id);

                    console.log('Restored product:', item.product_id, 'qty:', newQty);
                }
            }
        }

        // Delete bill items
        await supabase
            .from('bill_items')
            .delete()
            .eq('bill_id', req.params.id);

        // Then delete the bill
        const { error } = await supabase
            .from('bills')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        console.log('Bill deleted, inventory restored');
        res.json({ message: 'Bill deleted, inventory restored' });
    } catch (err) {
        console.error('Error deleting bill:', err);
        res.status(500).json({ error: 'Failed to delete bill' });
    }
});

// ================== ANALYTICS ROUTES ==================

app.get('/api/analytics/summary', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const { data, error } = await supabase.rpc('get_analytics_summary', {
            start_date: startDate || null,
            end_date: endDate || null
        });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

app.get('/api/analytics/daily-sales', async (req, res) => {
    try {
        const { days } = req.query;

        const { data, error } = await supabase.rpc('get_daily_sales', {
            days_back: parseInt(days) || 30
        });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch daily sales' });
    }
});

// ================== VENDOR BILLS ROUTES ==================

// Create vendor bill with products
app.post('/api/vendor-bills', async (req, res) => {
    try {
        const { bill, products } = req.body;


        // 1. Create the Vendor Bill
        const { data: billData, error: billError } = await supabase
            .from('vendor_bills')
            .insert(bill)
            .select()
            .single();

        if (billError) {
            console.error('Error creating vendor bill:', billError);
            throw billError;
        }

        // 2. Prepare products with the new vendor_bill_id
        if (products && products.length > 0) {
            const productsToInsert = products.map(p => ({
                ...p,
                vendor_bill_id: billData.id
            }));

            const { error: productsError } = await supabase
                .from('products')
                .insert(productsToInsert);

            if (productsError) {
                console.error('Error adding products to bill:', productsError);
                // Note: ideally we would rollback here, but Supabase HTTP API doesn't support transactions easily without RPC.
                // For now, we report the error.
                throw productsError;
            }
        }

        res.status(201).json(billData);
    } catch (err) {
        console.error('Failed to create vendor purchase:', err);
        res.status(500).json({ error: 'Failed to create vendor purchase' });
    }
});

// Get all vendor bills
app.get('/api/vendor-bills', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vendor_bills')
            .select('*')
            .order('bill_date', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch vendor bills' });
    }
});

// Get vendor bill by ID with products
app.get('/api/vendor-bills/:id', async (req, res) => {
    try {
        const { data: bill, error: billError } = await supabase
            .from('vendor_bills')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (billError) throw billError;

        const { data: products, error: prodError } = await supabase
            .from('products')
            .select('*')
            .eq('vendor_bill_id', req.params.id);

        if (prodError) throw prodError;

        res.json({ ...bill, products });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch vendor bill details' });
    }
});

// ================== USERS ROUTES ==================

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.put('/api/users/:id/role', authenticateToken, async (req, res) => {
    try {
        const { role } = req.body;

        const { data, error } = await supabase
            .from('profiles')
            .update({ role })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update user role' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server only if not in Vercel environment
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`📦 API ready at http://localhost:${PORT}/api`);
    });
}

export default app;
