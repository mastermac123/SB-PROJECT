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
  const pass = (await ask(choice === '1' ? 'Gmail App Password (16 letters, spaces are fine)' : 'SMTP password / key')).replace(/\s+/g, choice === '1' ? '' : ' ').trim() || env.get('SMTP_PASS') || ''
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
  const pass = (await ask('Password / SMTP key / App Password')).replace(c === '2' ? /\s+/g : /^\s+|\s+$/g, '') || env.get('SMTP2_PASS') || ''
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
  env.set('RAZORPAY_KEY_SECRET', await ask('Key Secret', env.get('RAZORPAY_KEY_SECRET')))
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

/* ---- Maps ------------------------------------------------------------------ */
if (await yes('Add map keys (MapTiler for maps & search, OpenRouteService for routes)?')) {
  console.log('\n  MapTiler: cloud.maptiler.com → sign up free → Account → API keys.\n  OpenRouteService: openrouteservice.org → sign up free → Dashboard → Request a token.\n  Leave either empty to keep the free default.\n')
  const mt = await ask('MapTiler key', env.get('MAPTILER_KEY'))
  const ors = await ask('OpenRouteService key', env.get('ORS_API_KEY'))
  if (mt) env.set('MAPTILER_KEY', mt)
  if (ors) env.set('ORS_API_KEY', ors)
  save()
}

console.log('  Saved to .env. Restart RideSync (close the black window, then start it again) to use the new settings.\n')
rl.close()
