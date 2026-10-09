import { createApp, env } from './app'
import { verifyMail } from './mail'
import { checkMapTiler } from './maps'
import { checkTomTom } from './traffic'
import { razorpayConfigured } from './env'
import { microsoftConfigured, anyMailConfigured, envFile } from './env'

const app = createApp()
app.listen(env.port, () => {
  console.log(`[ridesync] API listening on http://localhost:${env.port}`)
  console.log(envFile.found ? `[ridesync] settings: ${envFile.path}` : `[ridesync] ⚠ No settings file (.env) in ${process.cwd()} — run setup.bat in THIS folder to set up email, payments and maps.`)
  if (envFile.error) console.log(`[ridesync] ⚠ .env has a formatting problem (${envFile.error}) — read it line by line instead. Run setup.bat again to rewrite it.`)
  console.log(`[ridesync] sign-in restricted to @${env.allowedDomain}`)
  if (!microsoftConfigured()) console.log('[ridesync] Microsoft sign-in not set up yet — see README section 2 (email codes still work)')
  if (!anyMailConfigured()) {
    const missing = (['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'] as const).filter((k) => !process.env[k])
    console.log(env.isProd ? '[ridesync] SMTP not set — email-code login disabled' : '[ridesync] SMTP not set — login codes are printed here (dev only)')
    if (envFile.found) console.log(`[ridesync] ⚠ Email is off because .env is missing: ${missing.join(', ')}. Run setup.bat, answer y to the email question and enter the Gmail App Password.`)
  }
  if (anyMailConfigured()) void verifyMail()
  console.log(razorpayConfigured() ? `[ridesync] Razorpay ${env.razorpay.keyId.startsWith('rzp_test_') ? 'TEST' : 'LIVE'} mode enabled` : '[ridesync] Razorpay not set — riders pay by UPI to the driver or cash')
  void checkMapTiler().then((r) => {
    if (r === 'rejected') console.log('[ridesync] ⚠ MapTiler rejected the key in .env (MAPTILER_KEY) — using the free OpenStreetMap map instead. Copy the key again from cloud.maptiler.com → API keys and run setup.bat.')
    if (r === 'ok') console.log('[ridesync] MapTiler key works ✓')
  })
  void checkTomTom().then((r) => {
    if (r === 'ok') console.log('[ridesync] Live traffic (TomTom) works ✓')
    if (r === 'rejected') console.log('[ridesync] ⚠ TomTom rejected TOMTOM_KEY — routes use OSRM without live traffic. Copy the key again from developer.tomtom.com and run setup.bat.')
    if (r === 'none') console.log('[ridesync] Live traffic off — add a free TomTom key with setup.bat (see README "Live traffic")')
  })
  console.log(`[ridesync] pin names: ${[env.google.key && 'Google', env.olaKey && 'Ola Maps', env.tomtomKey && 'TomTom places', env.maptilerKey && 'MapTiler', 'OpenStreetMap'].filter(Boolean).join(' → ')}`)
  const g = !!env.google.key
  console.log(
    `[ridesync] map: ${g && env.google.display ? 'Google' : env.maptilerKey ? 'MapTiler' : 'OpenStreetMap/CARTO'} · search: ${g ? 'Google' : env.maptilerKey ? 'MapTiler' : 'OpenStreetMap'} · routes: ${g ? 'Google' : env.tomtomKey ? 'TomTom (live traffic)' : env.orsKey ? 'OpenRouteService' : 'OSRM'}`,
  )
  if (env.devLogin) console.log('[ridesync] DEV_LOGIN enabled (local development only)')
})
