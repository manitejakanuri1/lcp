import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import multer from 'multer';
import sharp from 'sharp';
import { many, one, count, tx, insertClause, setClause } from './db.js';
import { signIn, createLogin, setPassword, setDisabled, deleteLogin } from './firebase.js';
import { storePhoto, sweepFolder, deletePhotoPair, storeBill, readBill, originalUrlFor } from './storage.js';
import { callOcr, ocrBase } from './ocr.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configure multer for memory storage (file upload)
const BILL_MAX_MB = 25;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        // A photo of a bill taken on a modern phone is routinely 15-25 MB, and the reader
        // shrinks it to 2400 px before looking at it anyway. 10 MB rejected real bills; 25 MB
        // still sits well under Cloud Run's 32 MB request limit.
        fileSize: BILL_MAX_MB * 1024 * 1024,
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

// Multer rejects (too large, wrong type) throw before the route body runs. Without this
// wrapper Express answers with an HTML error page, which the screen cannot parse, so a 23 MB
// bill photo showed up as a blank "upload failed" with no reason.
const singleBill = (req, res, next) => {
    upload.single('billImage')(req, res, (err) => {
        if (!err) return next();
        const message = err.code === 'LIMIT_FILE_SIZE'
            ? `That bill photo is too large. Maximum is ${BILL_MAX_MB} MB - photograph it again at a lower quality, or crop it to the bill.`
            : err.message || 'Upload failed';
        res.status(400).json({ error: message });
    });
};

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

// A colour sheet can arrive as a PDF or as a photo, so this one accepts both.
const sheetUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
        cb(allowedTypes.includes(file.mimetype) ? null : new Error('Only JPG, PNG, WEBP or PDF is allowed.'), true);
    }
});

const singlePhotoAny = (req, res, next) => {
    sheetUpload.single('photo')(req, res, (err) => {
        if (!err) return next();
        const message = err.code === 'LIMIT_FILE_SIZE'
            ? 'File is too large. Maximum size is 10MB.'
            : err.message || 'Upload failed';
        res.status(400).json({ error: message });
    });
};

// Cloud Run terminates TLS and forwards the request, so without this every caller looks
// like the proxy: req.ip would be the same address for the whole shop and the per-address
// login limit below would lock everyone out together.
app.set('trust proxy', 1);

// Which sites may call this API from a browser. The screens are served by this same service,
// so they are same-origin and need no entry here; the list exists for a separate front end
// during development. It used to reflect back whatever Origin was sent, which with
// credentials:true means any website a staff member visited could call this API in their
// name while they were signed in.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map((o) => o.trim()).filter(Boolean);

// CORS must come BEFORE helmet to handle preflight OPTIONS correctly on mobile
app.use(cors({
    origin(origin, callback) {
        // No Origin header at all: a same-origin page load, curl, or the label app. The
        // browser rule being enforced here only applies to cross-site calls.
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        callback(null, false);
    },
    credentials: true,
}));

// Security middleware - configured to not break CORS preflight
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
    // Saree and colour photos live in the public Cloud Storage bucket, not next to the
    // screens, so helmet's default img-src 'self' blocked every one of them: the upload
    // worked, the address was stored, and the browser then refused to load it. Only images
    // are widened, and only to that one host - scripts, forms and frames stay as helmet
    // sets them.
    contentSecurityPolicy: {
        directives: {
            'img-src': ["'self'", 'data:', 'blob:', 'https://storage.googleapis.com'],
            // The service worker caches saree photos so the shop's phones do not refetch them
            // on mobile data, and a fetch made inside a worker is governed by connect-src, not
            // img-src. Without this the page was allowed to ask for a photo and the worker was
            // then refused the very request it had intercepted, so every photo stayed blank.
            'connect-src': ["'self'", 'https://storage.googleapis.com'],
        },
    },
}));

app.use(express.json());
app.use(cookieParser());

// JWT middleware
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

