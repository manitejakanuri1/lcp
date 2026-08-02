import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import sharp from 'sharp';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase with SERVICE ROLE key (server-side only!)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Configure multer for memory storage (file upload)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPG, PNG, and PDF are allowed.'));
        }
    }
});

// Product photos are image-only (no PDFs) and allow WEBP, which the bill uploader above
// does not. Keeping them separate stops the two use cases from fighting over one filter.
const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, PNG and WEBP images are allowed.'));
        }
    }
});

// Multer rejects (wrong type, file too large) throw before the route body runs. Without
// this wrapper Express falls back to its default handler and replies with an HTML error
// page, which the client can't parse â€” so the user just sees a generic "Upload failed".
const singlePhoto = (req, res, next) => {
    photoUpload.single('photo')(req, res, (err) => {
        if (!err) return next();
        const message = err.code === 'LIMIT_FILE_SIZE'
            ? 'Image is too large. Maximum size is 10MB.'
            : err.message || 'Upload failed';
        res.status(400).json({ error: message });
    });
};

// CORS must come BEFORE helmet to handle preflight OPTIONS correctly on mobile
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        callback(null, true);
    },
    credentials: true
}));

// Security middleware â€” configured to not break CORS preflight
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
}));

app.use(express.json());
app.use(cookieParser());

// JWT middleware
import jwt from 'jsonwebtoken';

const authenticateToken = async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    try {
        // Try JWT verification first (for cookie-based auth)
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (jwtErr) {
        // If JWT verification fails, try Supabase token validation
        try {
            const { data: { user }, error } = await supabase.auth.getUser(token);

            if (error || !user) {
                return res.status(403).json({ error: 'Invalid token' });
            }

            // Look up role from profiles so requireFounder works with Supabase tokens
            const { data: profile } = await supabase
                .from('profiles')
                .select('role, username')
                .eq('id', user.id)
                .single();

            req.user = { id: user.id, email: user.email, role: profile?.role, username: profile?.username };
            next();
        } catch (supabaseErr) {
            res.status(403).json({ error: 'Invalid token' });
        }
    }
};

