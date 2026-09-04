const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('./db');
const payments = require('./payments');
const duty = require('./duty');

const app = express();

// Stripe webhook MUST be registered before express.json() — it needs the raw body
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try { res.json(payments.handleWebhook(req)); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || __dirname;
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const FX_CAD_USD = parseFloat(process.env.FX_CAD_USD || '0.73'); // CAD -> USD

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ---------- image upload ----------
const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + (ALLOWED[file.mimetype] || '.jpg')),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, !!ALLOWED[file.mimetype]),
});

// ---------- auth helpers ----------
const COOKIE = 'na_sid';
function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)').run(token, userId, Date.now());
  return token;
}
function currentUser(req) {
  const token = req.cookies[COOKIE];
  if (!token) return null;
  const row = db.prepare(`SELECT u.id,u.name,u.email,u.country,u.city,u.region FROM sessions s
    JOIN users u ON u.id=s.user_id WHERE s.token=?`).get(token);
  return row || null;
}
function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Please log in first.' });
  req.user = u; next();
}

// ---------- helpers ----------
const pub = l => ({
  ...l,
  sold: !!l.sold,
  price_usd: l.currency === 'CAD' ? +(l.price * FX_CAD_USD).toFixed(2) : l.price,
});
const ago = t => {
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d <= 0) return 'today'; if (d === 1) return 'yesterday';
  if (d < 30) return d + ' days ago'; return Math.floor(d / 30) + ' mo ago';
};

db.ready.then(() => {
// ================= AUTH =================
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, country, city, region } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  if (!/^.+@.+\..+$/.test(email)) return res.status(400).json({ error: 'Invalid email address.' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  try {
    const hash = bcrypt.hashSync(String(password), 10);
    const info = db.prepare(`INSERT INTO users (name,email,pass_hash,country,city,region,created_at)
      VALUES (?,?,?,?,?,?,?)`).run(String(name).trim(), String(email).trim().toLowerCase(), hash,
      country === 'Canada' ? 'Canada' : 'USA', city || '', region || '', Date.now());
    const token = createSession(info.lastInsertRowid);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 86400000 });
    res.json({ user: currentUser({ cookies: { [COOKIE]: token } }) });
  } catch (e) {
    res.status(409).json({ error: 'That email is already registered.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(password || ''), u.pass_hash))
    return res.status(401).json({ error: 'Incorrect email or password.' });
  const token = createSession(u.id);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 86400000 });
  res.json({ user: { id: u.id, name: u.name, email: u.email, country: u.country, city: u.city, region: u.region } });
});

app.post('/api/auth/logout', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token=?').run(req.cookies[COOKIE] || '');
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => res.json({ user: currentUser(req) }));

// ================= LISTINGS =================
app.get('/api/listings', (req, res) => {
  const { q, category, condition, country, sort, mine, saved, seller_id } = req.query;
  const me = currentUser(req);
  let sql = `SELECT l.*, u.name AS seller, u.country AS seller_country FROM listings l JOIN users u ON u.id=l.user_id WHERE 1=1`;
  const args = [];
  if (mine === '1' && me) { sql += ' AND l.user_id=?'; args.push(me.id); }
  else if (seller_id) { sql += ' AND l.user_id=?'; args.push(seller_id); }
  else {
    sql += ' AND l.sold=0';
    if (saved === '1' && me) { sql += ' AND l.id IN (SELECT listing_id FROM saves WHERE user_id=?)'; args.push(me.id); }
  }
  if (category && category !== 'All') { sql += ' AND l.category=?'; args.push(category); }
  const conds = condition ? [].concat(condition).filter(Boolean) : [];
  if (conds.length) { sql += ` AND l.condition IN (${conds.map(() => '?').join(',')})`; args.push(...conds); }
  if (country) { sql += ' AND l.country=?'; args.push(country); }
  if (q) { sql += ' AND (l.title LIKE ? OR l.fitment LIKE ? OR l.description LIKE ? OR l.city LIKE ? OR u.name LIKE ?)';
    const like = `%${q}%`; args.push(like, like, like, like, like); }
  sql += ' ORDER BY l.created_at DESC';
  let rows = db.prepare(sql).all(...args).map(pub);
  if (sort === 'price-low') rows.sort((a, b) => a.price_usd - b.price_usd);
  if (sort === 'price-high') rows.sort((a, b) => b.price_usd - a.price_usd);
  if (sort === 'name') rows.sort((a, b) => a.title.localeCompare(b.title));
  res.json({ listings: rows.map(l => ({ ...l, ago: ago(l.created_at), mine: me && l.user_id === me.id, saved: me ? !!db.prepare('SELECT 1 FROM saves WHERE user_id=? AND listing_id=?').get(me.id, l.id) : false })) });
});

