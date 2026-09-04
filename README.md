# NorthAuto Market

A North America-wide auto parts marketplace: sellers in **Canada and the USA** list parts in their
own currency (CAD or USD), and buyers across the continent browse everything converted to USD with
cross-border shipping/duty info on every listing.

## Features

- **Payments (Stripe Connect)** — buyers pay by card; funds go straight to the seller's connected
  Stripe account with an automatic platform fee (`PLATFORM_FEE_PCT`, default 10%). Sellers onboard
  via Stripe Express with one click; orders recorded via webhook, listing auto-marked as sold.
- **Duty & tax estimator** — per-listing estimate for US or Canadian import: USMCA duty-free logic
  (North-American-made parts), MFN rates by parts category, GST/HST by province. Clearly labeled
  as an estimate.
- **Accounts** — register/login with bcrypt-hashed passwords, cookie sessions (30-day)
- **Listings** — create, edit, delete, mark-sold/relist; photo upload (jpg/png/webp, 5MB max)
- **Currency** — Canadian sellers list in CAD; the API returns a `price_usd` conversion (rate via
  the `FX_CAD_USD` env var, default 0.73). US listings stay in USD.
- **Cross-border awareness** — listings carry country/province/state; buyers see domestic vs.
  cross-border shipping estimates and USMCA/duty notes.
- **Search & filters** — full-text search, category, condition, seller country, 4 sort orders
- **Saved items** — watchlist per user
- **Messaging** — buyers message sellers; threaded inbox with replies (no email exposed publicly)
- **Database** — SQLite (better-sqlite3), WAL mode, seeded with demo sellers/listings on first boot

## Quick start

```bash
npm install
npm start
# → http://localhost:3000
```

**Demo accounts** (all use password `password123`):

| Email | Seller | Location |
|---|---|---|
| armin@northauto.example | Armin Ahmadi | Toronto, ON 🇨🇦 |
| mike@northauto.example | Mike Torres | Detroit, MI 🇺🇸 |
| sarah@northauto.example | Sarah Chen | Vancouver, BC 🇨🇦 |
| olivier@northauto.example | Olivier Tremblay | Montreal, QC 🇶🇦 |

(others: prairie@northauto.example · cascadia@northauto.example)

## Enabling payments (Stripe)

1. Create a Stripe account → get your **secret key** (`sk_test_...` for testing).
2. Set env vars: `STRIPE_SECRET_KEY`, `APP_URL` (e.g. `https://yourdomain.com`), and optionally
   `PLATFORM_FEE_PCT` (default 10).
3. For the webhook, either:
   - Test locally: `stripe listen --forward-to localhost:3000/api/payments/webhook`,
     then copy the signing secret into `STRIPE_WEBHOOK_SECRET`, or
   - In the Stripe dashboard add endpoint `https://yourdomain.com/api/payments/webhook`
     listening for `checkout.session.completed`.
4. Without a key the app runs fully — Buy Now just reports "payments not configured", so you can
   develop and demo everything first.

## Deploying live

**Render / Railway / Fly.io** — push this folder to a Git repo and create a Web Service:

- Build command: `npm install`
- Start command: `node server.js`
- Add a persistent disk mounted at `/data` if your platform supports it, and set
  `DATA_DIR=/data` (see below) so listings survive redeploys.

**Any VPS (Ubuntu)**:

```bash
git clone <your-repo> && cd northauto-market
npm install
PORT=80 node server.js        # or use pm2: `pm2 start server.js`
```

**Environment variables**

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `FX_CAD_USD` | `0.73` | CAD→USD conversion for display |
| `DATA_DIR` | `.` | Where `data.db` and `uploads/` live |
| `STRIPE_SECRET_KEY` | — | Enables card payments + seller payouts |
| `STRIPE_WEBHOOK_SECRET` | — | Verifies Stripe webhook signatures |
| `PLATFORM_FEE_PCT` | `10` | Your cut of each sale |
| `APP_URL` | `http://localhost:3000` | Used for Stripe redirects/webhooks |

### Before real users — important

1. **HTTPS** — terminate TLS (platforms do this automatically; on a VPS use Caddy or nginx + certbot).
   Sessions are `httpOnly` + `sameSite=lax`, but you want `secure: true` cookies in production.
2. **Remove/keep seed data** — delete `data.db` to clear demo accounts/listings on launch.
3. **Password policy & email verification** — extend `POST /api/auth/register` as needed.
4. **Image storage** — uploads live on the local disk; for multi-instance or serverless deploys,
   swap multer's disk storage for S3/Cloudflare R2.
5. **Spam/abuse** — add rate limiting (e.g. `express-rate-limit`) on auth + message endpoints.
6. **Backups** — back up `data.db` (SQLite is a single file) and the `uploads/` folder.

## Project layout

```
server.js        Express API: auth, listings, saves, messages, payments, duty
db.js            SQLite schema + seed data
payments.js      Stripe Connect: onboarding, checkout, webhooks, orders
duty.js          Cross-border duty/tax estimator (USMCA + MFN rates)
public/          Frontend (vanilla HTML/CSS/JS, no build step)
uploads/         Listing photos (created automatically)
```