const authenticateToken = async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    try {
        // The only token this API issues is its own, signed at login. There used to be a
        // fallback that asked Supabase to validate the token instead; with passwords in
        // Firebase and staff in store.staff_users that branch could only ever fail, and it
        // hid real errors behind a second lookup.
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// A colour the website can group on: "red", "RED" and "Red" have to be one colour.
const titleCase = (value) => String(value || '').trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// The roles a staff row may carry. store.staff_users also allows the website's own roles
// (merchandiser, editor, support), which the POS screens have no meaning for.
const STAFF_ROLES = ['founder', 'accounting', 'salesman', 'admin'];
// Staff who have no email of their own still need one for Firebase.
const STAFF_EMAIL_DOMAIN = process.env.STAFF_EMAIL_DOMAIN || 'pos.lakshmisarees.in';

const requireFounder = (req, res, next) => {
    if (req.user?.role !== 'founder') {
        return res.status(403).json({ error: 'Founder access required' });
    }
    next();
};

// Office staff (founder, accounting). Salesmen only get the POS and Search routes,
// matching the screens: without this a salesman's login could still pull cost
// prices, purchases and the P&L straight from the API.
const requireStaff = (req, res, next) => {
    if (!['founder', 'accounting'].includes(req.user?.role)) {
        return res.status(403).json({ error: 'Not allowed for your role' });
    }
    next();
};

// What a salesman may see of a product: no buying price, cost code or supplier.
const COST_FIELDS = ['cost_price', 'cost_code', 'vendor_name', 'vendor_bill_id', 'purchase_date'];
const forRole = (req, product) => {
    if (!product || req.user?.role !== 'salesman') return product;
    const visible = { ...product };
    for (const field of COST_FIELDS) delete visible[field];
    return visible;
};

// ================== AUTH ROUTES ==================

// Login with username
//
// The screen still asks for a username. The password itself is checked by Firebase Auth, so
// it is never stored in our database: the username finds the staff row, the row gives the
// email, and Firebase says yes or no. The role always comes from the staff row, never from
// anything the browser sent, so nobody can promote themselves by editing a request.
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

        // Guessing passwords has to get slow. The count lives in the database
        // (store.hit_rate_limit), not in this instance's memory, so it holds across every
        // copy of the service Cloud Run starts. Two buckets: one for the name being tried,
        // so one account cannot be ground down, and one for the address trying, so a single
        // attacker cannot work through a list of names. The shop itself never hits these -
        // a staff member typing their own password wrong ten times in fifteen minutes is
        // already having a different kind of problem.
        const name = String(username).trim().toLowerCase();
        const from = createHash('sha256').update(req.ip || 'unknown').digest('hex').slice(0, 32);
        const [nameOk, ipOk] = await Promise.all([
            one('select store.hit_rate_limit($1, $2, $3) as ok', [`login:user:${name}`, 900, 10]),
            one('select store.hit_rate_limit($1, $2, $3) as ok', [`login:ip:${from}`, 900, 50]),
        ]);
        if (!nameOk?.ok || !ipOk?.ok) {
            console.warn('login throttled', { bucket: nameOk?.ok ? 'ip' : 'user' });
            return res.status(429).json({ error: 'Too many sign-in attempts. Wait a few minutes and try again.' });
        }

        const staff = await one(
            `select id, username, email, full_name, role, is_active, provider_uid
               from store.staff_users where username = $1`,
            [String(username).trim()],
        );

        // An unknown username and a wrong password answer the same way, so the login screen
        // cannot be used to find out which staff names exist.
        if (!staff || !staff.is_active) {
            // Firebase is still asked on an unknown username so a wrong guess takes about as
            // long either way.
            await signIn(`${String(username).trim()}@unknown.invalid`, password).catch(() => {});
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        try {
            await signIn(staff.email, password);
        } catch (err) {
            if (err.code === 'USER_DISABLED') return res.status(403).json({ error: 'This login has been switched off' });
            if (err.code === 'TOO_MANY_ATTEMPTS') return res.status(429).json({ error: 'Too many tries. Wait a few minutes.' });
            if (err.code === 'FIREBASE_NOT_CONFIGURED') {
                console.error('FIREBASE_API_KEY is not set');
                return res.status(500).json({ error: 'Login is not configured' });
            }
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign(
            { id: staff.id, email: staff.email, username: staff.username, role: staff.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' },
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.json({
            user: {
                id: staff.id, email: staff.email, username: staff.username,
                full_name: staff.full_name, role: staff.role,
            },
            token,
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Register a staff member (founder only)
//
// The Firebase login and the staff row are made together, and if the row fails the login is
// removed again - a login nobody can see in the Users screen would be a way in that the shop
// does not know about.
app.post('/api/auth/register', authenticateToken, requireFounder, async (req, res) => {
    try {
        const { username, email, password, fullName, role } = req.body;
        const name = String(username || '').trim();
        if (!name || !password) return res.status(400).json({ error: 'Username and password are required' });
        if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
        if (role && !STAFF_ROLES.includes(role)) return res.status(400).json({ error: `Role must be one of: ${STAFF_ROLES.join(', ')}` });

        const taken = await one('select 1 from store.staff_users where username = $1', [name]);
        if (taken) return res.status(400).json({ error: 'Username already exists' });

        // Staff without an email of their own still need one for Firebase, so the username
        // becomes the local part of an address at the shop's own domain.
        const loginEmail = String(email || '').trim() || `${name.toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;

        let uid;
        try {
            uid = await createLogin(loginEmail, password);
        } catch (err) {
            if (/EMAIL_EXISTS/.test(err.message)) return res.status(400).json({ error: 'That email already has a login' });
            if (/WEAK_PASSWORD/.test(err.message)) return res.status(400).json({ error: 'Password is too weak' });
            throw err;
        }

        try {
            const staff = await one(
                `insert into store.staff_users (id, provider, provider_uid, email, username, full_name, role, is_active, created_at, updated_at)
                 values (gen_random_uuid(), 'firebase', $1, $2, $3, $4, $5, true, now(), now())
                 returning id, username, email, full_name, role`,
                [uid, loginEmail, name, String(fullName || name), role || 'salesman'],
            );
            res.status(201).json({ message: 'User created successfully', user: staff });
        } catch (err) {
            await deleteLogin(uid).catch(() => {});
            throw err;
        }
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: err.message || 'Server error' });
    }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
});

// Get current user
//
// Read from the staff row every time rather than trusting the token: a role changed or a login
// switched off this morning must take effect on the next page load, not in seven days when the
// token expires.
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const staff = await one(
            'select id, username, email, full_name, role, is_active from store.staff_users where id = $1',
            [req.user.id],
        );
        if (!staff || !staff.is_active) {
            res.clearCookie('token');
            return res.status(401).json({ error: 'This login is no longer active' });
        }
        res.json({ user: staff });
    } catch (err) {
        console.error('Failed to read the signed-in user:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ================== PRODUCTS ROUTES ==================

// Get all products
// Reads are guarded too, not just writes: these rows carry cost_price, cost_code
// and vendor_name, so an open GET hands a competitor the buying price and the
// supplier for every saree in the shop.
// Columns a request may write. The Supabase client took the whole body; SQL needs the
// list written down, which also stops a caller setting id, created_by, created_at or
// barcode_no (the database assigns that one).
const PRODUCT_COLUMNS = [
    'sku', 'saree_name', 'saree_type', 'material', 'color', 'quantity',
    'vendor_name', 'purchase_date', 'cost_price', 'cost_code', 'hsn_code',
    'selling_price', 'selling_price_a', 'selling_price_b', 'main_color_pieces',
    'rack_location', 'image_url', 'status', 'on_website', 'vendor_bill_id',
];
// A salesman's only product change is the stock count after a POS sale.
const SALESMAN_PRODUCT_COLUMNS = ['quantity', 'status'];

app.get('/api/products', authenticateToken, async (req, res) => {
    try {
        const { status, search, type, color, minPrice, maxPrice, vendor, saree_name } = req.query;

        const where = [];
        const params = [];
        const add = (sql, value) => {
            params.push(value);
            where.push(sql.replace('?', `$${params.length}`));
        };

        if (status) add('status = ?', status);
        if (vendor) add('vendor_name ilike ?', `%${vendor}%`);
        if (saree_name) add('saree_name ilike ?', `%${saree_name}%`);
        if (color) add('color ilike ?', `%${color}%`);
        // `type` is read from the query string but was never filtered on before this port
        // either; the Inventory screen narrows by type in the browser. Left as it was so
        // the port changes no results.
        if (minPrice) add('selling_price_a >= ?', parseFloat(minPrice));
        if (maxPrice) add('selling_price_a <= ?', parseFloat(maxPrice));
        if (search) {
            // The text travels as a parameter now, so a comma, bracket or wildcard in it is
            // matched literally instead of rewriting the filter the way it could in the old
            // or() string. Only LIKE's own wildcards still need escaping.
            params.push(`%${String(search).replace(/[\\%_]/g, '\\$&')}%`);
            const p = `$${params.length}`;
            where.push(`(sku ilike ${p} or material ilike ${p} or color ilike ${p}`
                + ` or vendor_name ilike ${p} or saree_name ilike ${p})`);
        }

        const rows = await many(
            `select * from pos.products${where.length ? ` where ${where.join(' and ')}` : ''}`
            + ' order by created_at desc',
            params,
        );
        res.json(rows.map((product) => forRole(req, product)));
    } catch (err) {
        console.error('Failed to fetch products:', err);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Get product by SKU, or by the 8-digit barcode printed on the label
app.get('/api/products/sku/:sku', authenticateToken, async (req, res) => {
    try {
        const code = req.params.sku;
        // Old labels carry the SKU, new ones the short number; one scan has to answer both.
        const column = /^\d+$/.test(code) ? 'barcode_no' : 'sku';

        const product = await one(`select * from pos.products where ${column} = $1`, [code]);
        if (product) return res.json(forRole(req, product));

        // Not a saree barcode: try a colour barcode. The till then knows which colour was
        // picked off the shelf, and that colour's own stock.
        const colour = await one(
            `select c.id, c.color_name, c.pieces, c.image_url, c.sku, c.barcode_no,
                    to_jsonb(p.*) as product
               from pos.product_colors c
               join pos.products p on p.id = c.product_id
              where c.${column} = $1`,
            [code],
        );
        if (!colour?.product) return res.status(404).json({ error: 'Product not found' });

        res.json({
            ...forRole(req, colour.product),
            quantity: colour.pieces,
            image_url: colour.image_url || colour.product.image_url,
            sku: colour.sku,
            barcode_no: colour.barcode_no,
            saree_sku: colour.product.sku,
            color: colour.color_name,
            color_id: colour.id,
        });
    } catch (err) {
        console.error('Product lookup failed:', err);
        res.status(404).json({ error: 'Product not found' });
    }
});

// Create product
// authenticateToken is not optional here: without it anyone who knows the URL can
// add, reprice or delete stock.
app.post('/api/products', authenticateToken, requireStaff, async (req, res) => {
    try {
        const { keys, columns, placeholders, values } = insertClause(req.body, PRODUCT_COLUMNS);
        if (keys.length === 0) return res.status(400).json({ error: 'No product details given' });

        const row = await one(
            `insert into pos.products (${columns}) values (${placeholders}) returning *`,
            values,
        );
        res.status(201).json(row);
    } catch (err) {
        console.error('Error creating product:', err);
        res.status(500).json({ error: err.message || 'Failed to create product' });
    }
});

// Update product
app.put('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        const allowed = req.user?.role === 'salesman' ? SALESMAN_PRODUCT_COLUMNS : PRODUCT_COLUMNS;
        const { keys, sql, values } = setClause(req.body, allowed);
        // An empty patch used to reach the database and come back as a 500.
        if (keys.length === 0) return res.status(400).json({ error: 'Nothing to update' });

        const row = await one(
            `update pos.products set ${sql}, updated_at = now() where id = $1 returning *`,
            [req.params.id, ...values],
        );
        if (!row) return res.status(404).json({ error: 'Product not found' });
        res.json(forRole(req, row));
    } catch (err) {
        console.error('Failed to update product:', err);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Delete product
app.delete('/api/products/:id', authenticateToken, requireStaff, async (req, res) => {
    try {
        // A sold saree is referenced by its bill lines, and the colour rows hang off it.
        // Both go in the same transaction as the saree, so a half-deleted saree cannot be
        // left behind. Colours cascade; bill lines are cleared by hand.
        const deleted = await tx(async (client) => {
            await client.query('delete from pos.bill_items where product_id = $1', [req.params.id]);
            const { rowCount } = await client.query('delete from pos.products where id = $1', [req.params.id]);
            return rowCount;
        });
        if (!deleted) return res.status(404).json({ error: 'Product not found' });

        // Its pictures go too. Deleting the row alone left the saree's own photo pair and
        // every colour's pair in the bucket for ever: invisible, unreachable and still paid
        // for. Both folders are swept - the colour rows themselves cascade with the saree, so
        // nothing is left pointing at them. A sweep failure is logged, not returned: the
        // saree is already gone and the caller should not see an error for it.
        await Promise.all([
            sweepFolder(`products/${req.params.id}`),
            sweepFolder(`colors/${req.params.id}`),
        ]).catch((err) => console.error('Photo cleanup after deleting a saree failed:', err.message));

        res.json({ message: 'Product deleted' });
    } catch (err) {
        console.error('Failed to delete product:', err);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// ================== BILLS ROUTES ==================

// Get all bills
// What a bill row may carry from a request. Totals and the bill number are worked out
// here, never taken from the till.
const BILL_COLUMNS = ['customer_name', 'customer_phone', 'payment_method', 'notes', 'salesman_id'];

app.get('/api/bills', authenticateToken, requireStaff, async (req, res) => {
    try {
        // One query instead of a bill query plus one per bill: the lines come back nested,
        // which is the shape the Sales Bills screen already expects.
        const rows = await many(
            `select b.*, coalesce(
                      (select jsonb_agg(to_jsonb(i.*) order by i.created_at) from pos.bill_items i
                        where i.bill_id = b.id), '[]'::jsonb) as bill_items
               from pos.bills b
              order by b.created_at desc`,
        );
        res.json(rows);
    } catch (err) {
        console.error('Failed to fetch bills:', err);
        res.status(500).json({ error: 'Failed to fetch bills' });
    }
});

// Generate bill number
app.get('/api/bills/generate-number', authenticateToken, async (req, res) => {
    try {
        // The counter lives in the database (pos.bill_counters, Asia/Kolkata day), so two
        // tills cannot hand out the same number.
        const row = await one('select pos.generate_bill_number() as bill_number');
        res.json({ billNumber: row.bill_number });
    } catch (err) {
        console.error('Failed to generate bill number:', err);
        res.status(500).json({ error: 'Failed to generate bill number' });
    }
});

// Get single bill by ID with product details
app.get('/api/bills/:id', authenticateToken, requireStaff, async (req, res) => {
    try {
        const bill = await one('select * from pos.bills where id = $1', [req.params.id]);
        if (!bill) return res.status(404).json({ error: 'Bill not found' });

        const billItems = await many(
            `select i.*, to_jsonb(p.*) as products, c.color_name
               from pos.bill_items i
               left join pos.products p on p.id = i.product_id
               left join pos.product_colors c on c.id = i.color_id
              where i.bill_id = $1
              order by i.created_at`,
            [req.params.id],
        );
        res.json({ ...bill, bill_items: billItems });
    } catch (err) {
        console.error('Error fetching bill details:', err);
        res.status(500).json({ error: 'Failed to fetch bill details' });
    }
});

// Create bill
//
// Everything here happens in one transaction: the bill, its lines and the stock they take
// off. A till that loses power or network half way through leaves no bill and no missing
// pieces. Stock is reduced for EVERY line - a plain saree line off products.quantity, a
// colour line off that colour's pieces and the saree's count together. The POS screen used
// to do the plain lines itself in a second call, which left stock untouched whenever the
// browser died after the bill was saved.
/**
 * How many pieces a website order is holding right now, for one colour or for a saree's own
 * count. Expired holds are swept first: a shopper who walked away from the basket must not
 * keep a saree off the counter shelf for ever, and nothing else in the shop runs often
 * enough to do the sweeping.
 *
 * Returns 0 when the saree was never published - the usual case today - so the till behaves
 * exactly as it did before for everything that is not on the website.
 */
const webHold = async (client, colorId, productId) => {
    await client.query('delete from store.variant_reservations where expires_at <= now()');
    const { rows } = await client.query(
        `select coalesce(sum(r.qty), 0)::int as held
           from store.variant_reservations r
           join store.variant_stock_source s on s.variant_id = r.variant_id
          where r.expires_at > now()
            and ($1::uuid is not null and s.color_id = $1
                 or $1::uuid is null and s.product_id = $2 and s.color_id is null)`,
        [colorId, productId],
    );
    return rows[0].held;
};

app.post('/api/bills', authenticateToken, async (req, res) => {
    try {
        const { bill = {}, items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'A bill needs at least one item' });
        }

        const billData = await tx(async (client) => {
            const lines = [];
            for (const item of items) {
                const quantity = Math.max(1, parseInt(item.quantity) || 1);

                // Buying price comes from the database, not from the till: a salesman's
                // screen never receives cost_price, and a posted cost could be anything.
                // for update locks the row, so two tills cannot both sell the last piece.
                const product = (await client.query(
                    'select id, cost_price, quantity, selling_price_a, selling_price from pos.products where id = $1 for update',
                    [item.product_id],
                )).rows[0];
                if (!product) {
                    const err = new Error('PRODUCT_NOT_FOUND');
                    err.productId = item.product_id;
                    throw err;
                }

                const sellingPrice = item.selling_price ?? product.selling_price_a ?? product.selling_price;
                const costPrice = parseFloat(product.cost_price) || 0;

                if (item.color_id) {
                    const colour = (await client.query(
                        'select id, pieces from pos.product_colors where id = $1 for update',
                        [item.color_id],
                    )).rows[0];
                    if (!colour) {
                        const err = new Error('COLOUR_NOT_FOUND');
                        throw err;
                    }

                    // A web shopper part-way through paying is holding real pieces off this
                    // shelf, and the till cannot see them. Selling those pieces at the counter
                    // leaves the shop owing a saree it has already handed over. The hold is
                    // short - the order either pays or lapses within minutes - so the counter
                    // is told how many it may still sell rather than being stopped outright.
                    const held = await webHold(client, item.color_id, null);
                    if (colour.pieces - held < quantity) {
                        const err = new Error('HELD_BY_WEB_ORDER');
                        err.held = held;
                        err.free = Math.max(0, colour.pieces - held);
                        throw err;
                    }

                    const piecesLeft = Math.max(0, (colour.pieces || 0) - quantity);
                    await client.query(
                        `update pos.product_colors
                            set pieces = $2, status = case when $2 <= 0 then 'sold' else 'available' end,
                                updated_at = now()
                          where id = $1`,
                        [item.color_id, piecesLeft],
                    );
                }

                // A saree sold without naming a colour comes off the saree's own count, and
                // the main photo's colour is sold the same way, so the same hold applies.
                if (!item.color_id) {
                    const held = await webHold(client, null, product.id);
                    if (product.quantity - held < quantity) {
                        const err = new Error('HELD_BY_WEB_ORDER');
                        err.held = held;
                        err.free = Math.max(0, product.quantity - held);
                        throw err;
                    }
                }

                const left = Math.max(0, (product.quantity || 0) - quantity);
                await client.query(
                    `update pos.products
                        set quantity = $2, status = case when $2 <= 0 then 'sold' else 'available' end,
                            updated_at = now()
                      where id = $1`,
                    [product.id, left],
                );

                lines.push({ product_id: product.id, color_id: item.color_id || null, quantity, selling_price: sellingPrice, cost_price: costPrice });
            }

            const totalAmount = lines.reduce((sum, l) => sum + Number(l.selling_price) * l.quantity, 0);
            const totalCost = lines.reduce((sum, l) => sum + l.cost_price * l.quantity, 0);

            const { keys, columns, placeholders, values } = insertClause(
                { ...bill, salesman_id: bill.salesman_id || req.user?.id || null },
                BILL_COLUMNS,
            );
            const created = (await client.query(
                `insert into pos.bills (bill_number, total_amount, total_cost${keys.length ? ', ' + columns : ''})
                 values (pos.generate_bill_number(), $${keys.length + 1}, $${keys.length + 2}${keys.length ? ', ' + placeholders : ''})
                 returning *`,
                [...values, totalAmount.toFixed(2), totalCost.toFixed(2)],
            )).rows[0];

            for (const l of lines) {
                await client.query(
                    `insert into pos.bill_items (bill_id, product_id, color_id, quantity, selling_price, cost_price)
                     values ($1, $2, $3, $4, $5, $6)`,
                    [created.id, l.product_id, l.color_id, l.quantity, l.selling_price, l.cost_price],
                );
            }
            return created;
        });

        res.status(201).json(billData);
    } catch (err) {
        if (err.message === 'PRODUCT_NOT_FOUND') return res.status(404).json({ error: 'A saree on this bill no longer exists' });
        if (err.message === 'COLOUR_NOT_FOUND') return res.status(404).json({ error: 'A colour on this bill no longer exists' });
        if (err.message === 'HELD_BY_WEB_ORDER') {
            return res.status(409).json({
                error: err.free > 0
                    ? `${err.held} of these are held by a website order being paid for. You can sell ${err.free} now, or try again in a few minutes.`
                    : 'These are all held by a website order being paid for. Try again in a few minutes.',
            });
        }
        console.error('Failed to create bill:', err);
        res.status(500).json({ error: 'Failed to create bill' });
    }
});

// Update bill (customer details, payment method, notes - not the money)
app.put('/api/bills/:id', authenticateToken, requireStaff, async (req, res) => {
    try {
        const { keys, sql, values } = setClause(req.body, BILL_COLUMNS);
        if (keys.length === 0) return res.status(400).json({ error: 'Nothing to update' });

        const row = await one(`update pos.bills set ${sql} where id = $1 returning *`, [req.params.id, ...values]);
        if (!row) return res.status(404).json({ error: 'Bill not found' });
        res.json(row);
    } catch (err) {
        console.error('Error updating bill:', err);
        res.status(500).json({ error: 'Failed to update bill' });
    }
});

// Delete bill, putting the stock back
//
// Also in one transaction, and the mirror image of creating it: a colour line puts its
// pieces back on the colour as well as on the saree. The old code only ever restored the
// saree, so a cancelled colour sale left that colour short for ever.
app.delete('/api/bills/:id', authenticateToken, requireStaff, async (req, res) => {
    try {
        const restored = await tx(async (client) => {
            const bill = (await client.query('select id from pos.bills where id = $1 for update', [req.params.id])).rows[0];
            if (!bill) return null;

            const lines = (await client.query(
                'select product_id, color_id, quantity from pos.bill_items where bill_id = $1',
                [req.params.id],
            )).rows;

            for (const line of lines) {
                const quantity = line.quantity || 1;
                if (line.color_id) {
                    await client.query(
                        `update pos.product_colors
                            set pieces = coalesce(pieces, 0) + $2, status = 'available', updated_at = now()
                          where id = $1`,
                        [line.color_id, quantity],
                    );
                }
                await client.query(
                    `update pos.products
                        set quantity = coalesce(quantity, 0) + $2, status = 'available', updated_at = now()
                      where id = $1`,
                    [line.product_id, quantity],
                );
            }

            await client.query('delete from pos.bill_items where bill_id = $1', [req.params.id]);
            await client.query('delete from pos.bills where id = $1', [req.params.id]);
            return lines.length;
        });

        if (restored === null) return res.status(404).json({ error: 'Bill not found' });
        res.json({ message: 'Bill deleted, inventory restored', lines: restored });
    } catch (err) {
        console.error('Error deleting bill:', err);
        res.status(500).json({ error: 'Failed to delete bill' });
    }
});

// ================== ANALYTICS ROUTES ==================

app.get('/api/analytics/summary', authenticateToken, requireStaff, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        // The sums live in the database (pos.get_analytics_summary), so the shop's Analytics
        // screen and the website's own analytics read one definition of "sold" and "in stock".
        const row = await one('select * from pos.get_analytics_summary($1::date, $2::date)',
            [startDate || null, endDate || null]);
        res.json(row);
    } catch (err) {
        console.error('Failed to fetch analytics:', err);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

app.get('/api/analytics/daily-sales', authenticateToken, requireStaff, async (req, res) => {
    try {
        const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 730);
        const rows = await many('select * from pos.get_daily_sales($1)', [days]);
        res.json(rows);
    } catch (err) {
        console.error('Failed to fetch daily sales:', err);
        res.status(500).json({ error: 'Failed to fetch daily sales' });
    }
});

// ================== VENDOR BILLS ROUTES ==================

// Create vendor bill with products
// What a purchase bill may carry from a request. The rates and the rupee amount are kept as
// they were printed on the paper, so a later rate change cannot rewrite an old bill.
const VENDOR_BILL_COLUMNS = [
    'company_name', 'bill_number', 'bill_date', 'vendor_gst_number', 'is_local_transaction',
    'subtotal', 'total_amount', 'gst_amount', 'cgst_rate', 'sgst_rate', 'igst_rate', 'notes',
    // Where the photo of the paper bill is kept, so the figures can be checked against it later.
    'bill_image_path',
];

// Create a purchase bill together with the sarees that came in on it
//
// One transaction: a bill whose sarees failed to save would show a purchase with nothing
// bought, and the GST report would count tax against stock that does not exist.
app.post('/api/vendor-bills', authenticateToken, requireStaff, async (req, res) => {
    try {
        const { bill = {}, products = [] } = req.body;
        const billFields = insertClause({ ...bill, created_by: req.user?.id ?? null }, [...VENDOR_BILL_COLUMNS, 'created_by']);
        if (!bill.company_name) return res.status(400).json({ error: 'The vendor name is required' });

        const result = await tx(async (client) => {
            const created = (await client.query(
                `insert into pos.vendor_bills (${billFields.columns}) values (${billFields.placeholders}) returning *`,
                billFields.values,
            )).rows[0];

            const saved = [];
            for (const product of products) {
                const row = insertClause({ ...product, vendor_bill_id: created.id, created_by: req.user?.id ?? null },
                    [...PRODUCT_COLUMNS, 'created_by']);
                saved.push((await client.query(
                    `insert into pos.products (${row.columns}) values (${row.placeholders}) returning *`,
                    row.values,
                )).rows[0]);
            }
            return { ...created, products: saved };
        });

        res.status(201).json(result);
    } catch (err) {
        console.error('Failed to create vendor purchase:', err);
        res.status(500).json({ error: err.message || 'Failed to create vendor purchase' });
    }
});

// Get all vendor bills
app.get('/api/vendor-bills', authenticateToken, requireStaff, async (req, res) => {
    try {
        const rows = await many(
            `select b.*, (select count(*) from pos.products p where p.vendor_bill_id = b.id) as product_count
               from pos.vendor_bills b
              order by b.bill_date desc nulls last, b.created_at desc`,
        );
        res.json(rows);
    } catch (err) {
        console.error('Failed to fetch vendor bills:', err);
        res.status(500).json({ error: 'Failed to fetch vendor bills' });
    }
});

// Get vendor bill by ID with the sarees that came in on it
app.get('/api/vendor-bills/:id', authenticateToken, requireStaff, async (req, res) => {
    try {
        const bill = await one('select * from pos.vendor_bills where id = $1', [req.params.id]);
        if (!bill) return res.status(404).json({ error: 'Vendor bill not found' });

        const products = await many(
            'select * from pos.products where vendor_bill_id = $1 order by created_at',
            [req.params.id],
        );
        res.json({ ...bill, products });
    } catch (err) {
        console.error('Failed to fetch vendor bill details:', err);
        res.status(500).json({ error: 'Failed to fetch vendor bill details' });
    }
});

// Update vendor bill
app.put('/api/vendor-bills/:id', authenticateToken, requireStaff, async (req, res) => {
    try {
        const { keys, sql, values } = setClause(req.body, VENDOR_BILL_COLUMNS);
        // A body of nothing but unknown fields used to reach the database and come back a 500.
        if (keys.length === 0) return res.status(400).json({ error: 'Nothing to update' });

        const row = await one(
            `update pos.vendor_bills set ${sql}, updated_at = now() where id = $1 returning *`,
            [req.params.id, ...values],
        );
        if (!row) return res.status(404).json({ error: 'Vendor bill not found' });
        res.json(row);
    } catch (err) {
        console.error('Error updating vendor bill:', err);
        res.status(500).json({ error: 'Failed to update vendor bill' });
    }
});

// Delete vendor bill, and the sarees that came in on it
//
// A saree that has already been sold is not deleted and the whole thing is refused: wiping it
// would take its line off a customer's bill and change the day's takings. The foreign key
// would have refused it anyway, with an error nobody could read.
app.delete('/api/vendor-bills/:id', authenticateToken, requireStaff, async (req, res) => {
    try {
        const outcome = await tx(async (client) => {
            const bill = (await client.query('select id from pos.vendor_bills where id = $1 for update', [req.params.id])).rows[0];
            if (!bill) return { status: 404 };

            const sold = (await client.query(
                `select count(*)::int as n from pos.bill_items i
                  join pos.products p on p.id = i.product_id
                 where p.vendor_bill_id = $1`,
                [req.params.id],
            )).rows[0].n;
            if (sold > 0) return { status: 409, sold };

            const { rowCount } = await client.query('delete from pos.products where vendor_bill_id = $1', [req.params.id]);
            await client.query('delete from pos.vendor_bills where id = $1', [req.params.id]);
            return { status: 200, removed: rowCount };
        });

        if (outcome.status === 404) return res.status(404).json({ error: 'Vendor bill not found' });
        if (outcome.status === 409) {
            return res.status(409).json({
                error: `${outcome.sold} saree${outcome.sold === 1 ? '' : 's'} from this bill ${outcome.sold === 1 ? 'has' : 'have'} already been sold, so the bill cannot be deleted. Correct the bill instead.`,
            });
        }
        res.json({ message: 'Vendor bill deleted', sarees_removed: outcome.removed });
    } catch (err) {
        console.error('Error deleting vendor bill:', err);
        res.status(500).json({ error: 'Failed to delete vendor bill' });
    }
});

// ================== USERS ROUTES ==================

app.get('/api/users', authenticateToken, requireFounder, async (req, res) => {
    try {
        const rows = await many(
            `select id, username, email, full_name, role, is_active, created_at, updated_at
               from store.staff_users order by created_at desc`,
        );
        res.json(rows);
    } catch (err) {
        console.error('Failed to fetch users:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.put('/api/users/:id/role', authenticateToken, requireFounder, async (req, res) => {
    try {
        const { role } = req.body;
        if (!STAFF_ROLES.includes(role)) return res.status(400).json({ error: `Role must be one of: ${STAFF_ROLES.join(', ')}` });
        // The shop must keep a way in: the last founder cannot demote themselves out of it.
        if (req.params.id === req.user.id && role !== 'founder') {
            return res.status(400).json({ error: 'You cannot take the founder role away from yourself' });
        }

        const row = await one(
            `update store.staff_users set role = $2, updated_at = now() where id = $1
             returning id, username, email, full_name, role, is_active`,
            [req.params.id, role],
        );
        if (!row) return res.status(404).json({ error: 'User not found' });
        res.json(row);
    } catch (err) {
        console.error('Failed to update user role:', err);
        res.status(500).json({ error: 'Failed to update user role' });
    }
});

// Reset user password (founder only)
app.put('/api/users/:id/password', authenticateToken, requireFounder, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || String(password).length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // The Firebase login id is on the staff row; without this lookup a founder could post
        // any id and change a password that is not a staff login at all.
        const staff = await one(
            "select provider_uid from store.staff_users where id = $1 and provider = 'firebase'",
            [req.params.id],
        );
        if (!staff) return res.status(404).json({ error: 'User not found' });

        await setPassword(staff.provider_uid, String(password));
        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error('Error resetting password:', err);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Update user details (founder only)
app.put('/api/users/:id', authenticateToken, requireFounder, async (req, res) => {
    try {
        const { full_name, role, is_active } = req.body;
        if (role !== undefined && !STAFF_ROLES.includes(role)) {
            return res.status(400).json({ error: `Role must be one of: ${STAFF_ROLES.join(', ')}` });
        }
        if (req.params.id === req.user.id && (is_active === false || (role !== undefined && role !== 'founder'))) {
            return res.status(400).json({ error: 'You cannot switch off or demote your own login' });
        }

        const { keys, sql, values } = setClause({ full_name, role, is_active }, ['full_name', 'role', 'is_active']);
        if (keys.length === 0) return res.status(400).json({ error: 'Nothing to update' });

        const row = await one(
            `update store.staff_users set ${sql}, updated_at = now() where id = $1
             returning id, username, email, full_name, role, is_active`,
            [req.params.id, ...values],
        );
        if (!row) return res.status(404).json({ error: 'User not found' });

        // A login switched off in the Users screen has to stop working at Google too, or the
        // staff member could still sign in until their cookie expired.
        if (is_active !== undefined) {
            const staff = await one("select provider_uid from store.staff_users where id = $1 and provider = 'firebase'", [req.params.id]);
            if (staff) await setDisabled(staff.provider_uid, !is_active).catch((err) => console.error('Could not change the Firebase login:', err.message));
        }
        res.json(row);
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// ================== EXPENSES ROUTES ==================

// Get all expenses (with optional date range and category filter)
// The spend headings the Expenses screen offers. Written down here as well as on the screen
// so a typed-in heading cannot quietly create a category nobody ever reports on.
const EXPENSE_CATEGORIES = ['Rent', 'Salary', 'Electricity', 'Transport', 'Packaging', 'Miscellaneous'];
const EXPENSE_COLUMNS = ['category', 'description', 'amount', 'expense_date'];

app.get('/api/expenses', authenticateToken, requireStaff, async (req, res) => {
    try {
        const { startDate, endDate, category } = req.query;
        const where = [];
        const params = [];
        const add = (sql, value) => {
            params.push(value);
            where.push(sql.replace('?', `$${params.length}`));
        };
        if (startDate) add('expense_date >= ?', startDate);
        if (endDate) add('expense_date <= ?', endDate);
        if (category) add('category = ?', category);

        const rows = await many(
            `select * from pos.expenses${where.length ? ` where ${where.join(' and ')}` : ''}`
            + ' order by expense_date desc, created_at desc',
            params,
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching expenses:', err);
        res.status(500).json({ error: 'Failed to fetch expenses' });
    }
});

// Create expense
app.post('/api/expenses', authenticateToken, requireStaff, async (req, res) => {
    try {
        const { category, description, amount, expense_date } = req.body;
        if (!EXPENSE_CATEGORIES.includes(category)) {
            return res.status(400).json({ error: `Category must be one of: ${EXPENSE_CATEGORIES.join(', ')}` });
        }
        const value = parseFloat(amount);
        // A blank or mistyped amount used to be saved as NaN and then read back as null, which
        // silently left it out of the profit figure.
        if (!Number.isFinite(value) || value <= 0) {
            return res.status(400).json({ error: 'Amount must be a number greater than zero' });
        }

        const row = await one(
            `insert into pos.expenses (category, description, amount, expense_date, created_by)
             values ($1, $2, $3, coalesce($4::date, current_date), $5) returning *`,
            [category, description || null, value, expense_date || null, req.user.id],
        );
        res.status(201).json(row);
    } catch (err) {
        console.error('Error creating expense:', err);
        res.status(500).json({ error: 'Failed to create expense' });
    }
});

// Update expense (founder only)
app.put('/api/expenses/:id', authenticateToken, requireFounder, async (req, res) => {
    try {
        const patch = {};
        if (req.body.category !== undefined) {
            if (!EXPENSE_CATEGORIES.includes(req.body.category)) {
                return res.status(400).json({ error: `Category must be one of: ${EXPENSE_CATEGORIES.join(', ')}` });
            }
            patch.category = req.body.category;
        }
        if (req.body.description !== undefined) patch.description = req.body.description || null;
        if (req.body.expense_date !== undefined) patch.expense_date = req.body.expense_date;
        if (req.body.amount !== undefined) {
            const value = parseFloat(req.body.amount);
            if (!Number.isFinite(value) || value <= 0) {
                return res.status(400).json({ error: 'Amount must be a number greater than zero' });
            }
            patch.amount = value;
        }

        const { keys, sql, values } = setClause(patch, EXPENSE_COLUMNS);
        if (keys.length === 0) return res.status(400).json({ error: 'Nothing to update' });

        const row = await one(`update pos.expenses set ${sql} where id = $1 returning *`, [req.params.id, ...values]);
        if (!row) return res.status(404).json({ error: 'Expense not found' });
        res.json(row);
    } catch (err) {
        console.error('Error updating expense:', err);
        res.status(500).json({ error: 'Failed to update expense' });
    }
});

// Delete expense (founder only)
app.delete('/api/expenses/:id', authenticateToken, requireFounder, async (req, res) => {
    try {
        const removed = await count('delete from pos.expenses where id = $1', [req.params.id]);
        if (!removed) return res.status(404).json({ error: 'Expense not found' });
        res.json({ message: 'Expense deleted' });
    } catch (err) {
        console.error('Error deleting expense:', err);
        res.status(500).json({ error: 'Failed to delete expense' });
    }
});

// ================== GST REPORT ROUTES ==================

// Shop sales are rung up GST-inclusive at 5%, so a bill of 1,050 is 1,000 of goods and 50 of
// tax. Both reports split it the same way; keeping the figure in one place stops the GST return
// and the profit statement from disagreeing.
const GST_INCLUSIVE_DIVISOR = 1.05;

app.get('/api/reports/gst', authenticateToken, requireStaff, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Grouped by month in the database rather than by walking every row in JavaScript: a
        // year of bills is one small answer instead of thousands of rows over the wire.
        const rows = await many(
            `with purchases as (
               select to_char(b.bill_date, 'YYYY-MM') as month,
                      sum(b.total_amount) as purchase_total,
                      sum(case when b.is_local_transaction then coalesce(b.gst_amount, 0) / 2 else 0 end) as input_cgst,
                      sum(case when b.is_local_transaction then coalesce(b.gst_amount, 0) / 2 else 0 end) as input_sgst,
                      sum(case when b.is_local_transaction then 0 else coalesce(b.gst_amount, 0) end) as input_igst,
                      sum(coalesce(b.gst_amount, 0)) as input_total
                 from pos.vendor_bills b
                where b.bill_date is not null
                  and ($1::date is null or b.bill_date >= $1::date)
                  and ($2::date is null or b.bill_date <= $2::date)
                group by 1
             ), sales as (
               select to_char(b.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month,
                      sum(b.total_amount) as sales_total,
                      sum(b.total_amount - b.total_amount / $3::numeric) as output_total
                 from pos.bills b
                where ($1::date is null or b.created_at >= ($1::date::timestamp at time zone 'Asia/Kolkata'))
                  and ($2::date is null or b.created_at < (($2::date + 1)::timestamp at time zone 'Asia/Kolkata'))
                group by 1
             )
             select coalesce(p.month, s.month) as month,
                    round(coalesce(p.input_cgst, 0), 2) as input_cgst,
                    round(coalesce(p.input_sgst, 0), 2) as input_sgst,
                    round(coalesce(p.input_igst, 0), 2) as input_igst,
                    round(coalesce(p.input_total, 0), 2) as input_total,
                    round(coalesce(s.output_total, 0) / 2, 2) as output_cgst,
                    round(coalesce(s.output_total, 0) / 2, 2) as output_sgst,
                    0 as output_igst,
                    round(coalesce(s.output_total, 0), 2) as output_total,
                    round(coalesce(p.purchase_total, 0), 2) as purchase_total,
                    round(coalesce(s.sales_total, 0), 2) as sales_total
               from purchases p
               full join sales s on s.month = p.month
              order by 1`,
            [startDate || null, endDate || null, GST_INCLUSIVE_DIVISOR],
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching GST report:', err);
        res.status(500).json({ error: 'Failed to fetch GST report' });
    }
});

// ================== PROFIT & LOSS ROUTES ==================

app.get('/api/reports/profit-loss', authenticateToken, requireStaff, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const months = await many(
            `with sales as (
               select to_char(b.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month,
                      -- The 5% is collected for the government, so it is not revenue.
                      sum(b.total_amount / $3::numeric) as revenue,
                      sum(coalesce(b.total_cost, 0)) as cogs
                 from pos.bills b
                where ($1::date is null or b.created_at >= ($1::date::timestamp at time zone 'Asia/Kolkata'))
                  and ($2::date is null or b.created_at < (($2::date + 1)::timestamp at time zone 'Asia/Kolkata'))
                group by 1
             ), spend as (
               -- Grouped by month and heading first, so each month has each heading once and
               -- jsonb_object_agg cannot be handed the same key twice.
               select e.month,
                      sum(e.category_total) as expenses,
                      jsonb_object_agg(e.category, e.category_total) as expense_breakdown
                 from (select to_char(expense_date, 'YYYY-MM') as month, category, sum(amount) as category_total
                         from pos.expenses
                        where ($1::date is null or expense_date >= $1::date)
                          and ($2::date is null or expense_date <= $2::date)
                        group by 1, 2) e
                group by 1
             )
             select coalesce(s.month, x.month) as month,
                    round(coalesce(s.revenue, 0), 2) as revenue,
                    round(coalesce(s.cogs, 0), 2) as cogs,
                    round(coalesce(x.expenses, 0), 2) as expenses,
                    coalesce(x.expense_breakdown, '{}'::jsonb) as expense_breakdown,
                    round(coalesce(s.revenue, 0) - coalesce(s.cogs, 0), 2) as gross_profit,
                    round(coalesce(s.revenue, 0) - coalesce(s.cogs, 0) - coalesce(x.expenses, 0), 2) as net_profit
               from sales s
               full join spend x on x.month = s.month
              order by 1`,
            [startDate || null, endDate || null, GST_INCLUSIVE_DIVISOR],
        );

        // Postgres hands numeric back as a string so no paise are lost in transit; the screen
        // charts these, so they become numbers here.
        for (const m of months) {
            m.expense_breakdown = Object.fromEntries(
                Object.entries(m.expense_breakdown || {}).map(([category, value]) => [category, Number(value)]),
            );
        }

        const sum = (field) => Math.round(months.reduce((total, m) => total + Number(m[field]), 0) * 100) / 100;
        const revenue = sum('revenue');
        const cogs = sum('cogs');
        const expenses = sum('expenses');

        res.json({
            months,
            totals: {
                revenue,
                cogs,
                gross_profit: Math.round((revenue - cogs) * 100) / 100,
                expenses,
                net_profit: Math.round((revenue - cogs - expenses) * 100) / 100,
            },
        });
    } catch (err) {
        console.error('Error fetching P&L report:', err);
        res.status(500).json({ error: 'Failed to fetch profit & loss report' });
    }
});

// ================== BILL IMAGE UPLOAD & EXTRACTION ==================

// Maps the Tesseract reader's flat answer onto the {vendor, transaction, items}
// shape that extract_bill.py returns and the validation below expects.
const fromTesseract = (d) => ({
    vendor: {
        company_name: d.company_name || '',
        gst_number: d.vendor_gst_number || '',
        bill_number: d.bill_number || '',
        bill_date: d.bill_date || ''
    },
    transaction: { is_local: d.is_local_transaction !== false },
    charges: {
        discount_amount: d.discount_amount || 0,
        packing_charges: d.packing_charges || 0
    },
    items: (d.items || []).map((item) => ({
        saree_name: item.saree_name,
        material: item.material,
        quantity: item.quantity,
        cost_price: item.cost_price,
        hsn_code: item.hsn_code
    }))
});

app.post('/api/inventory/upload-bill', authenticateToken, requireStaff, singleBill, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // The reader always gets the untouched original (best OCR accuracy); only the
        // stored copy is shrunk. WebP q80 at <=2000px keeps small print sharp at
        // roughly a third less size than JPEG.
        const imageBuffer = req.file.buffer;
        const mimeType = req.file.mimetype;
        const isImage = mimeType.startsWith('image/');
        const fileName = isImage
            ? `bill_${Date.now()}.webp`
            : `bill_${Date.now()}_${req.file.originalname}`;
        const storedBuffer = isImage
            ? await sharp(imageBuffer)
                .rotate()
                .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80, effort: 6 })
                .toBuffer()
            : imageBuffer;

        // 1. Keep the bill. Its own bucket, with public access switched off at the bucket
        // level: a vendor's bill carries their GST number and often their bank details.
        let storedPath;
        try {
            storedPath = await storeBill(fileName, storedBuffer, isImage ? 'image/webp' : mimeType);
        } catch (uploadError) {
            console.error('Could not store the bill:', uploadError);
            return res.status(500).json({ error: 'Failed to upload image to storage' });
        }

        // 2. Read the bill with the offline extractor (api/extract_bill.py). It runs
        // in the same deployment, so the image never leaves Vercel and no API key or
        // third-party service is involved.
        // On the VPS the bill is read by the Tesseract service (lakshmi-ocr) instead,
        // which takes a multipart upload and answers in its own flat shape.
        const tesseractUrl = ocrBase();
        const extractorUrl = process.env.EXTRACTOR_URL || `https://${req.headers.host}/api/extract_bill`;

        let extractResponse;
        try {
            if (tesseractUrl) {
                // Signed with this service's own identity: the reader is private and refuses
                // anyone else (api/ocr.js).
                extractResponse = await callOcr('ocr', imageBuffer, mimeType, fileName);
            } else {
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
            }
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
            if (tesseractUrl) extractedData = fromTesseract(extractedData.extracted_data || {});
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
            charges: {
                discount_amount: parseFloat(extractedData.charges?.discount_amount) || 0,
                packing_charges: parseFloat(extractedData.charges?.packing_charges) || 0
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
            storage_path: storedPath,
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
app.get('/api/inventory/bill-image/:path', authenticateToken, requireStaff, async (req, res) => {
    try {
        // Streamed through this endpoint rather than handed out as a link. The bucket is
        // private, and signing a link needs a service account, which a laptop signed in as a
        // person does not have - so the same code would work in production and fail in
        // development. An <img> tag sends the login cookie by itself, so this works in both.
        const file = await readBill(req.params.path);
        if (!file) return res.status(404).json({ error: 'Bill image not found' });
        res.set('Content-Type', file.contentType);
        res.set('Cache-Control', 'private, max-age=300');
        res.send(file.buffer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get image URL' });
    }
});

// ================== PRODUCT PHOTOS ==================
// Photos uploaded here land in the public `product-photos` bucket and the URL
// is stored on products.image_url, which the storefront reads directly.

app.post('/api/products/:id/photo', authenticateToken, requireStaff, singlePhoto, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        if (!req.file.mimetype.startsWith('image/')) {
            return res.status(400).json({ error: 'Only images can be used as product photos' });
        }

        const { id } = req.params;
        const product = await one('select id from pos.products where id = $1', [id]);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        // Stored twice - a small WebP for the screens and the website, and the untouched
        // photo, because a squeezed picture cannot be un-squeezed later (api/storage.js).
        const { url, stamp } = await storePhoto(`products/${id}`, req.file.buffer);

        const saved = await one(
            'update pos.products set image_url = $2, updated_at = now() where id = $1 returning *',
            [id, url],
        );

        // Each upload gets a fresh stamp, so replacing a photo would leave the old pair in the
        // bucket for ever. Sweep once the new URL is safely saved; an orphan costs storage but
        // does not break the saree, so a failure here is logged, not returned.
        await sweepFolder(`products/${id}`, stamp).catch((err) => console.error('Stale photo cleanup failed:', err.message));

        res.json({ success: true, image_url: url, original_url: originalUrlFor(url), product: saved });
    } catch (error) {
        console.error('Product photo upload error:', error);
        res.status(500).json({ error: error.message || 'Failed to upload product photo' });
    }
});

app.delete('/api/products/:id/photo', authenticateToken, requireStaff, async (req, res) => {
    try {
        const { id } = req.params;
        const saved = await one(
            'update pos.products set image_url = null, updated_at = now() where id = $1 returning *',
            [id],
        );
        if (!saved) return res.status(404).json({ error: 'Product not found' });

        // Clear the bucket too, or "Remove" only hides the photo and keeps paying for it.
        await sweepFolder(`products/${id}`).catch((err) => console.error('Photo file cleanup failed:', err.message));
        res.json({ success: true, product: saved });
    } catch (error) {
        console.error('Product photo delete error:', error);
        res.status(500).json({ error: 'Failed to remove product photo' });
    }
});

// ================== WEBSITE PAGE ==================
// After Stock In, each saree waits here for its website details: category, colour
// variants (one photo each) and the "show on website" switch. The public site reads
// the website_products view, never these routes.

// ?status=todo (not on the website yet) or ?status=live
app.get('/api/website/products', authenticateToken, async (req, res) => {
    try {
        const live = req.query.status === 'live';
        // The colours come back nested and already in the order the screen shows them, so the
        // sort no longer happens in JavaScript after the fact.
        const rows = await many(
            // cost_code is on the sticker, and colour labels are printed from this screen, so
            // it has to travel with the saree. forRole still takes it back off a salesman.
            `select p.id, p.sku, p.barcode_no, p.vendor_name, p.saree_name, p.saree_type, p.color,
                    p.main_color_pieces, p.material, p.selling_price_a, p.selling_price_b,
                    p.cost_code, p.image_url, p.quantity, p.status, p.on_website, p.created_at,
                    coalesce((
                      select jsonb_agg(jsonb_build_object(
                               'id', c.id, 'color_name', c.color_name, 'sku', c.sku,
                               'barcode_no', c.barcode_no, 'image_url', c.image_url,
                               'pieces', c.pieces, 'sort_order', c.sort_order, 'created_at', c.created_at)
                             order by c.sort_order, c.created_at)
                        from pos.product_colors c where c.product_id = p.id), '[]'::jsonb) as product_colors
               from pos.products p
              where p.on_website = $1 and p.status = 'available'
              order by p.created_at desc`,
            [live],
        );
        res.json(rows.map((row) => forRole(req, row)));
    } catch (err) {
        console.error('Website products error:', err);
        res.status(500).json({ error: 'Failed to load website products' });
    }
});

/**
 * Write a saree out as a listing the website can show, inside the caller's transaction.
 *
 * The listing holds no stock and no prices of its own worth the name: stock is counted
 * live from the shop's piece counts through store.variant_stock, and a republish rewrites
 * the prices from the shop. One colour becomes one thing a shopper can pick, and the saree's
 * own colour - the one the main photo shows - becomes another, linked with a null colour so
 * store.variant_stock knows to read main_color_pieces for it.
 *
 * Republishing is how an edit reaches the website: the listing keeps its id and its slug, so
 * a link already sent to a customer still works, while the colours are rebuilt from scratch.
 */
const publishToWebsite = async (client, productId) => {
    const saree = (await client.query(
        `select id, sku, saree_name, saree_type, material, color, main_color_pieces,
                selling_price_a, selling_price_b, image_url
           from pos.products where id = $1`,
        [productId],
    )).rows[0];
    if (!saree) return { error: 'Product not found' };

    const colours = (await client.query(
        'select id, color_name, sku, image_url, pieces from pos.product_colors where product_id = $1 order by sort_order, created_at',
        [productId],
    )).rows;

    // The owner's rules, written down in docs/website-mapping.md. A listing with no picture
    // is skipped by shoppers, and a saree with nothing to choose between is a counter sale.
    if (!saree.image_url) return { error: 'Add a main photo before showing it on the website' };
    if (!saree.saree_type) return { error: 'Choose a category before showing it on the website' };
    const withPhotos = colours.filter((c) => c.image_url);
    if (!withPhotos.length) {
        return { error: 'Add at least one colour with a photo before showing it on the website' };
    }

    const category = (await client.query('select id, title from store.categories where slug = $1', [saree.saree_type])).rows[0];
    if (!category) return { error: `The category "${saree.saree_type}" does not exist on the website yet` };

    // The sku is the one printed on the sticker, so the slug built from it stays stable
    // across every republish and across a rename of the saree.
    const slug = `${(saree.saree_name || 'saree').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'saree'}-${saree.sku.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const price = Number(saree.selling_price_a) || 0;
    const sale = Number(saree.selling_price_b) || 0;
    // The website refuses a sale price that is not below the full price, and the shop is
    // free to set them equal.
    const discount = sale > 0 && sale < price ? sale : null;

    const rows = [
        // The main photo's own colour, when the shop has given it one and some pieces.
        ...(saree.color && saree.main_color_pieces > 0
            ? [{ colorId: null, name: saree.color, sku: saree.sku, image: saree.image_url }]
            : []),
        ...withPhotos.map((c) => ({ colorId: c.id, name: c.color_name, sku: c.sku || `${saree.sku}-${c.id.slice(0, 4)}`, image: c.image_url })),
    ];

    // The shop types no prose, so the listing's words are written from what it already knows:
    // the shelf the saree was put on, the colours that have a photo, and the code on its
    // sticker. Nothing about length, blouse piece or weave is invented - a shopper who finds
    // one of those wrong stops believing the rest of the page.
    const title = saree.saree_name || saree.sku;
    const colourNames = rows.map((row) => row.name);
    const fabric = saree.material && saree.material !== 'Not specified' ? saree.material : category.title;
    const description = [
        `${title} is a ${category.title.toLowerCase()} saree from Lakshmi Sarees, Rajahmundry.`,
        colourNames.length > 1
            ? `It comes in ${colourNames.length} colours - ${colourNames.join(', ')} - and each colour is photographed on this page, so the shade chosen is the shade sent.`
            : `It comes in ${colourNames[0]}, photographed on this page.`,
        `Shop code ${saree.sku}.`,
    ].join(' ');
    // Care advice belongs to the cloth rather than to one saree, so it is chosen by the shelf
    // instead of being typed in again for every listing.
    const care = /silk|pattu|fancy/.test(saree.saree_type)
        ? 'Dry clean only. Do not wring or brush the zari. Keep the saree folded in a soft cotton cloth away from direct sunlight, and refold it every few months so the creases do not set in one place.'
        : 'Hand wash separately in cold water and dry in the shade. Warm iron on the reverse side.';

    const listing = (await client.query(
        `insert into store.products (slug, name, subtitle, fabric, description, care_instructions, status, published_at)
         values ($1, $2, $3, $4, $5, $6, 'published', now())
         on conflict (slug) do update
            set name = excluded.name, subtitle = excluded.subtitle, fabric = excluded.fabric,
                description = excluded.description, care_instructions = excluded.care_instructions,
                status = 'published', published_at = coalesce(store.products.published_at, now())
         returning id`,
        [slug, title, category.title, fabric, description, care],
    )).rows[0];

    // Colours are rebuilt rather than patched: a colour deleted in the shop has to leave the
    // website too, and matching them up one by one would be more code for the same answer.
    // The stock links go with them; nothing in pos.* is touched by the delete.
    await client.query('delete from store.product_variants where product_id = $1', [listing.id]);
    await client.query('delete from store.product_images where product_id = $1', [listing.id]);

    for (const [index, row] of rows.entries()) {
        const variant = (await client.query(
            `insert into store.product_variants (product_id, sku, color, price, discount_price, position, is_active)
             values ($1, $2, $3, $4, $5, $6, true) returning id`,
            [listing.id, row.sku, row.name, price, discount, index],
        )).rows[0];

        await client.query(
            `insert into store.variant_stock_source (variant_id, product_id, color_id)
             values ($1, $2, $3)
             on conflict (variant_id) do update set product_id = excluded.product_id, color_id = excluded.color_id`,
            [variant.id, saree.id, row.colorId],
        );

        await client.query(
            `insert into store.product_images (product_id, variant_id, url, alt, position)
             values ($1, $2, $3, $4, $5)`,
            [listing.id, variant.id, row.image, `${title} - ${row.name}`, index],
        );
    }

    await client.query(
        `insert into store.product_categories (product_id, category_id, is_primary)
         values ($1, $2, true)
         on conflict (product_id, category_id) do update set is_primary = true`,
        [listing.id, category.id],
    );

    return { listingId: listing.id, variants: rows.length };
};

/**
 * Take a saree back off the website. The listing is hidden rather than deleted: an order
 * placed while it was up still points at it, and a saree usually comes back once it has been
 * photographed again or restocked.
 */
const unpublishFromWebsite = async (client, productId) => {
    const sku = (await client.query('select sku from pos.products where id = $1', [productId])).rows[0]?.sku;
    if (!sku) return;
    await client.query(
        `update store.products set status = 'draft', updated_at = now()
          where id in (select distinct v.product_id from store.product_variants v
                       join store.variant_stock_source s on s.variant_id = v.id
                      where s.product_id = $1)`,
        [productId],
    );
};

// Category and the website switch
app.put('/api/website/products/:id', authenticateToken, requireStaff, async (req, res) => {
    try {
        const changes = {};
        if (req.body.saree_type !== undefined) changes.saree_type = req.body.saree_type || null;
        if (req.body.on_website !== undefined) changes.on_website = !!req.body.on_website;
        if (req.body.color !== undefined) changes.color = titleCase(req.body.color) || null;
        if (req.body.main_color_pieces !== undefined) changes.main_color_pieces = Math.max(0, parseInt(req.body.main_color_pieces) || 0);

        const { keys, sql, values } = setClause(changes, ['saree_type', 'on_website', 'color', 'main_color_pieces']);
        if (keys.length === 0) return res.status(400).json({ error: 'Nothing to update' });

        // The check and the switch happen in one transaction, so a colour whose photo is
        // deleted at the same moment cannot slip onto the website between the two.
        const result = await tx(async (client) => {
            if (changes.on_website === true) {
                // A colour with no photo would show as an empty tile on the website.
                const bare = (await client.query(
                    'select color_name from pos.product_colors where product_id = $1 and image_url is null order by sort_order',
                    [req.params.id],
                )).rows;
                if (bare.length) return { bare: bare.map((c) => c.color_name) };
            }
            const row = (await client.query(
                `update pos.products set ${sql}, updated_at = now() where id = $1
                 returning id, saree_type, on_website, color, main_color_pieces`,
                [req.params.id, ...values],
            )).rows[0];
            if (!row) return { row };

            // The switch is what puts the saree in front of a shopper, so the listing is
            // written in the same transaction: a flag that says "on the website" with no
            // listing behind it would be a lie the next screen would repeat.
            if (changes.on_website === true) {
                const published = await publishToWebsite(client, req.params.id);
                // Thrown, not returned: returning would let the transaction commit, and the
                // saree would be flagged as on the website with no listing behind it - which
                // is exactly the lie this route exists to prevent.
                if (published.error) throw Object.assign(new Error(published.error), { refused: true });
                return { row, published };
            }
            if (changes.on_website === false) await unpublishFromWebsite(client, req.params.id);

            // An edit to a saree that is already up has to reach the website too, or the
            // shop and the shelf drift apart until someone toggles the switch.
            if (changes.on_website === undefined && row.on_website) {
                const published = await publishToWebsite(client, req.params.id);
                if (published.error) throw Object.assign(new Error(published.error), { refused: true });
            }
            return { row };
        });

        if (result.bare) {
            return res.status(400).json({
                error: `Add photos for ${result.bare.join(', ')} before showing it on the website`,
            });
        }
        if (!result.row) return res.status(404).json({ error: 'Product not found' });
        res.json(result.row);
    } catch (err) {
        if (err.refused) return res.status(400).json({ error: err.message });
        console.error('Website product update error:', err);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Add one colour, with or without its photo (multipart: photo + color_name)
const storeColourPhoto = async (productId, buffer) => {
    // Its own folder, separate from the saree's main photo, whose upload sweeps its folder.
    const { url } = await storePhoto(`colors/${productId}`, buffer);
    return url;
};

app.post('/api/website/products/:id/colors', authenticateToken, requireStaff, singlePhoto, async (req, res) => {
    try {
        // "red" and "RED" must be the same colour for the website's colour filter.
        const colorName = titleCase(req.body.color_name);
        if (!colorName) return res.status(400).json({ error: 'Colour name is required' });

        const parent = await one('select id, sku from pos.products where id = $1', [req.params.id]);
        if (!parent) return res.status(404).json({ error: 'Product not found' });

        // Two colours can share the first three letters (Dark Blue / Dark Green) and the
        // barcode has to stay unique, so a clash gets a number. One query finds every name
        // already taken instead of asking once per attempt.
        const base = `${parent.sku || 'S'}-${colorName.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'CLR'}`;
        const taken = new Set((await many(
            'select sku from pos.product_colors where sku = $1 or sku like $2',
            [base, `${base}%`],
        )).map((r) => r.sku));
        let colourSku = base;
        for (let n = 2; taken.has(colourSku) && n < 100; n++) colourSku = `${base}${n}`;

        // The photo is optional: colours are often tagged from the vendor's sheet first and
        // photographed later, and the website switch is what refuses a colour with no picture.
        const imageUrl = req.file ? await storeColourPhoto(req.params.id, req.file.buffer) : null;
        const pieces = Math.max(0, parseInt(req.body.pieces) || 0);

        const row = await one(
            `insert into pos.product_colors (product_id, color_name, sku, image_url, pieces, sort_order)
             values ($1, $2, $3, $4, $5,
                     (select count(*) from pos.product_colors where product_id = $1))
             returning *`,
            [req.params.id, colorName, colourSku, imageUrl, pieces],
        );
        res.status(201).json(row);
    } catch (err) {
        console.error('Add colour error:', err);
        res.status(500).json({ error: 'Failed to add colour' });
    }
});

// A vendor colour sheet (PDF or photo) cut into one picture per colour.
// Nothing is saved here: the screen shows the pictures and the staff member
// names the ones worth keeping, which then go through the normal colour route.
app.post('/api/website/colors/split', authenticateToken, requireStaff, singlePhotoAny, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Choose a PDF or a photo' });

        if (!ocrBase()) return res.status(503).json({ error: 'Splitter is not configured' });

        const reply = await callOcr('split', req.file.buffer, req.file.mimetype, req.file.originalname || 'sheet');
        if (!reply.ok) {
            console.error('Splitter returned', reply.status, await reply.text().catch(() => ''));
            return res.status(502).json({ error: 'Could not read that file' });
        }

        const data = await reply.json();
        res.json({ photos: data.photos || [] });
    } catch (err) {
        console.error('Split colour sheet error:', err);
        res.status(500).json({ error: 'Could not split that file' });
    }
});

// Correct a colour's name or its piece count. Names get typed in a hurry and a count is
// often a recount off the shelf, so both have to be fixable without deleting the colour and
// starting again - deleting would take its photo and its barcode with it.
app.patch('/api/website/colors/:id', authenticateToken, requireStaff, async (req, res) => {
    try {
        const colour = await one('select id from pos.product_colors where id = $1', [req.params.id]);
        if (!colour) return res.status(404).json({ error: 'Colour not found' });

        const renaming = req.body.color_name !== undefined;
        const recounting = req.body.pieces !== undefined;
        if (!renaming && !recounting) return res.status(400).json({ error: 'Nothing to change' });

        // "red" and "RED" must stay the same colour for the website's colour filter.
        const colorName = renaming ? titleCase(req.body.color_name) : null;
        if (renaming && !colorName) return res.status(400).json({ error: 'Colour name is required' });

        const pieces = recounting ? Math.max(0, parseInt(req.body.pieces) || 0) : null;

        // The sku is left alone on a rename. It is printed on every sticker already stuck to a
        // saree, and the scanner at the counter looks the colour up by exactly that code.
        const row = await one(
            `update pos.product_colors
                set color_name = coalesce($2, color_name),
                    pieces     = coalesce($3, pieces),
                    status     = case when coalesce($3, pieces) <= 0 then 'sold' else 'available' end,
                    updated_at = now()
              where id = $1
          returning *`,
            [req.params.id, colorName, pieces],
        );
        res.json(row);
    } catch (err) {
        console.error('Edit colour error:', err);
        res.status(500).json({ error: 'Failed to save the colour' });
    }
});

// The photo for a colour created earlier without one (or a replacement shot).
app.put('/api/website/colors/:id/photo', authenticateToken, requireStaff, singlePhoto, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Choose a photo' });

        const colour = await one('select id, product_id, image_url from pos.product_colors where id = $1', [req.params.id]);
        if (!colour) return res.status(404).json({ error: 'Colour not found' });

        const imageUrl = await storeColourPhoto(colour.product_id, req.file.buffer);
        const row = await one(
            'update pos.product_colors set image_url = $2, updated_at = now() where id = $1 returning *',
            [req.params.id, imageUrl],
        );

        // The old shot is dead weight once the new one is saved. Only that one pair is deleted:
        // every colour of this saree shares the folder.
        if (colour.image_url) {
            await deletePhotoPair(colour.image_url).catch((err) => console.error('Old colour photo cleanup failed:', err.message));
        }
        res.json(row);
    } catch (err) {
        console.error('Set colour photo error:', err);
        res.status(500).json({ error: 'Failed to save the photo' });
    }
});

// Remove one colour and its photo
app.delete('/api/website/colors/:id', authenticateToken, requireStaff, async (req, res) => {
    try {
        // Taking a colour off a saree that is live on the website would leave the shop with a
        // page it cannot show, so it comes off the website at the same time.
        const removed = await tx(async (client) => {
            const colour = (await client.query('delete from pos.product_colors where id = $1 returning *', [req.params.id])).rows[0];
            if (!colour) return null;
            const left = (await client.query(
                'select count(*)::int as n from pos.product_colors where product_id = $1 and image_url is null',
                [colour.product_id],
            )).rows[0].n;
            if (left > 0) {
                await client.query("update pos.products set on_website = false, updated_at = now() where id = $1 and on_website", [colour.product_id]);
            }
            return colour;
        });

        if (!removed) return res.status(404).json({ error: 'Colour not found' });
        if (removed.image_url) {
            await deletePhotoPair(removed.image_url).catch((err) => console.error('Colour photo cleanup failed:', err.message));
        }
        res.json({ message: 'Colour removed' });
    } catch (err) {
        console.error('Remove colour error:', err);
        res.status(500).json({ error: 'Failed to remove colour' });
    }
});

// ================== THE WEBSITE ITSELF ==================
// Which sarees sit on which shelf, which home page sections are shown, and the wording in
// the header and the footer. Until this screen existed all three could only be changed in
// SQL by whoever held the database password, which is why the home page still advertised
// shelves holding nothing and claimed certifications the shop does not have.

// The listing a POS saree was published as. Found through the stock links rather than by
// rebuilding the slug, so a saree renamed in the shop still finds its own listing.
const listingFor = async (client, productId) => (await client.query(
    `select distinct p.id, p.slug, p.name
       from store.variant_stock_source s
       join store.product_variants v on v.id = s.variant_id
       join store.products p on p.id = v.product_id
      where s.product_id = $1`,
    [productId],
)).rows[0] || null;

app.get('/api/website/site', authenticateToken, requireStaff, async (req, res) => {
    try {
        // Shelves carry a count so the shop can see at a glance which ones a shopper would
        // find empty - that is the whole reason the home page looked broken.
        const shelves = await many(
            `select c.slug, c.title, c.sort_order,
                    count(pc.product_id) filter (where p.status = 'published')::int as products
               from store.categories c
               left join store.product_categories pc on pc.category_id = c.id
               left join store.products p on p.id = pc.product_id
              where c.status = 'published'
              group by c.slug, c.title, c.sort_order
              order by c.sort_order`,
        );

        // payload is a different shape per section type, so only the few fields the screen
        // shows are lifted out of it; the rest stays untouched in the database.
        const sections = await many(
            `select id, type, position, is_active,
                    payload->>'title' as title,
                    payload->>'collectionSlug' as collection_slug
               from store.cms_blocks
              order by position`,
        );

        const settings = await many('select key, value, description from store.site_settings order by key');

        // Every saree the shop has put on the website, with the shelves it sits on now.
        const live = await many(
            `select p.id, p.sku, p.saree_name, p.image_url,
                    coalesce((
                      select array_agg(distinct c.slug)
                        from store.variant_stock_source s
                        join store.product_variants v on v.id = s.variant_id
                        join store.product_categories pc on pc.product_id = v.product_id
                        join store.categories c on c.id = pc.category_id
                       where s.product_id = p.id), '{}') as shelves
               from pos.products p
              where p.on_website and p.status = 'available'
              order by p.saree_name`,
        );

        res.json({ shelves, sections, settings, products: live });
    } catch (err) {
        console.error('Website site read error:', err);
        res.status(500).json({ error: 'Failed to load the website settings' });
    }
});

// Which shelves one saree sits on. Sent whole rather than one shelf at a time: the screen
// holds the full set of ticks, and replacing them is one statement instead of working out
// which ticks changed.
app.put('/api/website/products/:id/shelves', authenticateToken, requireStaff, async (req, res) => {
    try {
        const asked = [...new Set((req.body.shelves || []).filter((slug) => typeof slug === 'string'))];
        if (!asked.length) return res.status(400).json({ error: 'A saree has to sit on at least one shelf' });

        const result = await tx(async (client) => {
            const listing = await listingFor(client, req.params.id);
            if (!listing) return { missing: true };

            const shelves = (await client.query(
                "select id, slug from store.categories where slug = any($1) and status = 'published'",
                [asked],
            )).rows;
            const unknown = asked.filter((slug) => !shelves.some((shelf) => shelf.slug === slug));
            if (unknown.length) return { unknown };

            await client.query('delete from store.product_categories where product_id = $1', [listing.id]);
            // The first shelf ticked is the primary one: it is the shelf the website shows in
            // the breadcrumb above the saree's name.
            for (const [index, shelf] of shelves.entries()) {
                await client.query(
                    'insert into store.product_categories (product_id, category_id, is_primary) values ($1, $2, $3)',
                    [listing.id, shelf.id, index === 0],
                );
            }
            return { shelves: shelves.map((shelf) => shelf.slug) };
        });

        if (result.missing) return res.status(404).json({ error: 'That saree is not on the website yet' });
        if (result.unknown) return res.status(400).json({ error: `No such shelf: ${result.unknown.join(', ')}` });
        res.json(result);
    } catch (err) {
        console.error('Website shelves error:', err);
        res.status(500).json({ error: 'Failed to save the shelves' });
    }
});

// A home page section switched on or off. Nothing else about it can be changed here: each
// type has its own renderer on the website, and its payload is not the shop's to edit yet.
app.patch('/api/website/sections/:id', authenticateToken, requireStaff, async (req, res) => {
    try {
        if (typeof req.body.is_active !== 'boolean') return res.status(400).json({ error: 'is_active must be true or false' });
        const row = await one(
            'update store.cms_blocks set is_active = $2 where id = $1 returning id, type, position, is_active',
            [req.params.id, req.body.is_active],
        );
        if (!row) return res.status(404).json({ error: 'Section not found' });
        res.json(row);
    } catch (err) {
        console.error('Website section error:', err);
        res.status(500).json({ error: 'Failed to change the section' });
    }
});

// The header and footer wording. Only keys that already exist can be written: the website
// reads a fixed set of them, so a new key would be stored and never shown.
app.put('/api/website/settings', authenticateToken, requireStaff, async (req, res) => {
    try {
        const changes = Object.entries(req.body || {}).filter(([, value]) => value !== null && value !== undefined);
        if (!changes.length) return res.status(400).json({ error: 'Nothing to save' });

        const result = await tx(async (client) => {
            const known = (await client.query('select key from store.site_settings')).rows.map((row) => row.key);
            const unknown = changes.map(([key]) => key).filter((key) => !known.includes(key));
            if (unknown.length) return { unknown };

            for (const [key, value] of changes) {
                // updated_by is a store.staff_users id, and the person typing is a POS user
                // with no row there, so it is left alone rather than filled with a name that
                // would not fit the column. Who changed a line is not yet recorded anywhere.
                await client.query(
                    'update store.site_settings set value = $2, updated_at = now() where key = $1',
                    [key, JSON.stringify(value)],
                );
            }
            return { saved: changes.map(([key]) => key) };
        });

        if (result.unknown) return res.status(400).json({ error: `The website does not read: ${result.unknown.join(', ')}` });
        res.json(result);
    } catch (err) {
        console.error('Website settings error:', err);
        res.status(500).json({ error: 'Failed to save the wording' });
    }
});

// ================== THE SCREENS ==================
// The built screens are served by this same service, so the shop has one address and the
// session cookie is same-site by construction: no CORS, no third-party cookie rules, and
// nothing to go wrong between two separate deployments.
const SCREENS = process.env.SCREENS_DIR || './public';
if (existsSync(SCREENS)) {
    // Hashed asset names are safe to cache for a year; index.html must not be, or a phone
    // keeps running last week's screens after a deploy.
    app.use(express.static(SCREENS, {
        index: false,
        setHeaders(res, filePath) {
            res.setHeader('Cache-Control', /[.-][0-9a-f]{8,}\.[a-z]+$/i.test(filePath)
                ? 'public, max-age=31536000, immutable'
                : 'no-cache');
        },
    }));

    // Anything that is not an API call is a screen: React Router decides what it means, so
    // a reload on /inventory must return the app rather than a 404.
    app.get(/^(?!\/api\/).*/, (req, res, next) => {
        if (req.method !== 'GET') return next();
        res.sendFile('index.html', { root: SCREENS, headers: { 'Cache-Control': 'no-cache' } });
    });
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Listen always. The old condition skipped listen() when NODE_ENV was production, which
// suited Vercel's serverless wrapper but means a container exits as unhealthy on Cloud Run,
// where the process itself must bind the port Cloud Run hands it.
const server = app.listen(PORT, () => {
    console.log(`API listening on ${PORT}`);
});

// Cloud Run sends SIGTERM before it stops an instance; finishing the bill that is already
// in flight is the difference between a saved sale and a confused customer.
for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
        console.log(`${signal} received, finishing current requests`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 10_000).unref();
    });
}

export default app;
