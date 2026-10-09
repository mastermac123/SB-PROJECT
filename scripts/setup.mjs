// RideSync setup helper — saves your keys into .env and tests email delivery.
// Run:  npm run setup      (Windows: double-click setup.bat)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { stdin, stdout } from 'node:process'
import nodemailer from 'nodemailer'

// Line queue so typed-ahead or pasted answers are never lost.
const rl = createInterface({ input: stdin })
const lines = []
const waiters = []
rl.on('line', (l) => (waiters.length ? waiters.shift()(l) : lines.push(l)))
rl.on('close', () => waiters.splice(0).forEach((w) => w('')))
const question = (q) => {
  stdout.write(q)
  return new Promise((resolve) => (lines.length ? resolve(lines.shift()) : waiters.push(resolve)))
}
const ENV = '.env'
const env = new Map()
if (existsSync(ENV))
  for (const line of readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env.set(m[1], m[2].replace(/^"(.*)"$/, '$1'))
  }

const ask = async (q, def = '') => (await question(def ? `${q} [${def}]: ` : `${q}: `)).trim() || def
/** Like ask(), but shows **** instead of the characters (for passwords and secrets). */
const askSecret = async (q, def = '') => {
  if (!stdin.isTTY || lines.length || typeof stdin.setRawMode !== 'function') return ask(q, def)
  stdout.write(def ? `${q} [keep current]: ` : `${q}: `)
  const saved = stdin.listeners('data')
  stdin.removeAllListeners('data')
  stdin.setRawMode(true)
  stdin.resume()
  const value = await new Promise((resolve) => {
    let s = ''
    const onData = (buf) => {
      for (const ch of buf.toString('utf8')) {
        if (ch === '\r' || ch === '\n') return resolve(s)
        if (ch === '\u0003') {
          stdin.setRawMode(false)
          process.exit(1)
        }
        if (ch === '\u007f' || ch === '\b') {
          if (s) {
            s = s.slice(0, -1)
            stdout.write('\b \b')
          }
          continue
        }
        if (ch >= ' ') {
          s += ch
          stdout.write('*')
        }
      }
    }
    stdin.on('data', onData)
  })
  stdin.removeAllListeners('data')
  stdin.setRawMode(false)
  for (const l of saved) stdin.on('data', l)
  stdout.write('\n')
  return value.trim() || def
}
const yes = async (q) => /^y/i.test(await ask(`${q} (y/n)`, 'n'))
const save = () => {
  const out = [...env].map(([k, v]) => `${k}=${/[\s#"]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v}`).join('\n') + '\n'
  writeFileSync(ENV, out)
}

console.log('\n  RideSync setup — press Enter to keep the value in [brackets].\n')

/* ---- Email ---------------------------------------------------------------- */
if (await yes('Set up email so login codes arrive in students’ inboxes?')) {
  console.log('\n  Which email service?\n   1) Gmail (needs an App Password: Google Account → Security → 2-Step Verification on → App passwords)\n   2) Brevo (free 300/day — brevo.com → SMTP & API → SMTP keys)\n   3) Other SMTP\n')
  const choice = await ask('Choose 1, 2 or 3', '1')
  let host = env.get('SMTP_HOST') || '', port = env.get('SMTP_PORT') || '587'
  if (choice === '1') host = 'smtp.gmail.com'
  if (choice === '2') host = 'smtp-relay.brevo.com'
  if (choice === '3') host = await ask('SMTP host', host)
  port = await ask('SMTP port', port)
  const user = await ask(choice === '2' ? 'Brevo SMTP login (looks like 1234ab@smtp-brevo.com)' : 'Email address / username', env.get('SMTP_USER'))
  const pass = (await askSecret(choice === '1' ? 'Gmail App Password (16 letters, spaces are fine)' : 'SMTP password / key')).replace(/\s+/g, choice === '1' ? '' : ' ').trim() || env.get('SMTP_PASS') || ''
  const fromAddr = await ask('Send emails from (address)', choice === '2' ? '' : user)
  env.set('SMTP_HOST', host)
  env.set('SMTP_PORT', port)
  env.set('SMTP_USER', user)
  env.set('SMTP_PASS', pass)
  env.set('MAIL_FROM', `RideSync <${fromAddr}>`)
  save()
  const to = await ask('Send a test email to (your @vit.edu.in address)')
  if (to) {
    process.stdout.write('  Sending… ')
    try {
      const t = nodemailer.createTransport({ host, port: Number(port), secure: Number(port) === 465, auth: { user, pass } })
      await t.verify()
      await t.sendMail({ from: env.get('MAIL_FROM'), to, subject: '123456 is your RideSync test code', text: 'If you can read this, RideSync email is working. 🎉' })
      console.log('sent! Check the inbox (and Junk/Spam) for "RideSync test code".\n')
    } catch (e) {
      const msg = String(e?.message || e)
      console.log('failed.\n')
      if (/535|Username and Password not accepted|BadCredentials/i.test(msg)) console.log('  The username or password was rejected. For Gmail, use an App Password, not your normal password.\n')
      else if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(msg)) console.log('  Couldn’t connect to the mail server. Check the host/port and your internet.\n')
      else if (/sender|from/i.test(msg)) console.log('  The "from" address isn’t allowed. With Brevo, verify the sender address in your Brevo account first.\n')
      console.log('  Details:', msg, '\n')
    }
  }
}