app.get('/api/listings/:id', (req, res) => {
  const l = db.prepare(`SELECT l.*, u.name AS seller, u.country AS seller_country, u.city AS seller_city, u.region AS seller_region
    FROM listings l JOIN users u ON u.id=l.user_id WHERE l.id=?`).get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Listing not found.' });
  const me = currentUser(req);
  const sellerListings = db.prepare('SELECT COUNT(*) c FROM listings WHERE user_id=? AND sold=0 AND id!=?').get(l.user_id, l.id).c;
  res.json({ listing: { ...pub(l), ago: ago(l.created_at), mine: me && l.user_id === me.id,
    saved: me ? !!db.prepare('SELECT 1 FROM saves WHERE user_id=? AND listing_id=?').get(me.id, l.id) : false },
    seller: { name: l.seller, country: l.seller_country, city: l.seller_city, region: l.seller_region, active: sellerListings } });
});

app.post('/api/listings', requireAuth, upload.single('image'), (req, res) => {
  const b = req.body;
  const price = parseFloat(b.price);
  if (!b.title || !(price > 0)) return res.status(400).json({ error: 'Title and a valid price are required.' });
  const country = b.country === 'Canada' ? 'Canada' : 'USA';
  const info = db.prepare(`INSERT INTO listings
    (user_id,title,category,condition,price,currency,fitment,description,country,city,region,made_in,image,sold,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`).run(
    req.user.id, String(b.title).trim(), b.category || 'Brakes', b.condition || 'New', price,
    country === 'Canada' ? 'CAD' : 'USD', b.fitment || 'Universal', b.description || '',
    country, b.city || req.user.city || '', b.region || req.user.region || '',
    b.made_in || (country === 'Canada' ? 'Canada' : 'Canada'), req.file ? '/uploads/' + req.file.filename : '', Date.now());
  res.json({ id: info.lastInsertRowid });
});

app.put('/api/listings/:id', requireAuth, upload.single('image'), (req, res) => {
  const l = db.prepare('SELECT * FROM listings WHERE id=?').get(req.params.id);
  if (!l || l.user_id !== req.user.id) return res.status(403).json({ error: 'Not your listing.' });
  const b = req.body, price = parseFloat(b.price || l.price);
  db.prepare(`UPDATE listings SET title=?,category=?,condition=?,price=?,currency=?,fitment=?,description=?,country=?,city=?,region=?,made_in=?,image=COALESCE(?,image) WHERE id=?`)
    .run(String(b.title || l.title).trim(), b.category || l.category, b.condition || l.condition, price,
      b.currency || l.currency, b.fitment || l.fitment, b.description || l.description,
      b.country === 'Canada' ? 'Canada' : 'USA', b.city || l.city, b.region || l.region,
      b.made_in || l.made_in, req.file ? '/uploads/' + req.file.filename : null, l.id);
  res.json({ ok: true });
});

app.delete('/api/listings/:id', requireAuth, (req, res) => {
  const l = db.prepare('SELECT * FROM listings WHERE id=?').get(req.params.id);
  if (!l || l.user_id !== req.user.id) return res.status(403).json({ error: 'Not your listing.' });
  db.prepare('DELETE FROM saves WHERE listing_id=?').run(l.id);
  db.prepare('DELETE FROM messages WHERE listing_id=?').run(l.id);
  db.prepare('DELETE FROM listings WHERE id=?').run(l.id);
  res.json({ ok: true });
});

