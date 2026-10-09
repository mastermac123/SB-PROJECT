import { createApp, env } from './app'
import { verifyMail } from './mail'
import { checkMapTiler } from './maps'
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
  void checkMapTiler().then((r) => {
    if (r === 'rejected') console.log('[ridesync] ⚠ MapTiler rejected the key in .env (MAPTILER_KEY) — using the free OpenStreetMap map instead. Copy the key again from cloud.maptiler.com → API keys and run setup.bat.')
    if (r === 'ok') console.log('[ridesync] MapTiler key works ✓')
  })
  const g = !!env.google.key
  console.log(
    `[ridesync] map: ${g && env.google.display ? 'Google' : env.maptilerKey ? 'MapTiler' : 'OpenStreetMap/CARTO'} · search: ${g ? 'Google' : env.maptilerKey ? 'MapTiler' : 'OpenStreetMap'} · routes: ${g ? 'Google' : env.orsKey ? 'OpenRouteService' : 'OSRM'}`,
  )
  if (env.devLogin) console.log('[ridesync] DEV_LOGIN enabled (local development only)')
})
