const Stripe = require('stripe');
const db = require('./db');

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const APP_URL = process.env.APP_URL || ('http://localhost:' + (process.env.PORT || 3000));
const FEE_PCT = parseFloat(process.env.PLATFORM_FEE_PCT || '10');

const configured = () => !!stripe;
const feePct = () => FEE_PCT;
const ago = t => { const d = Math.floor((Date.now() - t) / 86400000); if (d <= 0) return 'today'; if (d === 1) return 'yesterday'; if (d < 30) return d + ' days ago'; return Math.floor(d / 30) + ' mo ago'; };
const err = (msg, status) => Object.assign(new Error(msg), { status });

function getAccount(userId) {
  return db.prepare('SELECT * FROM stripe_accounts WHERE user_id=?').get(userId);
}

async function connectUrl(user) {
  if (!stripe) return { demo: true, feePct: FEE_PCT };
  let acct = getAccount(user.id);
  if (!acct) {
    const a = await stripe.accounts.create({
      type: 'express',
      email: user.email,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    });
    db.prepare('INSERT INTO stripe_accounts (user_id,stripe_account_id,created_at) VALUES (?,?,?)').run(user.id, a.id, Date.now());
    acct = { stripe_account_id: a.id };
  }
  const link = await stripe.accountLinks.create({
    account: acct.stripe_account_id,
    refresh_url: APP_URL + '/?connect=refresh',
    return_url: APP_URL + '/?connect=done',
    type: 'account_onboarding',
  });
  return { url: link.url };
}

async function status(userId) {
  const acct = getAccount(userId);
  if (!stripe) return { configured: false, connected: !!acct, charges_enabled: false, feePct: FEE_PCT };
  if (!acct) return { configured: true, connected: false, charges_enabled: false, feePct: FEE_PCT };
  const a = await stripe.accounts.retrieve(acct.stripe_account_id);
  return { configured: true, connected: true, charges_enabled: !!a.charges_enabled, payouts: !!a.payouts_enabled, feePct: FEE_PCT };
}

async function checkout(listing, buyer) {
  if (!stripe) return { demo: true };
  const acct = getAccount(listing.user_id);
  if (!acct) throw err('This seller has not set up payouts yet.', 422);
  const acc = await stripe.accounts.retrieve(acct.stripe_account_id);
  if (!acc.charges_enabled) throw err('This seller\'s payouts are not active yet.', 422);
  const amount = Math.round(listing.price_usd * 100); // cents, USD
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price_data: { currency: 'usd', unit_amount: amount, product_data: { name: listing.title } }, quantity: 1 }],
    payment_intent_data: {
      application_fee_amount: Math.round(amount * FEE_PCT / 100),
      transfer_data: { destination: acct.stripe_account_id },
    },
    metadata: { listing_id: String(listing.id), buyer_id: String(buyer.id), seller_id: String(listing.user_id) },
    success_url: APP_URL + '/?purchased=1',
    cancel_url: APP_URL + '/',
  });
  return { url: session.url };
}

function handleWebhook(req) {
  if (!stripe) throw err('Stripe is not configured.', 400);
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'] || '', process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch (e) { throw err('Webhook verification failed: ' + e.message, 400); }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object, m = s.metadata || {};
    const existing = s.id ? db.prepare('SELECT id FROM orders WHERE stripe_session_id=?').get(s.id) : null;
    if (!existing && m.listing_id) {
      db.prepare(`INSERT INTO orders (listing_id,buyer_id,seller_id,amount_usd,fee_usd,status,stripe_session_id,created_at)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(+m.listing_id, +m.buyer_id, +m.seller_id, (s.amount_total || 0) / 100, (s.application_fee_amount || 0) / 100, 'paid', s.id, Date.now());
      db.prepare('UPDATE listings SET sold=1 WHERE id=?').run(+m.listing_id);
    }
  }
  return { received: true };
}

function ordersFor(userId) {
  return db.prepare(`SELECT o.*, l.title FROM orders o LEFT JOIN listings l ON l.id=o.listing_id
    WHERE o.buyer_id=? OR o.seller_id=? ORDER BY o.created_at DESC`).all(userId, userId)
    .map(o => ({ ...o, ago: ago(o.created_at) }));
}

module.exports = { configured, feePct, connectUrl, status, checkout, handleWebhook, ordersFor };
