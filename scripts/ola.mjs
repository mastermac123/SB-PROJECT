// RideSync — reset Ola Maps: removes the old Ola key, asks for a new one, tests it on every
// Ola service RideSync uses and shows exactly what Ola says. Windows: double-click ola.bat
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

// Line queue so pasted answers are never lost.
const rl = createInterface({ input: process.stdin })
const lines = []
const waiters = []
rl.on('line', (l) => (waiters.length ? waiters.shift()(l) : lines.push(l)))
rl.on('close', () => waiters.splice(0).forEach((w) => w('')))
const ask = (q) => {
  process.stdout.write(q)
  return new Promise((r) => (lines.length ? r(lines.shift()) : waiters.push(r))).then((a) => a.trim())
}
const ENV = '.env'
const env = new Map()
if (existsSync(ENV))
  for (const line of readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env.set(m[1], m[2].replace(/^"(.*)"$/, '$1'))
  }
const save = () => writeFileSync(ENV, [...env].map(([k, v]) => `${k}=${/[\s#"]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v}`).join('\n') + '\n')

/** People often paste a whole URL, "api_key=…", quotes or spaces — keep only the key. */
const clean = (s) => {
  let v = s.trim().replace(/^["']|["']$/g, '')
  const m = v.match(/api_key=([^&\s]+)/)
  if (m) v = decodeURIComponent(m[1])
  return v.replace(/\s+/g, '')
}
const hide = (text, secret) => (secret ? text.split(secret).join('••••') : text)

const SPOT = '19.0222,72.8711' // VIT Wadala
const TESTS = [
  ['Place names', 'GET', `https://api.olamaps.io/places/v1/reverse-geocode?latlng=${SPOT}`],
  ['Search', 'GET', `https://api.olamaps.io/places/v1/autocomplete?input=Dadar&location=${SPOT}`],
  ['Trip times', 'POST', `https://api.olamaps.io/routing/v1/directions?origin=${SPOT}&destination=19.0176,72.8562&mode=driving&overview=false`],
  ['Map style (website)', 'GET', 'https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json'],
]

async function run(auth) {
  let ok = 0
  let reached = 0
  for (const [name, method, url] of TESTS) {
    const u = auth.key ? `${url}&api_key=${encodeURIComponent(auth.key)}`.replace('.json&', '.json?') : url
    const headers = { 'X-Request-Id': `ridesync-check-${Date.now()}`, ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}) }
    try {
      const r = await fetch(u, { method, headers, signal: AbortSignal.timeout(10000) })
      const body = r.ok ? '' : hide((await r.text()).replace(/\s+/g, ' ').slice(0, 160), auth.key || auth.token)
      reached++
      if (r.ok) ok++
      console.log(`   ${r.ok ? '✓' : '✗'} ${name.padEnd(20)} ${r.ok ? 'works' : `${r.status}  ${body}`}`)
    } catch (e) {
      console.log(`   ? ${name.padEnd(20)} couldn’t reach Ola (${e.cause?.code ?? e.message})`)
    }
  }
  return { ok, reached }
}

console.log('\n  Ola Maps reset')
console.log('  ──────────────')
const had = ['OLA_MAPS_KEY', 'OLA_CLIENT_ID', 'OLA_CLIENT_SECRET'].filter((k) => env.get(k))
for (const k of ['OLA_MAPS_KEY', 'OLA_CLIENT_ID', 'OLA_CLIENT_SECRET']) env.delete(k)
save()
console.log(had.length ? '  Old Ola key removed from .env ✓\n' : '  No old Ola key was saved.\n')

console.log('  In the Ola Maps dashboard (maps.olakrutrim.com or cloud.olakrutrim.com):')
console.log('   1. Open your project → "API Keys" (or Credentials).')
console.log('   2. Create a NEW key. Leave domain / app restrictions EMPTY.')
console.log('   3. Copy the value labelled "API Key" (not the Client ID / Secret / Project ID).\n')

const key = clean(await ask('  Paste the new Ola API key (or press Enter to leave Ola off): '))
let saved = false
if (key) {
  console.log(`\n  Testing key ${key.slice(0, 4)}…${key.slice(-4)} (${key.length} characters):`)
  const { ok, reached } = await run({ key })
  if (ok > 0 || reached === 0) {
    env.set('OLA_MAPS_KEY', key)
    saved = true
    if (reached === 0) console.log('\n  Couldn’t reach Ola to check (internet?). Key saved anyway — start.bat will tell you if Ola rejects it.')
  } else {
    console.log('\n  Ola rejected this API key on every service.')
    console.log('  Your project also has OAuth credentials (Client ID + Client Secret) — let’s try those.\n')
  }
}
if (!saved && key) {
  const id = clean(await ask('  Client ID (Enter to skip): '))
  const secret = id ? clean(await ask('  Client Secret: ')) : ''
  if (id && secret) {
    try {
      const r = await fetch('https://account.olamaps.io/realms/olamaps/protocol/openid-connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'openid', client_id: id, client_secret: secret }),
        signal: AbortSignal.timeout(10000),
      })
      const j = r.ok ? await r.json() : null
      if (!j?.access_token) console.log(`   ✗ Sign-in failed (${r.status}) — Client ID or Secret is wrong.`)
      else {
        console.log('   ✓ Signed in. Testing services:')
        if ((await run({ token: j.access_token })).ok > 0) {
          env.set('OLA_CLIENT_ID', id)
          env.set('OLA_CLIENT_SECRET', secret)
          saved = true
        }
      }
    } catch (e) {
      console.log(`   ? couldn’t reach Ola (${e.cause?.code ?? e.message})`)
    }
  }
}
save()
console.log(
  saved
    ? '\n  Ola Maps saved ✓  Close the server window and run start.bat again.\n  (Any ✗ above = that service isn’t enabled on your Ola project; RideSync uses TomTom/OpenStreetMap for it.)\n'
    : '\n  Ola Maps is OFF. Nothing is broken: RideSync uses TomTom for traffic and\n  OpenStreetMap/MapTiler for the map and names. Run ola.bat again any time.\n',
)
rl.close()