/* ---- Backup email sender --------------------------------------------------- */
if (env.get('SMTP_HOST') && (await yes('Add a BACKUP email account (used automatically when the main one hits its daily limit)?'))) {
  console.log('\n  Recommended: a free Brevo account (300 emails/day) — brevo.com → SMTP & API → SMTP keys.\n   1) Brevo\n   2) Another Gmail\n   3) Other SMTP\n')
  const c = await ask('Choose 1, 2 or 3', '1')
  const host = c === '1' ? 'smtp-relay.brevo.com' : c === '2' ? 'smtp.gmail.com' : await ask('SMTP host', env.get('SMTP2_HOST'))
  const port = await ask('SMTP port', env.get('SMTP2_PORT') || '587')
  const user = await ask(c === '1' ? 'Brevo SMTP login (looks like 1234ab@smtp-brevo.com)' : 'Email address / username', env.get('SMTP2_USER'))
  const pass = (await askSecret('Password / SMTP key / App Password')).replace(c === '2' ? /\s+/g : /^\s+|\s+$/g, '') || env.get('SMTP2_PASS') || ''
  const from = await ask('Send emails from (an address you verified with this service)', c === '2' ? user : (env.get('MAIL_FROM') || '').replace(/^.*<|>$/g, ''))
  env.set('SMTP2_HOST', host)
  env.set('SMTP2_PORT', port)
  env.set('SMTP2_USER', user)
  env.set('SMTP2_PASS', pass)
  env.set('MAIL2_FROM', `RideSync <${from}>`)
  save()
  const to = await ask('Send a test email from the backup to (your @vit.edu.in address)')
  if (to) {
    process.stdout.write('  Sending… ')
    try {
      const t = nodemailer.createTransport({ host, port: Number(port), secure: Number(port) === 465, auth: { user, pass } })
      await t.sendMail({ from: env.get('MAIL2_FROM'), to, subject: '654321 is your RideSync test code (backup sender)', text: 'If you can read this, the RideSync backup sender works.' })
      console.log('sent! Check the inbox (and Junk).\n')
    } catch (e) {
      console.log(`failed: ${e?.message || e}\n`)
    }
  }
}

/* ---- Razorpay --------------------------------------------------------------- */
if (await yes('Set up Razorpay online payments?')) {
  console.log('\n  razorpay.com → sign up → Dashboard (Test mode) → Account & Settings → API Keys → Generate Test Key.\n')
  env.set('RAZORPAY_KEY_ID', await ask('Key Id (starts with rzp_test_ or rzp_live_)', env.get('RAZORPAY_KEY_ID')))
  env.set('RAZORPAY_KEY_SECRET', await askSecret('Key Secret', env.get('RAZORPAY_KEY_SECRET')))
  const wh = await ask('Webhook secret (optional — only after you add a webhook, see README)', env.get('RAZORPAY_WEBHOOK_SECRET'))
  if (wh) env.set('RAZORPAY_WEBHOOK_SECRET', wh)
  save()
  process.stdout.write('  Checking keys… ')
  try {
    const auth = Buffer.from(`${env.get('RAZORPAY_KEY_ID')}:${env.get('RAZORPAY_KEY_SECRET')}`).toString('base64')
    const r = await fetch('https://api.razorpay.com/v1/orders?count=1', { headers: { Authorization: `Basic ${auth}` } })
    console.log(r.ok ? 'keys work ✓\n' : `Razorpay said ${r.status} — double-check the Key Id and Secret.\n`)
  } catch {
    console.log('couldn’t reach Razorpay (check internet).\n')
  }
}

