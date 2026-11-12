# SPUNI deployment guide — Hostinger VPS (Ubuntu)

This guide covers the three apps in this repository on one VPS and one domain:

| Component | How it runs | Address inside the VPS |
|---|---|---|
| Customer storefront | Angular SSR, managed by systemd | `127.0.0.1:4000` |
| Admin dashboard | Angular static build, served by nginx at `/admin/` | `/var/www/spuni-admin` |
| Python API | FastAPI/Uvicorn, managed by systemd | `127.0.0.1:8000` |
| PostgreSQL | Database service | `127.0.0.1:5432` |
| Nginx | Public reverse proxy and static-file server | ports `80` and `443` |

The public URLs are:

- `https://spunileathers.com/` — customer storefront
- `https://spunileathers.com/admin/` — admin app
- `https://spunileathers.com/api/...` — API
- `https://spunileathers.com/media/...` — uploaded media

The commands below assume the Linux account is `spuni` and the checked-out project root is:

```text
/home/spuni/spuni
```

This is the project path shown in your latest VPS terminal output (`~/spuni/backend`). If your repository root is different, replace this path consistently in every command and service file. The project root is the directory containing the storefront `package.json`, `admin/`, and `backend/`.

> **Do not paste real passwords, SMTP credentials, database URLs, or signing secrets into chat or commit them to Git.** If any real credential has been committed to a tracked file, rotate it before production. Keep the VPS `backend/.env` private and backed up securely.
>
> The current working copy's `backend/.env.example` contains credential-like values. Do not copy those values into production. Replace any real values with placeholders before publishing the repository, and rotate any credentials that were real.

## 1. Point the domain and open the VPS firewall

In GoDaddy DNS, configure:

- `A` record, host `@`, value `YOUR_VPS_IPV4`
- `A` record, host `www`, value `YOUR_VPS_IPV4` (or a `CNAME` from `www` to `@`)

Remove conflicting old `A` records. Remove an `AAAA` record unless IPv6 is configured on the VPS and nginx. DNS should resolve to the VPS IPv4:

```bash
dig +short spunileathers.com
dig +short www.spunileathers.com
```

In Hostinger firewall, allow inbound TCP ports `22`, `80`, and `443`. On Ubuntu, configure UFW only after allowing SSH so you do not lock yourself out:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 2. Install system packages

Install the Python version supplied by your Ubuntu release. This project requires Python 3.12 or newer; Ubuntu 26.04 ("Resolute") supplies a newer Python, so use the generic `python3` and `python3-venv` package names rather than pinning Python 3.12. Angular 21 needs a supported modern Node release; use Node 22.

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl ca-certificates build-essential nginx postgresql postgresql-contrib \
  python3 python3-venv python3-pip rsync
```

Install Node.js 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
python3 --version
```

Create the deployment account if it does not already exist:

```bash
sudo adduser spuni
sudo usermod -aG sudo spuni
```

Log in as `spuni` for application commands. Use `sudo` only where shown.

## 3. Get the project onto the VPS

As `spuni`, clone the repository. Replace the URL with the repository's actual Git URL:

```bash
mkdir -p /home/spuni/app
mkdir -p /home/spuni
git clone YOUR_REPOSITORY_URL /home/spuni/spuni
```

If the code is already on the VPS, do not clone it again. Instead, confirm the project root and update it using your normal deployment method:

```bash
cd /home/spuni/spuni
test -f package.json && test -f admin/package.json && test -f backend/requirements.txt \
  && echo "Project root confirmed" || echo "Wrong directory: locate the directory containing all three files"
```

Do not run `npm` from a parent directory that does not contain the storefront `package.json`.

## 4. Set up PostgreSQL

Enable PostgreSQL and create an application role/database. Choose a long random database password; using hex avoids URL-escaping problems in `DATABASE_URL`.

```bash
sudo systemctl enable --now postgresql
openssl rand -hex 24
sudo -u postgres psql
```

At the `psql` prompt, replace `REPLACE_WITH_DATABASE_PASSWORD` with the generated value:

```sql
CREATE ROLE spuni LOGIN PASSWORD 'REPLACE_WITH_DATABASE_PASSWORD';
CREATE DATABASE spuni OWNER spuni;
\q
```

Verify the service is local:

```bash
sudo ss -lntp | grep 5432
```

PostgreSQL should not be exposed publicly; it only needs to listen on localhost.

