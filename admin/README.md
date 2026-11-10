# SPUNI Admin

The admin web app for the SPUNI store. Angular 21 (standalone components, signals, zoneless, lazy-loaded routes, no SSR). It talks to the FastAPI backend in `../backend` under `/api/v1/admin/...`.

## Requirements

- Node 22 and npm. Install with npm 11 (`npx -y npm@11 install`) if npm 10 fails with `Cannot read properties of null (reading 'edgesOut')`.
- The SPUNI API running on `http://localhost:8000`. See `../backend`.

## Run in development

```bash
cd admin
npm install          # first time only
npm start            # same as: npx ng serve  ->  http://localhost:4300
```

The dev server listens on port **4300**, which is set in `angular.json` under `serve.options.port`. It proxies `/api` and `/media` to `http://localhost:8000` (see `proxy.conf.json`). From the browser's point of view the API is on the same origin, so the httpOnly refresh cookie (path `/api/v1/admin/auth`) works with no CORS setup.

### Signing in (dev)

1. Open http://localhost:4300 and enter `admin@spuni.in`, the seeded admin.
2. The backend uses the console email backend, so the 6-digit code is printed to the API log:
   ```bash
   grep -A14 'admin sign-in code' /tmp/api.log | grep -oE '^[0-9]{6}$' | tail -1
   ```
3. Type or paste the code. The inputs move to the next box as you type and accept a pasted full code.

The API rate-limits codes: one every 60 s per email (the resend button shows a countdown) and 6 per hour.

## Configuration

`src/environments/environment.ts` (production) and `environment.development.ts` (dev):

```ts
export const environment = { production: true, apiBase: '' };
```

- `apiBase: ''` (the default) means the API is on the same origin as the admin app. Calls go to `/api/v1/...` and images to `/media/...`.
- To call an API on another host, set an absolute origin such as `apiBase: 'https://api.spuni.in'`. Relative `/media/...` image URLs resolve against the same origin. In that case the API must:
  - allow the admin origin in `CORS_ORIGINS`;
  - send the refresh cookie with `SameSite=None; Secure` (`COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`).

  The same-domain setup below avoids all of this and is recommended.

The value is provided through the `API_BASE` injection token (`src/app/core/api-base.ts`). You can override it in `app.config.ts` if needed.

## Build

```bash
npx ng build                 # production build -> dist/admin/browser
npx ng test --watch=false    # unit tests (Vitest)
```

## Deploy behind the same domain as the API

The build is a static single-page app. Serve `dist/admin/browser` and reverse-proxy `/api` and `/media` to the API from the **same host**, so cookies stay first-party. Example nginx config for `admin.spuni.in`:

```nginx
server {
  listen 443 ssl http2;
  server_name admin.spuni.in;
  root /srv/spuni-admin/browser;          # contents of dist/admin/browser

  # API + uploaded images
  location /api/   { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host;
                     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                     proxy_set_header X-Forwarded-Proto $scheme; client_max_body_size 12m; }
  location /media/ { proxy_pass http://127.0.0.1:8000; }

  # hashed assets can be cached forever; index.html must not be
  location ~* \.(js|css|woff2?|png|svg|ico)$ { expires 1y; add_header Cache-Control "public, immutable"; }
  location / { try_files $uri $uri/ /index.html; add_header Cache-Control "no-store"; }

  add_header X-Frame-Options DENY;
  add_header X-Content-Type-Options nosniff;
  add_header Referrer-Policy same-origin;
}
```

On the API side, set `ADMIN_URL=https://admin.spuni.in`, `COOKIE_SECURE=true`, and add the admin origin to `CORS_ORIGINS` and `TRUSTED_HOSTS`. You can also serve the admin under a path of the storefront domain (for example `https://spuni.in/admin/`). In that case, build with `npx ng build --base-href /admin/` and add a matching `try_files` fallback to `/admin/index.html`.

## How it works

- **Auth.** Sign-in is a passwordless email code: `otp/request` → `otp/verify`. The access token is kept **in memory only** (a signal in `AuthService`) and never in localStorage. On app start the route guard calls `POST /admin/auth/refresh`, with `X-Requested-With: spuni` and credentials, to restore the session from the httpOnly cookie. `authInterceptor` adds the bearer token. When a request gets a 401, the interceptor refreshes the token **once**, sharing a single in-flight refresh across concurrent requests, and retries the request. If the refresh fails, it redirects to `/login?returnUrl=…`.
- **Errors.** Every API error has the shape `{error: {code, message, details}}`. `toApiError()` shows `message`. For 422 responses, `applyServerErrors()` maps `details[].field` onto the matching form controls.
- **Money.** The API uses integer paise everywhere. Admins type rupees (`1499.50`), and `rupeesToPaise()` converts them before sending. Amounts are displayed with Indian digit grouping (`₹1,49,999.50`) by the `money` pipe.
- **Validation.** Form validators mirror the backend constraints: slug, SKU, phone, email, link and https URL patterns, plus length and number ranges (`core/validators.ts`).

## Structure

```
src/app/
  core/        api-base (API_BASE token), api.service (typed client), auth.service, auth.interceptor,
               auth.guard, errors, format (money/dates/slug), validators, ui.service (toasts, confirm), models
  shared/      ui (status badge, field, loading/empty/error state, pager, page header), modal + confirm host,
               toast host, image-upload (single + product gallery manager), bar-chart (SVG), pipes
  layout/      shell (sidebar, top bar, mobile drawer)
  pages/       login, dashboard, products (list + form), categories, launches, banners, orders (list + detail),
               customers (list + detail), customizations (list + detail), gift-cards, messages, emails,
               settings, not-found
```
