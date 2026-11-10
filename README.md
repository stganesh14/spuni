# SPUNI

Vintage-style vegan leather store: three apps in one folder.

| Folder | What | Stack | Dev URL |
| --- | --- | --- | --- |
| `./` | Customer storefront | Angular 21, SSR, signals, zoneless, GSAP, Lenis, AOS | http://localhost:4200 |
| `admin/` | Admin app | Angular 21, signals, zoneless | http://localhost:4300 |
| `backend/` | API | Python, FastAPI, PostgreSQL, SQLAlchemy, Alembic | http://localhost:8000 |

## Quick start

```bash
# 1. API and database. See backend/README.md for details.
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
alembic upgrade head
python -m scripts.seed --admin-email admin@spuni.in
uvicorn app.main:app --reload --port 8000 2>&1 | tee /tmp/api.log

# 2. Storefront (new terminal, repository root)
npm install
npm start                       # ng serve; proxies /api and /media to :8000 (proxy.conf.json)

# 3. Admin (new terminal)
cd admin && npm install && npm start
```

In development, emails are printed to the API log. Print the latest sign-in code with `grep -A14 'sign-in code' /tmp/api.log | grep -oE '^[0-9]{6}$' | tail -1`.

## Storefront

- **Sign-in:** email plus a 6-digit code, with resend and "didn't get a code".
  - Browsing, the bag and the wishlist work without an account.
  - Checkout, orders, the wallet and customisation requests ask the shopper to sign in, then return them to where they were.
- **Data:** every product, category, banner and launch comes from the API. The images are served from `/media`.
- **Pages:**
  - Shopping: home, shop (filters, sort, search), category, product (gallery zoom, related), bag, checkout, order confirmation.
  - Account: overview, orders, wallet, addresses, gift cards, customisations, profile.
  - Content: What's New (Notify me), Gift a loved one (e-gift cards and gift wrap), Customise (three ways, with uploads), wishlist, contact, about, FAQ, shipping, returns, privacy, terms, unsubscribe and 404.
- **SPUNI Wallet:** the header shows the balance. Points are earned on paid orders and can be spent on the next one.
- **Payments:** a mock Razorpay sheet where every payment succeeds (`PAYMENT_MODE=mock`). Switching to real Razorpay is backend-only; see `backend/README.md`.

### Build and run in production

```bash
npm run build
PORT=4000 API_ORIGIN=http://127.0.0.1:8000 NG_ALLOWED_HOSTS=spuni.in node dist/spuni/server/server.mjs
```

The SSR server proxies `/api` and `/media` to `API_ORIGIN`, so a single nginx `proxy_pass` to port 4000 is enough. `backend/README.md` has a fuller nginx example.

## Admin

The admin app covers:

- Dashboard
- Orders: status, shipping with courier and tracking, cancellations and refunds to the wallet
- Products, categories and hero banners, with image upload
- What's New launches, with **Notify subscribers**, which emails everyone who tapped Notify me
- Customers, wallet adjustments, gift cards, customisation requests, contact messages, the email log and store settings

See `admin/README.md`.
/home/spuni/app/backend

docker run -d --name spuni-app \
  --restart unless-stopped \
  -p 80:80 \
  --env-file /backend/.env \
  -v /backend/media:/app/backend/media \
  spuni:latest

  189.72.145.224