import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');
const apiOrigin = new URL(process.env['API_ORIGIN'] || 'http://127.0.0.1:8000');
const allowedHosts = new Set(
  (process.env['ALLOWED_HOSTS'] ?? 'localhost,127.0.0.1,spunileathers.com,www.spunileathers.com')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
const trustProxy = process.env['TRUST_PROXY'] ?? 'loopback';
const normalizedTrustProxy = trustProxy === 'true' || trustProxy === '1' ? 'loopback' : trustProxy;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', normalizedTrustProxy);
const angularApp = new AngularNodeAppEngine();

/**
 * Forward /api and /media to the FastAPI backend. In production a reverse
 * proxy (nginx) normally does this; the fallback keeps a single Node process
 * working out of the box. Bodies and Set-Cookie headers stream through as-is.
 */
function proxyToApi(req: express.Request, res: express.Response): void {
  const send = apiOrigin.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers: Record<string, string | string[] | undefined> = { ...req.headers, host: apiOrigin.host };
  const forwardedFor = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ');
  headers['x-forwarded-for'] = forwardedFor;
  headers['x-forwarded-proto'] = req.protocol;
  const upstream = send(
    {
      protocol: apiOrigin.protocol,
      hostname: apiOrigin.hostname,
      port: apiOrigin.port,
      method: req.method,
      path: req.originalUrl,
      headers,
      timeout: 30_000,
    },
    (response) => {
      res.status(response.statusCode ?? 502);
      for (const [key, value] of Object.entries(response.headers)) {
        if (value !== undefined) res.setHeader(key, value);
      }
      response.pipe(res);
    },
  );
  upstream.on('timeout', () => upstream.destroy(new Error('Upstream timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) {
      res.status(502).json({ error: { code: 'bad_gateway', message: 'The store is briefly unavailable. Please try again.' } });
    } else res.end();
  });
  req.pipe(upstream);
}

app.use(['/api', '/media'], proxyToApi);

app.use((req, res, next) => {
  const host = req.headers.host?.split(':')[0]?.toLowerCase();
  if (host && !allowedHosts.has(host)) {
    res.status(400);
    res.send('Bad Request');
    return;
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")');
  next();
});

/** Serve static files from /browser */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
    setHeaders: (res, path) => {
      // Hashed bundles are immutable; plain assets get a shorter cache.
      if (!/\.[0-9a-z]{8,}\.(js|css|woff2?)$/i.test(path)) res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  }),
);

/** Render everything else with Angular. */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) throw error;
    console.log(`SPUNI storefront listening on http://localhost:${port}`);
  });
}

/** Request handler used by the Angular CLI (dev server and build). */
export const reqHandler = createNodeRequestHandler(app);