## 5. Configure the backend environment

As `spuni`:

```bash
cd /home/spuni/spuni/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
nano .env
chmod 600 .env
```

In `.env`, set the production values. Keep one `KEY=value` per line and do not put inline comments after values. Generate fresh secrets on the VPS:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Use the first output for `SECRET_KEY` and the second for `OTP_PEPPER`. Configure at least:

```dotenv
ENVIRONMENT=production
DEBUG=false
STOREFRONT_URL=https://spunileathers.com
ADMIN_URL=https://spunileathers.com/admin
PUBLIC_API_URL=https://spunileathers.com
CORS_ORIGINS=https://spunileathers.com,https://www.spunileathers.com
TRUSTED_HOSTS=localhost,127.0.0.1,spunileathers.com,www.spunileathers.com

DATABASE_URL=postgresql+asyncpg://spuni:REPLACE_WITH_DATABASE_PASSWORD@127.0.0.1:5432/spuni
SECRET_KEY=REPLACE_WITH_FIRST_GENERATED_SECRET
OTP_PEPPER=REPLACE_WITH_SECOND_GENERATED_SECRET
COOKIE_SECURE=true
COOKIE_SAMESITE=lax

EMAIL_BACKEND=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=YOUR_SMTP_ACCOUNT
SMTP_PASSWORD=YOUR_SMTP_APP_PASSWORD
SMTP_START_TLS=true
EMAIL_FROM=SPUNI <YOUR_VERIFIED_SENDER>
EMAIL_REPLY_TO=YOUR_REPLY_ADDRESS

PAYMENT_MODE=razorpay
RAZORPAY_KEY_ID=YOUR_LIVE_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_LIVE_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET

INITIAL_ADMIN_EMAIL=YOUR_ADMIN_EMAIL
```

Important:

- Production startup requires strong secrets, `COOKIE_SECURE=true`, and `DEBUG=false`.
- The backend defaults to mock payments. **Do not run a public production store with `PAYMENT_MODE=mock`; mock payments allow orders to appear paid without collecting money.** Set up Razorpay live credentials and its webhook before accepting real orders.
- Set SMTP values to a working transactional email account; OTP sign-in depends on email delivery.
- Keep `.env` readable only by the app owner (`chmod 600 .env`).
- Do not add a `DATABASE_ADMIN_URL` unless needed for initial database creation. The commands above create the database/role without app-level superuser access.

Run migrations and seed the initial admin/catalogue:

```bash
cd /home/spuni/spuni/backend
source .venv/bin/activate
alembic upgrade head
python -m scripts.seed --admin-email YOUR_ADMIN_EMAIL
deactivate
```

The app also checks/migrates/seeds an empty database during startup. The explicit commands above make setup errors visible before starting the service.

### If migrations report a PostgreSQL password or driver error

The connection URL for this backend must use the `asyncpg` driver:

```dotenv
DATABASE_URL=postgresql+asyncpg://spuni:YOUR_DATABASE_PASSWORD@127.0.0.1:5432/spuni
```

Do not use `postgresql+psycopg://` here. This project installs `asyncpg`; a `No module named 'psycopg'` error usually means the URL was changed to the wrong driver. Keep the password in the URL identical to the password for the PostgreSQL role `spuni`. Using a hexadecimal password avoids URL-escaping special characters.

To reset the role password, generate a new value:

```bash
openssl rand -hex 24
```

Copy that value privately. Set the PostgreSQL role password interactively (so it is not placed in shell history):

```bash
sudo -u postgres psql
```

At the `psql` prompt:

```sql
\password spuni
\q
```

Enter the generated value twice when prompted. Then edit the backend `.env` and set `DATABASE_URL` to use that exact same password and the `postgresql+asyncpg://` prefix. Do not send the password in chat.

Verify the role/database connection before retrying migrations:

```bash
psql "postgresql://spuni@127.0.0.1:5432/spuni" -W -c "SELECT current_user, current_database();"
```

Enter the new password when prompted. If this succeeds, run:

```bash
cd /home/spuni/spuni/backend
source .venv/bin/activate
alembic upgrade head
```

## 6. Build the customer and admin apps

Build the customer storefront from the project root:

```bash
cd /home/spuni/spuni
npx -y npm@11.19.1 ci
npx ng build --configuration production --base-href=/
test -f dist/spuni/server/server.mjs && echo "Storefront SSR build exists"
grep -o '<base href="[^"]*"' dist/spuni/browser/index.csr.html
```

