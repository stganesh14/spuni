/**
 * Production defaults. `apiBase` is empty so the admin talks to the API on the
 * same origin (e.g. https://admin.spuni.in/api/v1 behind a reverse proxy).
 * Set an absolute URL (e.g. 'https://api.spuni.in') to call a separate host.
 */
export const environment = {
  production: true,
  apiBase: '',
};
