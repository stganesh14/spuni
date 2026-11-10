# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS frontend-build
WORKDIR /workspace

COPY package.json ./
COPY admin/package.json ./admin/package.json
RUN npm install --include=dev && cd admin && npm install --include=dev

COPY . .

RUN npm run build -- --configuration production && \
    cd admin && npm run build -- --configuration production --base-href /admin/ --deploy-url /admin/

FROM python:3.12-slim AS backend-build
WORKDIR /app/backend

RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN python -m venv /opt/venv && \
    . /opt/venv/bin/activate && \
    pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY backend/ .
RUN . /opt/venv/bin/activate && python -m compileall app

FROM python:3.12-slim AS final
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=4000 \
    API_ORIGIN=http://127.0.0.1:8000 \
    NG_ALLOWED_HOSTS=spunileathers.com,www.spunileathers.com \
    ENVIRONMENT=production \
    STOREFRONT_URL=https://spunileathers.com \
    ADMIN_URL=https://spunileathers.com/admin \
    PUBLIC_API_URL=https://spunileathers.com \
    CORS_ORIGINS=https://spunileathers.com,https://www.spunileathers.com \
    TRUSTED_HOSTS=spunileathers.com,www.spunileathers.com,localhost \
    COOKIE_SECURE=true \
    DEBUG=false

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=backend-build /opt/venv /opt/venv
COPY --from=backend-build /app/backend /app/backend
COPY --from=frontend-build /workspace/dist/spuni /var/www/storefront
COPY --from=frontend-build /workspace/admin/dist/admin/browser /var/www/admin/browser

RUN mkdir -p /app/backend/media /run/nginx /var/log/nginx /var/cache/nginx && \
    rm -f /etc/nginx/sites-enabled/default

COPY <<'EOF' /etc/nginx/conf.d/spuni.conf
server {
    listen 80;
    listen [::]:80;
    server_name _;
    client_max_body_size 45m;

    location /admin/ {
        alias /var/www/admin/browser/;
        index index.html;
        try_files $uri $uri/ /admin/index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /media/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

RUN printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -e' \
  'cd /app/backend' \
  'if [ -z "${DATABASE_URL}" ]; then' \
  '  echo "DATABASE_URL is required"' \
  '  exit 1' \
  'fi' \
  'if [ -z "${SECRET_KEY}" ]; then' \
  '  export SECRET_KEY="$(python -c "import secrets; print(secrets.token_urlsafe(64))")"' \
  'fi' \
  'if [ -z "${OTP_PEPPER}" ]; then' \
  '  export OTP_PEPPER="$(python -c "import secrets; print(secrets.token_urlsafe(32))")"' \
  'fi' \
  'python -m alembic upgrade head || true' \
  'python -m scripts.seed --admin-email "${INITIAL_ADMIN_EMAIL:-admin@spuni.in}" || true' \
  'nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/backend.log 2>&1 &' \
  'nohup node /var/www/storefront/server/server.mjs > /tmp/storefront.log 2>&1 &' \
  'exec nginx -g "daemon off;"' > /start.sh && \
  chmod +x /start.sh

EXPOSE 80
CMD ["/start.sh"]
