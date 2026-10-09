import { createApp, env } from './app'
import { verifyMail } from './mail'
import { razorpayConfigured } from './env'
import { microsoftConfigured, anyMailConfigured } from './env'

const app = createApp()
app.listen(env.port, () => {
  console.log(`[ridesync] API listening on http://localhost:${env.port}`)
  console.log(`[ridesync] sign-in restricted to @${env.allowedDomain}`)
  if (!microsoftConfigured()) console.log('[ridesync] Microsoft sign-in not set up yet — see README section 2 (email codes still work)')
  if (!anyMailConfigured()) console.log(env.isProd ? '[ridesync] SMTP not set — email-code login disabled' : '[ridesync] SMTP not set — login codes are printed here (dev only)')
  if (anyMailConfigured()) void verifyMail()
  console.log(razorpayConfigured() ? `[ridesync] Razorpay ${env.razorpay.keyId.startsWith('rzp_test_') ? 'TEST' : 'LIVE'} mode enabled` : '[ridesync] Razorpay not set — riders pay by UPI to the driver or cash')
  console.log(`[ridesync] maps: ${env.maptilerKey ? 'MapTiler' : 'OpenStreetMap/CARTO'} · routes: ${env.orsKey ? 'OpenRouteService' : 'OSRM'}`)
  if (env.devLogin) console.log('[ridesync] DEV_LOGIN enabled (local development only)')
})