The storefront must show `<base href="/">`. Do not pass `/admin/` as the base href when building the customer app.

Build the admin app with `/admin/` as its base path:

```bash
cd /home/spuni/spuni/admin
npx -y npm@11.19.1 ci
npx ng build --configuration production --base-href /admin/ --deploy-url /admin/
test -f dist/admin/browser/index.html && echo "Admin build exists"
```

Install the static admin files for nginx:

```bash
sudo mkdir -p /var/www/spuni-admin
sudo rsync -a /home/spuni/spuni/admin/dist/admin/browser/ /var/www/spuni-admin/
sudo chown -R www-data:www-data /var/www/spuni-admin
```

The admin app is static; it does not need its own systemd service.

If npm reports `Cannot read properties of null (reading 'edgesOut')`, first confirm you are in the directory containing the correct `package.json` and `package-lock.json`, then use the pinned npm version as shown above. Do not delete the lockfile or run `npm audit fix` to work around this error.

### If storefront JavaScript requests return HTML

The customer app is at `/` and its `<base href>` must be `/`. Only the admin app uses `/admin/`. If browser console errors say module scripts received `text/html`, check the live storefront document's base path and a failed JS request:

```bash
curl -s https://www.spunileathers.com/ | grep -o '<base href="[^"]*"'
```

If that prints `<base href="/admin/">`, the VPS is serving a customer build with the wrong base path (or an old/wrong build). Build the customer app from `/home/spuni/spuni` with `--base-href /`, verify the generated `index.csr.html` reports `/`, then restart the storefront:

```bash
cd /home/spuni/spuni
npx ng build --configuration production --base-href=/
grep -o '<base href="[^"]*"' dist/spuni/browser/index.csr.html
sudo systemctl restart spuni-storefront
```

After restarting, the production page should no longer have its customer scripts under `/admin/`. The `security.allowedHosts` list in the root `angular.json` must include both production hostnames before rebuilding, or the Angular SSR engine can reject requests proxied by nginx.

## 7. Create persistent systemd services

### Backend service

```bash
sudo nano /etc/systemd/system/spuni-backend.service
```

Paste:

```ini
[Unit]
Description=SPUNI FastAPI backend
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=spuni
WorkingDirectory=/home/spuni/spuni/backend
Environment=PYTHONUNBUFFERED=1
ExecStart=/home/spuni/spuni/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Customer SSR service

```bash
sudo nano /etc/systemd/system/spuni-storefront.service
```

Paste:

```ini
[Unit]
Description=SPUNI customer storefront (Angular SSR)
After=network.target spuni-backend.service

[Service]
Type=simple
User=spuni
WorkingDirectory=/home/spuni/spuni
Environment=NODE_ENV=production
Environment=PORT=4000
Environment=API_ORIGIN=http://127.0.0.1:8000
Environment=NG_ALLOWED_HOSTS=spunileathers.com,www.spunileathers.com,localhost,127.0.0.1
Environment=ALLOWED_HOSTS=spunileathers.com,www.spunileathers.com,localhost,127.0.0.1
Environment=TRUST_PROXY=loopback
ExecStart=/usr/bin/node /home/spuni/spuni/dist/spuni/server/server.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`NG_ALLOWED_HOSTS` is the Angular SSR host allow-list used by this project. `ALLOWED_HOSTS` is also used by the Express middleware in `src/server.ts`. Do **not** set `TRUST_PROXY=true`; this app expects a valid proxy trust value such as `loopback`.

Enable and start the services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now spuni-backend spuni-storefront
sudo systemctl status spuni-backend spuni-storefront --no-pager
```

Check their logs if either service fails:

```bash
sudo journalctl -u spuni-backend -n 100 --no-pager
sudo journalctl -u spuni-storefront -n 100 --no-pager
```

## 8. Configure nginx for the three apps

Create one site file:

```bash
sudo nano /etc/nginx/sites-available/spuni
```

Paste the complete server block:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name spunileathers.com www.spunileathers.com;
    client_max_body_size 45m;

    location = /admin {
        return 301 /admin/;
    }

    location ^~ /admin/ {
        alias /var/www/spuni-admin/;
        index index.html;
        try_files $uri $uri/ /admin/index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }

    location /media/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

**Keep `proxy_pass` without a trailing slash** on `/api/` and `/media/`. This preserves the URI prefix, so `/api/v1/...` reaches FastAPI as `/api/v1/...`, not `/v1/...`.

Enable and check the site:

```bash
sudo ln -sfn /etc/nginx/sites-available/spuni /etc/nginx/sites-enabled/spuni
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

