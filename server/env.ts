/** Server configuration — all from environment variables. See .env.example. */
import { existsSync } from 'node:fs'

// Load .env when present (values already set in the environment win).
if (existsSync('.env')) process.loadEnvFile('.env')
process.env.TZ = process.env.TZ || 'Asia/Kolkata'

const bool = (v: string | undefined) => v === '1' || v === 'true'

export const env = {
  port: Number(process.env.PORT || 8787),
  isProd: process.env.NODE_ENV === 'production',
  /** Only emails at this domain may sign in. */
  allowedDomain: (process.env.ALLOWED_EMAIL_DOMAIN || 'vit.edu.in').toLowerCase(),
  databasePath: process.env.DATABASE_PATH || './data/ridesync.db',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  /** "Sign in with Microsoft" — for colleges on Microsoft 365 / Outlook. */
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    /** Optional: pin the college's Microsoft tenant ID. Looked up from the domain when empty. */
    tenantId: process.env.MICROSOFT_TENANT_ID || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || '',
  },
  osrmUrl: process.env.OSRM_URL || 'https://router.project-osrm.org',
  /** Local development only: sign in without Google/email. Refused in production. */
  devLogin: bool(process.env.DEV_LOGIN) && process.env.NODE_ENV !== 'production',
  /** Public address of the site, e.g. https://ridesync.onrender.com (used for sign-in redirects). */
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
}

export const smtpConfigured = () => !!(env.smtp.host && env.smtp.user && env.smtp.pass && env.smtp.from)

export const microsoftConfigured = () => !!(env.microsoft.clientId && env.microsoft.clientSecret)