app.post('/api/listings/:id/sold', requireAuth, (req, res) => {
  const l = db.prepare('SELECT * FROM listings WHERE id=?').get(req.params.id);
  if (!l || l.user_id !== req.user.id) return res.status(403).json({ error: 'Not your listing.' });
  db.prepare('UPDATE listings SET sold=? WHERE id=?').run(l.sold ? 0 : 1, l.id);
  if (!l.sold) db.prepare('UPDATE listings SET created_at=? WHERE id=?').run(Date.now(), l.id); // relist bumps date
  res.json({ sold: !l.sold });
});

// ================= SAVES =================
app.post('/api/listings/:id/save', requireAuth, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO saves (user_id,listing_id) VALUES (?,?)').run(req.user.id, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/listings/:id/save', requireAuth, (req, res) => {
  db.prepare('DELETE FROM saves WHERE user_id=? AND listing_id=?').run(req.user.id, req.params.id);
  res.json({ ok: true });
});

// ================= MESSAGES =================
app.post('/api/messages', requireAuth, (req, res) => {
  const { listing_id, body, to_user } = req.body || {};
  if (!body || !String(body).trim()) return res.status(400).json({ error: 'Message cannot be empty.' });
  const l = db.prepare('SELECT * FROM listings WHERE id=?').get(listing_id);
  if (!l) return res.status(404).json({ error: 'Listing not found.' });
  const to = to_user || l.user_id;
  if (to === req.user.id) return res.status(400).json({ error: 'That is your own listing.' });
  db.prepare('INSERT INTO messages (from_user,to_user,listing_id,body,created_at) VALUES (?,?,?,?,?)')
    .run(req.user.id, to, l.id, String(body).trim(), Date.now());
  res.json({ ok: true });
});

app.get('/api/messages', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT m.*, u.name AS from_name, l.title AS listing_title
    FROM messages m JOIN users u ON u.id=m.from_user JOIN listings l ON l.id=m.listing_id
    WHERE m.to_user=? OR m.from_user=? ORDER BY m.created_at DESC LIMIT 200`).all(req.user.id, req.user.id);
  res.json({ messages: rows.map(m => ({ ...m, ago: ago(m.created_at) })) });
});

// ================= PAYMENTS (Stripe Connect) =================
app.get('/api/payments/status', requireAuth, async (req, res) => {
  res.json(await payments.status(req.user.id));
});

app.post('/api/payments/connect', requireAuth, async (req, res) => {
  try { res.json(await payments.connectUrl(req.user)); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

app.post('/api/payments/checkout', requireAuth, async (req, res) => {
  const l = db.prepare('SELECT * FROM listings WHERE id=?').get(req.body && req.body.listing_id);
  if (!l || l.sold) return res.status(404).json({ error: 'This listing is no longer available.' });
  if (l.user_id === req.user.id) return res.status(400).json({ error: 'That is your own listing.' });
  try { res.json(await payments.checkout(l, req.user)); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

app.get('/api/orders', requireAuth, (req, res) => {
  res.json({ orders: payments.ordersFor(req.user.id) });
});

// ================= DUTY ESTIMATOR =================
app.post('/api/duty-estimate', (req, res) => {
  const { listing_id, destination, province } = req.body || {};
  const l = db.prepare('SELECT * FROM listings WHERE id=?').get(listing_id);
  if (!l) return res.status(404).json({ error: 'Listing not found.' });
  res.json(duty.estimate({
    category: l.category, madeIn: l.made_in,
    valueUsd: pub(l).price_usd,
    destination: destination === 'Canada' ? 'Canada' : 'USA',
    province,
  }));
});

// ---------- error handler (incl. multer upload errors) ----------
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const msg = err instanceof multer.MulterError ? `Upload error: ${err.message}` : (err.message || 'Request failed');
  res.status(400).json({ error: msg });
});

// ---------- boot ----------
app.listen(PORT, () => console.log(`NorthAuto Market running → http://localhost:${PORT}`));

});