/* ---- Google Maps ------------------------------------------------------------ */
if (await yes('Set up Google Maps (map, place search and routes)?')) {
  console.log('\n  console.cloud.google.com → new project → turn on billing → enable: Maps JavaScript API, Places API (New),\n  Geocoding API, Routes API → APIs & Services → Credentials → Create credentials → API key.\n')
  const key = (await ask('Google Maps API key (starts with AIza)', env.get('GOOGLE_MAPS_API_KEY'))).trim()
  if (key) {
    env.set('GOOGLE_MAPS_API_KEY', key)
    save()
    const H = { 'X-Goog-Api-Key': key, 'Content-Type': 'application/json' }
    const checks = [
      ['Geocoding API', () => fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=19.0222,72.8711&key=${encodeURIComponent(key)}`).then(async (r) => { const j = await r.json(); return j.status === 'OK' || j.status === 'ZERO_RESULTS' ? '' : j.error_message || j.status })],
      ['Places API (New)', () => fetch('https://places.googleapis.com/v1/places:autocomplete', { method: 'POST', headers: H, body: JSON.stringify({ input: 'Dadar', includedRegionCodes: ['in'] }) }).then(async (r) => (r.ok ? '' : (await r.json().catch(() => ({}))).error?.message || `HTTP ${r.status}`))],
      ['Routes API', () => fetch('https://routes.googleapis.com/directions/v2:computeRoutes', { method: 'POST', headers: { ...H, 'X-Goog-FieldMask': 'routes.distanceMeters' }, body: JSON.stringify({ origin: { location: { latLng: { latitude: 19.0222, longitude: 72.8711 } } }, destination: { location: { latLng: { latitude: 19.0176, longitude: 72.8562 } } }, travelMode: 'DRIVE' }) }).then(async (r) => (r.ok ? '' : (await r.json().catch(() => ({}))).error?.message || `HTTP ${r.status}`))],
    ]
    for (const [name, run] of checks) {
      process.stdout.write(`  Checking ${name}… `)
      try {
        const err = await run()
        console.log(err ? `not working:\n    ${err}\n    → enable "${name}" in Google Cloud (APIs & Services → Library) and check billing is on.` : 'works ✓')
      } catch {
        console.log('couldn’t reach Google (check internet).')
      }
    }
    console.log('  (The map itself — Maps JavaScript API — is checked when you open RideSync. If it fails, RideSync shows the free map instead.)\n')
  }
}

/* ---- Maps ------------------------------------------------------------------ */
if (await yes('Add free map keys instead (MapTiler for maps & search, OpenRouteService for routes)?')) {
  console.log('\n  MapTiler: cloud.maptiler.com → sign up free → Account → API keys.\n  OpenRouteService: openrouteservice.org → sign up free → Dashboard → Request a token.\n  Leave either empty to keep the free default.\n')
  const mt = await ask('MapTiler key', env.get('MAPTILER_KEY'))
  const ors = await ask('OpenRouteService key', env.get('ORS_API_KEY'))
  if (mt) env.set('MAPTILER_KEY', mt)
  if (ors) env.set('ORS_API_KEY', ors)
  save()
}

/* ---- Live traffic ------------------------------------------------------------ */
if (await yes('Add live traffic (free TomTom key — real traffic in ETAs, routes and on the map)?')) {
  console.log('\n  developer.tomtom.com → Register (free, no card) → Dashboard → Keys → copy the default key ("My first API key").\n')
  const tt = (await ask('TomTom API key', env.get('TOMTOM_KEY'))).trim()
  if (tt) {
    env.set('TOMTOM_KEY', tt)
    save()
    process.stdout.write('  Checking key… ')
    try {
      const r = await fetch(`https://api.tomtom.com/routing/1/calculateRoute/19.0222,72.8711:19.0176,72.8562/json?key=${encodeURIComponent(tt)}&traffic=true`)
      if (r.ok) {
        const j = await r.json()
        const s = j.routes?.[0]?.summary
        console.log(s ? `works ✓ (VIT → Dadar right now: ${Math.round(s.travelTimeInSeconds / 60)} min, ${Math.round((s.trafficDelayInSeconds ?? 0) / 60)} min of it traffic)\n` : 'works ✓\n')
      } else console.log(`TomTom said ${r.status} — copy the key again from developer.tomtom.com → Keys.\n`)
    } catch {
      console.log('couldn’t reach TomTom (check internet).\n')
    }
  }
}

console.log('  Saved to .env. Restart RideSync (close the black window, then start it again) to use the new settings.\n')
rl.close()
