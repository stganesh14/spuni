# SPUNI API

FastAPI + PostgreSQL backend for the SPUNI storefront (`../`) and admin app (`../admin`).

- **Stack:** Python 3.12+, FastAPI, async SQLAlchemy 2, Alembic, asyncpg, Pydantic v2.
- **Auth:** passwordless email OTP for customers and admins. The OTP is stored as an HMAC (peppered); it has an expiry, an attempt limit, a resend cooldown and an hourly cap. A short-lived JWT access token is kept in memory by the apps. The refresh token sits in a rotating httpOnly cookie (reuse is detected and revokes the session). Refresh calls require the `X-Requested-With: spuni` header (CSRF).
- **Money:** every amount is an integer number of paise. Database `CHECK` constraints cover prices, quantities, stock, wallet balances and order totals.
- **Orders and payments:**
  - Prices and stock are recalculated on the server; the client is never trusted.
  - Order placement takes an `Idempotency-Key`.
  - Stock is reserved with row locks and released when a pending order expires.
  - Confirmation is idempotent, so the verify callback and the Razorpay webhook can both arrive safely.
  - Razorpay signatures are checked with constant-time HMAC.
- **Wallet:**
  - The ledger is append-only.
  - Points equal to a percentage of the order are credited once it is paid.
  - Redemption is capped at a share of the order total.
  - Gift cards are redeemed into the wallet.
- **Emails:**
  - Emails go through a transactional outbox with retries: the row is written in the same transaction as the event.
  - Events covered: OTP, order placed, payment received, shipped, delivered, cancelled, wallet credited, gift card, launch notification, customisation updates and contact replies.
  - Every email has a one-click unsubscribe where it applies.
- **Hardening:** strict Pydantic schemas (`extra="forbid"`, length and pattern limits), security headers, trusted hosts, CORS allow-list, rate limits, upload type sniffing and re-encoding (images become WebP; PDFs are checked by magic bytes), and request IDs.

## Run locally

```bash
# 1. Postgres (any 14+). Example with Docker:
docker run -d --name spuni-db -e POSTGRES_USER=spuni -e POSTGRES_PASSWORD=spuni -e POSTGRES_DB=spuni -p 5432:5432 postgres:16

# 2. Python env
cd backend
python3 -m venv .venv && source venv/bin/activate #py -3.11 -m venv venv 
# venv\Scripts\activate 
pip install -r requirements-dev.txt
cp .env.example .env            # edit if your DB differs

# 3. Schema + demo data (categories, products, banners, launches, admin user)
#    If the role/database in DATABASE_URL don't exist yet (e.g. a native Postgres install),
#    set DATABASE_ADMIN_URL in .env and `alembic upgrade head` creates them first.
alembic upgrade head
python -m scripts.seed --admin-email admin@spuni.in

# 4. Start
uvicorn app.main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs (development only)
- Health: http://localhost:8000/health

With `EMAIL_BACKEND=console`, emails, including sign-in codes, are printed to the API log instead of being sent:

```bash
uvicorn app.main:app --port 8000 2>&1 | tee /tmp/api.log
grep -A14 'sign-in code' /tmp/api.log | grep -oE '^[0-9]{6}$' | tail -1
```

Then start the two front ends from the repository root:

```bash
npm install && npm start                 # storefront  -> http://localhost:4200 (proxies /api and /media to :8000)
cd admin && npm install && npm start     # admin       -> http://localhost:4300
```

## Tests and lint

```bash
pytest -q          # uses the DATABASE_URL database, in its own schema
ruff check .
```

## Payments: mock now, Razorpay later

`PAYMENT_MODE=mock` is the default. Checkout opens a SPUNI test payment sheet and every payment succeeds. The order still goes through the real path: pending, then paid with a captured payment row, then confirmed, with emails and wallet points.

To go live with Razorpay:

1. Set these in `.env`:
   ```
   PAYMENT_MODE=razorpay
   RAZORPAY_KEY_ID=rzp_live_...
   RAZORPAY_KEY_SECRET=...
   RAZORPAY_WEBHOOK_SECRET=...
   ```
2. In the Razorpay dashboard, add the webhook `https://<your-domain>/api/v1/payments/razorpay/webhook` with the events `payment.captured`, `payment.failed` and `order.paid`, using the same secret.
3. Restart the API. No front-end change is needed: the storefront loads Razorpay Checkout automatically when the API says `gateway: "razorpay"`.

**Never run production with `PAYMENT_MODE=mock`.** Anyone could complete orders without paying.

## Production checklist

- Set `ENVIRONMENT=production`. Startup refuses weak `SECRET_KEY` and `OTP_PEPPER` values, `COOKIE_SECURE=false` and `DEBUG=true`.
- Set `TRUSTED_HOSTS` and `CORS_ORIGINS` to your real domains.
- Set `EMAIL_BACKEND=smtp` with SMTP credentials. For Gmail, use an app password.
- Run `alembic upgrade head` on every deploy.
- Run the API with several workers, for example `uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 4 --proxy-headers`. The in-process rate limiter is per worker, so also add nginx `limit_req` on `/api/v1/auth/` and `/api/v1/admin/auth/`.
- Back up Postgres and the `media/` folder (uploaded product images and customisation files).

### Recommended layout (one domain, first-party cookies)

```
https://spuni.in          -> storefront SSR server (node dist/spuni/server/server.mjs, port 4000)
https://spuni.in/api      -> API (port 8000)
https://spuni.in/media    -> API (or serve backend/media directly from nginx)
https://admin.spuni.in    -> admin static files (admin/dist/admin/browser) + /api,/media -> API
```

Storefront SSR server environment:

```
PORT=4000
API_ORIGIN=http://127.0.0.1:8000        # where SSR fetches data and proxies /api and /media
NG_ALLOWED_HOSTS=spuni.in,www.spuni.in  # Angular SSR host allow-list
```

Example nginx for the storefront:

```nginx
server {
  server_name spuni.in;
  client_max_body_size 45m;               # 5 customisation files x 8 MB
  location /api/   { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host;
                     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                     proxy_set_header X-Forwarded-Proto $scheme; }
  location /media/ { alias /srv/spuni/backend/media/; expires 30d; add_header Cache-Control "public, immutable"; }
  location /       { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host;
                     proxy_set_header X-Forwarded-Proto $scheme; }
}
```

The admin app's README (`../admin/README.md`) has its own nginx block.

## Layout

```
app/
  api/routes/        auth, catalog, shop (cart quote, orders, payments), account, engagement, admin/*
  core/              config, security (JWT, OTP HMAC), errors, rate limit, middleware
  db/                database engine and session
  models/            SQLAlchemy models (with CHECK and unique constraints)
  schemas/           Pydantic request and response models
  services/          business logic: orders, payments, wallet, email outbox, media, launches
  templates/email/   HTML email templates
alembic/             migrations (0001 initial schema with all constraints)
scripts/seed.py      demo catalogue and admin user
tests/               auth and order flow tests
```