Do not start a second nginx manually. If nginx reports that port 80 is already in use, inspect the owner first:

```bash
sudo ss -lntp | grep -E ':80|:443'
sudo systemctl status nginx --no-pager
```

Do not kill processes blindly. There should be one nginx service owning ports 80/443.

## 9. Verify HTTP before enabling HTTPS

Run on the VPS:

```bash
sudo ss -lntp | grep -E ':80|:4000|:8000|:5432'
curl -i http://127.0.0.1:8000/health
curl -i -H 'Host: spunileathers.com' http://127.0.0.1:4000/
curl -i -H 'Host: spunileathers.com' http://127.0.0.1/
curl -i -H 'Host: spunileathers.com' http://127.0.0.1/admin/
curl -i http://spunileathers.com/
```

Expected:

- API `/health`: `200` with `{"status":"ok"}`
- Storefront: a successful page response (normally `200`)
- Admin: a successful response with the Angular app HTML (normally `200`)
- Domain HTTP: reaches nginx and serves the storefront

The API root `/` is not a health endpoint and can correctly return `404`. Test `/health` instead. If the storefront returns `400`, inspect its log for the rejected Host and confirm both `NG_ALLOWED_HOSTS` and `ALLOWED_HOSTS` are set in the active service. If nginx returns `502`, check that the corresponding service is listening and healthy.

Useful diagnostics:

```bash
sudo nginx -T
sudo journalctl -u nginx -n 100 --no-pager
sudo journalctl -u spuni-storefront -n 100 --no-pager
sudo journalctl -u spuni-backend -n 100 --no-pager
```

## 10. Add HTTPS with Let's Encrypt

Only do this after GoDaddy DNS points to this VPS and HTTP works:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d spunileathers.com -d www.spunileathers.com
sudo certbot renew --dry-run
```

Certbot updates the nginx site for HTTPS. Then verify:

```bash
curl -I https://spunileathers.com/
curl -I https://spunileathers.com/admin/
sudo nginx -t
sudo systemctl reload nginx
```

## 11. Updating the site later

Update the code in the existing project root; do not reinstall Ubuntu or recreate the database:

```bash
cd /home/spuni/spuni
git pull
npx -y npm@11.19.1 ci
npx ng build --configuration production --base-href=/

cd admin
npx -y npm@11.19.1 ci
npx ng build --configuration production --base-href /admin/ --deploy-url /admin/
sudo rsync -a dist/admin/browser/ /var/www/spuni-admin/

cd ../backend
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
deactivate

sudo systemctl restart spuni-backend spuni-storefront
sudo nginx -t
sudo systemctl reload nginx
```

Check status and logs after each deploy:

```bash
sudo systemctl --no-pager --full status spuni-backend spuni-storefront nginx
sudo journalctl -u spuni-backend -n 50 --no-pager
sudo journalctl -u spuni-storefront -n 50 --no-pager
```

## 12. Backups and production checklist

Back up both the PostgreSQL database and uploaded files (`backend/media`). Keep backups off the VPS and test restoring them.

Example database backup:

```bash
sudo -u postgres pg_dump spuni | gzip > /home/spuni/spuni-db-$(date +%F).sql.gz
```

Before calling the deployment production-ready, confirm:

- [ ] GoDaddy `@` and `www` records resolve to the VPS public IP.
- [ ] Hostinger firewall and UFW permit SSH, HTTP, and HTTPS.
- [ ] PostgreSQL is not publicly exposed.
- [ ] `.env` has production secrets, `COOKIE_SECURE=true`, and `DEBUG=false`.
- [ ] Email OTP delivery works with the configured SMTP account.
- [ ] Razorpay live checkout and webhook are configured; mock payment mode is disabled.
- [ ] Customer SSR and backend services are enabled and survive a VPS reboot.
- [ ] Admin build uses `/admin/` base href and is served by nginx.
- [ ] Nginx preserves `/api/` and `/media/` paths (no trailing slash after the upstream in `proxy_pass`).
- [ ] HTTPS works and `certbot renew --dry-run` succeeds.
- [ ] PostgreSQL and `backend/media` are backed up.
