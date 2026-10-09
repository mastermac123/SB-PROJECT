import { createApp, env } from './app'
import { smtpConfigured } from './env'

const app = createApp()
app.listen(env.port, () => {
  console.log(`[ridesync] API listening on http://localhost:${env.port}`)
  console.log(`[ridesync] sign-in restricted to @${env.allowedDomain}`)
  if (!env.googleClientId) console.log('[ridesync] GOOGLE_CLIENT_ID not set — Google sign-in disabled')
  if (!smtpConfigured()) console.log(env.isProd ? '[ridesync] SMTP not set — email-code login disabled' : '[ridesync] SMTP not set — login codes are printed here (dev only)')
  if (env.devLogin) console.log('[ridesync] DEV_LOGIN enabled (local development only)')
})
