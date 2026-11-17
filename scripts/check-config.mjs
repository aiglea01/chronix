import { configFromEnv } from '../server/index.js';

try {
  const config = configFromEnv();
  if (process.argv.includes('--deployment')) {
    if (process.env.NODE_ENV !== 'production' || !config.enabled || !config.secure || !config.ownerEmail ||
        config.host !== '127.0.0.1' || config.dbPath !== '/var/lib/chronix/chronix.sqlite') {
      throw new Error('Despliegue personal: usa NODE_ENV=production, HTTPS, OAuth, CHRONIX_OWNER_EMAIL, HOST=127.0.0.1 y DB_PATH=/var/lib/chronix/chronix.sqlite.');
    }
  }
  console.log(JSON.stringify({ origin: config.origin, port: config.port, google: config.enabled,
    calendar: config.enabled && config.calendarEnabled, personal: Boolean(config.ownerEmail),
    access: config.allowedEmails.length ? 'invite-only' : config.ownerEmail ? 'owner-only' : 'open',
    callback: config.origin + '/auth/google/callback' }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