// Founder-only authorization middleware (must be used after authenticateToken)
const requireFounder = (req, res, next) => {
    if (req.user?.role !== 'founder') {
        return res.status(403).json({ error: 'Founder access required' });
    }
    next();
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

// Register (founder only)
app.post('/api/auth/register', authenticateToken, requireFounder, async (req, res) => {
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
        if (saree_name) query = query.ilike('saree_name', `%${saree_name}%`);
        if (color) query = query.ilike('color', `%${color}%`);
        if (minPrice) query = query.gte('selling_price_a', parseFloat(minPrice));
        if (maxPrice) query = query.lte('selling_price_a', parseFloat(maxPrice));
        if (search) {
            query = query.or(`sku.ilike.%${search}%,material.ilike.%${search}%,color.ilike.%${search}%,vendor_name.ilike.%${search}%,saree_name.ilike.%${search}%`);
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

// Get single bill by ID with product details
app.get('/api/bills/:id', async (req, res) => {
    try {
        const { data: bill, error: billError } = await supabase
            .from('bills')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (billError) throw billError;

        const { data: billItems, error: itemsError } = await supabase
            .from('bill_items')
            .select('*, products(*)')
            .eq('bill_id', req.params.id);

        if (itemsError) throw itemsError;

        res.json({ ...bill, bill_items: billItems });
    } catch (err) {
        console.error('Error fetching bill details:', err);
        res.status(500).json({ error: 'Failed to fetch bill details' });
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

            const { data: createdProducts, error: productsError } = await supabase
                .from('products')
                .insert(productsToInsert)
                .select();

            if (productsError) {
                console.error('Error adding products to bill:', productsError);
                throw productsError;
            }

            return res.status(201).json({ ...billData, products: createdProducts || [] });
        }

        res.status(201).json({ ...billData, products: [] });
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

// Update vendor bill
app.put('/api/vendor-bills/:id', authenticateToken, async (req, res) => {
    try {
        const { company_name, bill_number, bill_date, vendor_gst_number, is_local_transaction, total_amount, gst_amount, cgst_rate, sgst_rate, igst_rate } = req.body;

        const updateData = {};
        if (company_name !== undefined) updateData.company_name = company_name;
        if (bill_number !== undefined) updateData.bill_number = bill_number;
        if (bill_date !== undefined) updateData.bill_date = bill_date;
        if (vendor_gst_number !== undefined) updateData.vendor_gst_number = vendor_gst_number;
        if (is_local_transaction !== undefined) updateData.is_local_transaction = is_local_transaction;
        if (total_amount !== undefined) updateData.total_amount = total_amount;
        if (gst_amount !== undefined) updateData.gst_amount = gst_amount;
        if (cgst_rate !== undefined) updateData.cgst_rate = cgst_rate;
        if (sgst_rate !== undefined) updateData.sgst_rate = sgst_rate;
        if (igst_rate !== undefined) updateData.igst_rate = igst_rate;

        const { data, error } = await supabase
            .from('vendor_bills')
            .update(updateData)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error updating vendor bill:', err);
        res.status(500).json({ error: 'Failed to update vendor bill' });
    }
});

// Delete vendor bill (products cascade-deleted via FK)
app.delete('/api/vendor-bills/:id', authenticateToken, async (req, res) => {
    try {
        const { error } = await supabase
            .from('vendor_bills')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ message: 'Vendor bill deleted' });
    } catch (err) {
        console.error('Error deleting vendor bill:', err);
        res.status(500).json({ error: 'Failed to delete vendor bill' });
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

app.put('/api/users/:id/role', authenticateToken, requireFounder, async (req, res) => {
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

// Reset user password (founder only)
app.put('/api/users/:id/password', authenticateToken, requireFounder, async (req, res) => {
    try {
        const { password } = req.body;

        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const { error } = await supabase.auth.admin.updateUserById(req.params.id, {
            password
        });

        if (error) throw error;
        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error('Error resetting password:', err);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Update user profile (founder only)
app.put('/api/users/:id', authenticateToken, requireFounder, async (req, res) => {
    try {
        const { full_name, role } = req.body;

        const updateData = {};
        if (full_name !== undefined) updateData.full_name = full_name;
        if (role !== undefined) updateData.role = role;
        updateData.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// ================== EXPENSES ROUTES ==================

// Get all expenses (with optional date range and category filter)
app.get('/api/expenses', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate, category } = req.query;

        let query = supabase.from('expenses').select('*');

        if (startDate) query = query.gte('expense_date', startDate);
        if (endDate) query = query.lte('expense_date', endDate);
        if (category) query = query.eq('category', category);

        const { data, error } = await query.order('expense_date', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error fetching expenses:', err);
        res.status(500).json({ error: 'Failed to fetch expenses' });
    }
});

// Create expense
app.post('/api/expenses', authenticateToken, async (req, res) => {
    try {
        const { category, description, amount, expense_date } = req.body;

        const { data, error } = await supabase
            .from('expenses')
            .insert({
                category,
                description: description || null,
                amount: parseFloat(amount),
                expense_date: expense_date || new Date().toISOString().split('T')[0],
                created_by: req.user.id
            })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        console.error('Error creating expense:', err);
        res.status(500).json({ error: 'Failed to create expense' });
    }
});

// Update expense (founder only)
app.put('/api/expenses/:id', authenticateToken, requireFounder, async (req, res) => {
    try {
        const { category, description, amount, expense_date } = req.body;

        const updateData = {};
        if (category !== undefined) updateData.category = category;
        if (description !== undefined) updateData.description = description;
        if (amount !== undefined) updateData.amount = parseFloat(amount);
        if (expense_date !== undefined) updateData.expense_date = expense_date;

        const { data, error } = await supabase
            .from('expenses')
            .update(updateData)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error updating expense:', err);
        res.status(500).json({ error: 'Failed to update expense' });
    }
});

// Delete expense (founder only)
app.delete('/api/expenses/:id', authenticateToken, requireFounder, async (req, res) => {
    try {
        const { error } = await supabase
            .from('expenses')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ message: 'Expense deleted' });
    } catch (err) {
        console.error('Error deleting expense:', err);
        res.status(500).json({ error: 'Failed to delete expense' });
    }
});

// ================== GST REPORT ROUTES ==================

app.get('/api/reports/gst', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Input GST from vendor_bills
        let vendorQuery = supabase
            .from('vendor_bills')
            .select('bill_date, total_amount, gst_amount, cgst_rate, sgst_rate, igst_rate, is_local_transaction');

        if (startDate) vendorQuery = vendorQuery.gte('bill_date', startDate);
        if (endDate) vendorQuery = vendorQuery.lte('bill_date', endDate);

        const { data: vendorBills, error: vendorError } = await vendorQuery;
        if (vendorError) throw vendorError;

        // Output GST from sales bills (5% GST on all in-store sales, local)
        let salesQuery = supabase
            .from('bills')
            .select('created_at, total_amount');

        if (startDate) salesQuery = salesQuery.gte('created_at', startDate);
        if (endDate) salesQuery = salesQuery.lte('created_at', endDate + 'T23:59:59');

        const { data: salesBills, error: salesError } = await salesQuery;
        if (salesError) throw salesError;

        // Aggregate by month
        const monthlyData = {};

        for (const vb of (vendorBills || [])) {
            const month = vb.bill_date.substring(0, 7);
            if (!monthlyData[month]) {
                monthlyData[month] = {
                    month,
                    input_cgst: 0, input_sgst: 0, input_igst: 0, input_total: 0,
                    output_cgst: 0, output_sgst: 0, output_igst: 0, output_total: 0,
                    purchase_total: 0, sales_total: 0,
                };
            }
            const m = monthlyData[month];
            m.purchase_total += parseFloat(vb.total_amount) || 0;
            if (vb.is_local_transaction) {
                m.input_cgst += (parseFloat(vb.gst_amount) || 0) / 2;
                m.input_sgst += (parseFloat(vb.gst_amount) || 0) / 2;
            } else {
                m.input_igst += parseFloat(vb.gst_amount) || 0;
            }
            m.input_total += parseFloat(vb.gst_amount) || 0;
        }

        for (const sb of (salesBills || [])) {
            const month = sb.created_at.substring(0, 7);
            if (!monthlyData[month]) {
                monthlyData[month] = {
                    month,
                    input_cgst: 0, input_sgst: 0, input_igst: 0, input_total: 0,
                    output_cgst: 0, output_sgst: 0, output_igst: 0, output_total: 0,
                    purchase_total: 0, sales_total: 0,
                };
            }
            const m = monthlyData[month];
            const totalAmt = parseFloat(sb.total_amount) || 0;
            const taxableValue = totalAmt / 1.05;
            const gst = totalAmt - taxableValue;
            m.sales_total += totalAmt;
            m.output_cgst += gst / 2;
            m.output_sgst += gst / 2;
            m.output_total += gst;
        }

        const result = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
        res.json(result);
    } catch (err) {
        console.error('Error fetching GST report:', err);
        res.status(500).json({ error: 'Failed to fetch GST report' });
    }
});

// ================== PROFIT & LOSS ROUTES ==================

app.get('/api/reports/profit-loss', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Sales data
        let salesQuery = supabase
            .from('bills')
            .select('created_at, total_amount, total_cost');

        if (startDate) salesQuery = salesQuery.gte('created_at', startDate);
        if (endDate) salesQuery = salesQuery.lte('created_at', endDate + 'T23:59:59');

        const { data: sales, error: salesError } = await salesQuery;
        if (salesError) throw salesError;

        // Expenses data
        let expQuery = supabase
            .from('expenses')
            .select('expense_date, category, amount');

        if (startDate) expQuery = expQuery.gte('expense_date', startDate);
        if (endDate) expQuery = expQuery.lte('expense_date', endDate);

        const { data: expenses, error: expError } = await expQuery;
        if (expError) throw expError;

        // Aggregate by month
        const monthlyData = {};

        for (const sale of (sales || [])) {
            const month = sale.created_at.substring(0, 7);
            if (!monthlyData[month]) {
                monthlyData[month] = { month, revenue: 0, cogs: 0, expenses: 0, expense_breakdown: {} };
            }
            monthlyData[month].revenue += parseFloat(sale.total_amount) || 0;
            monthlyData[month].cogs += parseFloat(sale.total_cost) || 0;
        }

        for (const exp of (expenses || [])) {
            const month = exp.expense_date.substring(0, 7);
            if (!monthlyData[month]) {
                monthlyData[month] = { month, revenue: 0, cogs: 0, expenses: 0, expense_breakdown: {} };
            }
            monthlyData[month].expenses += parseFloat(exp.amount) || 0;
            const cat = exp.category;
            monthlyData[month].expense_breakdown[cat] =
                (monthlyData[month].expense_breakdown[cat] || 0) + (parseFloat(exp.amount) || 0);
        }

        const months = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));

        let totalRevenue = 0, totalCogs = 0, totalExpenses = 0;
        for (const m of months) {
            m.gross_profit = m.revenue - m.cogs;
            m.net_profit = m.gross_profit - m.expenses;
            totalRevenue += m.revenue;
            totalCogs += m.cogs;
            totalExpenses += m.expenses;
        }

        res.json({
            months,
            totals: {
                revenue: totalRevenue,
                cogs: totalCogs,
                gross_profit: totalRevenue - totalCogs,
                expenses: totalExpenses,
                net_profit: totalRevenue - totalCogs - totalExpenses,
            }
        });
    } catch (err) {
        console.error('Error fetching P&L report:', err);
        res.status(500).json({ error: 'Failed to fetch profit & loss report' });
    }
});

// ================== BILL IMAGE UPLOAD & EXTRACTION ==================

app.post('/api/inventory/upload-bill', authenticateToken, upload.single('billImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileName = `bill_${Date.now()}_${req.file.originalname}`;
        let imageBuffer = req.file.buffer;
        let mimeType = req.file.mimetype;

        // Optimize image if it's not a PDF
        if (mimeType.startsWith('image/')) {
            imageBuffer = await sharp(req.file.buffer)
                .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();
            mimeType = 'image/jpeg';
        }

        // 1. Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('bill-images')
            .upload(fileName, imageBuffer, {
                contentType: mimeType,
                cacheControl: '3600',
            });

        if (uploadError) {
            console.error('Supabase storage error:', uploadError);
            return res.status(500).json({ error: 'Failed to upload image to storage' });
        }

        // 2. Read the bill with the offline extractor (api/extract_bill.py). It runs
        // in the same deployment, so the image never leaves Vercel and no API key or
        // third-party service is involved.
        const extractorUrl = `https://${req.headers.host}/api/extract_bill`;

        let extractResponse;
        try {
            extractResponse = await fetch(extractorUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    ...(process.env.INTERNAL_API_SECRET
                        ? { 'X-Internal-Secret': process.env.INTERNAL_API_SECRET }
                        : {})
                },
                body: imageBuffer
            });
        } catch (fetchErr) {
            console.error('Could not reach the bill extractor:', fetchErr);
            return res.status(502).json({ error: 'Bill reader is unavailable. Please try again.' });
        }

        if (!extractResponse.ok) {
            const detail = await extractResponse.text().catch(() => '');
            console.error('Bill extractor returned', extractResponse.status, detail);
            return res.status(502).json({ error: 'Could not read this bill. Try a clearer, straighter photo.' });
        }

        // 3. The extractor returns structured JSON directly, so there is no model
        // prose to strip or repair before parsing.
        let extractedData;
        try {
            extractedData = await extractResponse.json();
        } catch (parseError) {
            console.error('Bill extractor sent malformed JSON:', parseError);
            return res.status(500).json({ error: 'Failed to extract structured data from image' });
        }

        // 4. An unfamiliar vendor layout shows up as an empty items list, so log the
        // column names the extractor saw rather than leaving it a guess.
        if (extractedData._debug) {
            console.log('Bill extraction debug:', JSON.stringify(extractedData._debug));
            delete extractedData._debug;
        }

        // 5. Validate and transform extracted data
        const validatedData = {
            vendor: {
                company_name: extractedData.vendor?.company_name || '',
                gst_number: extractedData.vendor?.gst_number || '',
                bill_number: extractedData.vendor?.bill_number || '',
                bill_date: extractedData.vendor?.bill_date || new Date().toISOString().split('T')[0]
            },
            transaction: {
                is_local: extractedData.transaction?.is_local ?? true
            },
            items: (extractedData.items || []).map((item) => {
                const discountPrice = parseFloat(item.selling_price) || 0;
                const discountPct = parseFloat(item.discount_percent) || 0;
                // Calculate MRP from discount price and percentage
                const mrp = (discountPrice > 0 && discountPct > 0 && discountPct < 100)
                    ? Math.round(discountPrice / (1 - discountPct / 100))
                    : 0;
                return {
                    saree_name: item.saree_name || 'Not specified',
                    material: item.material || 'Not specified',
                    quantity: parseInt(item.quantity) || 1,
                    cost_price: parseFloat(item.cost_price) || 0,
                    hsn_code: item.hsn_code || '5407',
                    color: '',
                    cost_code: item.cost_code || '',
                    selling_price_a: mrp,
                    selling_price_b: discountPrice,
                    discount_percent: discountPct,
                    rack_location: ''
                };
            })
        };

        // 6. Return extracted data with storage reference
        res.json({
            success: true,
            storage_path: uploadData.path,
            extracted_data: validatedData,
            message: 'Bill data extracted successfully'
        });

    } catch (error) {
        console.error('Bill upload error:', error);

        // Provide specific error messages
        let statusCode = 500;
        let errorMessage = 'Failed to process bill image';

        // Extraction runs on our own hardware now, so the old rate-limit and API-key
        // cases are gone. A slow read is the one failure worth naming.
        if (error.message?.includes('timeout') || error.name === 'TimeoutError') {
            statusCode = 504;
            errorMessage = 'Reading the bill took too long. Try a smaller or clearer photo.';
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(statusCode).json({
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
        });
    }
});

// Get uploaded bill image URL (for preview)
app.get('/api/inventory/bill-image/:path', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase.storage
            .from('bill-images')
            .createSignedUrl(req.params.path, 3600); // 1 hour expiry

        if (error) throw error;
        res.json({ url: data.signedUrl });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get image URL' });
    }
});

// ================== PRODUCT PHOTOS ==================
// Photos uploaded here land in the public `product-photos` bucket and the URL
// is stored on products.image_url, which the storefront reads directly.

app.post('/api/products/:id/photo', authenticateToken, singlePhoto, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!req.file.mimetype.startsWith('image/')) {
            return res.status(400).json({ error: 'Only images can be used as product photos' });
        }

        const { id } = req.params;

        const { data: product, error: productError } = await supabase
            .from('products')
            .select('id')
            .eq('id', id)
            .single();

        if (productError || !product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // .rotate() honours EXIF orientation so phone photos aren't sideways
        const imageBuffer = await sharp(req.file.buffer)
            .rotate()
            .resize(1200, 1600, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();

        const photoName = `${Date.now()}.jpg`;
        const fileName = `${id}/${photoName}`;

        const { error: uploadError } = await supabase.storage
            .from('product-photos')
            .upload(fileName, imageBuffer, {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: true,
            });

        if (uploadError) {
            console.error('Supabase storage error:', uploadError);
            return res.status(500).json({ error: 'Failed to upload photo to storage' });
        }

        const { data: publicUrl } = supabase.storage
            .from('product-photos')
            .getPublicUrl(fileName);

        const { data, error } = await supabase
            .from('products')
            .update({ image_url: publicUrl.publicUrl })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Each upload gets a fresh timestamped name, so replacing a photo would otherwise
        // leave the old file behind forever. Sweep them once the new URL is safely saved.
        const { data: existing } = await supabase.storage.from('product-photos').list(id);
        const stale = (existing || [])
            .filter((f) => f.name !== photoName)
            .map((f) => `${id}/${f.name}`);
        if (stale.length) {
            const { error: sweepError } = await supabase.storage.from('product-photos').remove(stale);
            // Orphaned files cost storage but don't break the product, so don't fail the request.
            if (sweepError) console.error('Stale photo cleanup failed:', sweepError);
        }

        res.json({ success: true, image_url: publicUrl.publicUrl, product: data });
    } catch (error) {
        console.error('Product photo upload error:', error);
        res.status(500).json({ error: error.message || 'Failed to upload product photo' });
    }
});

app.delete('/api/products/:id/photo', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('products')
            .update({ image_url: null })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Clear the bucket too, otherwise "Remove" only hides the photo and keeps paying for it.
        const { data: existing } = await supabase.storage.from('product-photos').list(id);
        if (existing?.length) {
            const { error: removeError } = await supabase.storage
                .from('product-photos')
                .remove(existing.map((f) => `${id}/${f.name}`));
            if (removeError) console.error('Photo file cleanup failed:', removeError);
        }
        res.json({ success: true, product: data });
    } catch (error) {
        console.error('Product photo delete error:', error);
        res.status(500).json({ error: 'Failed to remove product photo' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server only if not in Vercel environment
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`ðŸš€ Server running on http://localhost:${PORT}`);
        console.log(`ðŸ“¦ API ready at http://localhost:${PORT}/api`);
    });
}

export default app;
