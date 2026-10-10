// RideSync — set up Mappls (MapmyIndia) live traffic. Tries every way Mappls accepts keys,
// shows exactly what Mappls answers, and saves whatever works. Windows: double-click mappls.bat
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const rl = createInterface({ input: process.stdin })
const lines = []
const waiters = []
rl.on('line', (l) => (waiters.length ? waiters.shift()(l) : lines.push(l)))
rl.on('close', () => waiters.splice(0).forEach((w) => w('')))
const ask = (q) => {
  process.stdout.write(q)
  return new Promise((r) => (lines.length ? r(lines.shift()) : waiters.push(r))).then((a) => a.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ''))
}
const ENV = '.env'
const env = new Map()
if (existsSync(ENV))
  for (const line of readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env.set(m[1], m[2].replace(/^"(.*)"$/, '$1'))
  }
const save = () => writeFileSync(ENV, [...env].map(([k, v]) => `${k}=${/[\s#"]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v}`).join('\n') + '\n')
const hide = (t, ...secrets) => secrets.filter(Boolean).reduce((s, x) => s.split(x).join('••••'), t)

const C = '72.8711,19.0222;72.8562,19.0176' // VIT Wadala → Dadar
const opts = 'overview=false&steps=false&alternatives=false&region=ind'
const RES = ['route_traffic', 'route_eta', 'route_adv']

console.log('\n  Mappls (MapmyIndia) live traffic setup')
console.log('  ──────────────────────────────────────')
console.log('  In apis.mappls.com / about.mappls.com/api → Console → your project, you may see:')
console.log('    • a "Static Key" / "REST API Key"          (one long code)')
console.log('    • a "Client ID" and "Client Secret"        (two codes, for OAuth)')
console.log('  Paste whichever you have. Press Enter to skip one. Also make sure the key has NO domain/IP')
console.log('  restriction (or add your laptop), and that "Routing / Directions" is enabled for the project.\n')

const key = await ask('  Static key / REST API key (Enter to skip): ')
const id = await ask('  Client ID (Enter to skip): ')
const secret = id ? await ask('  Client Secret: ') : ''
let tok = ''

if (id && secret) {
  process.stdout.write('\n  Signing in with Client ID/Secret… ')
  try {
    const r = await fetch('https://outpost.mappls.com/api/security/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
      signal: AbortSignal.timeout(10000),
    })
    const t = await r.text()
    tok = r.ok ? JSON.parse(t).access_token ?? '' : ''
    console.log(tok ? 'signed in ✓' : `✗ ${r.status} ${hide(t.slice(0, 160), id, secret)}`)
  } catch (e) {
    console.log(`? couldn’t reach Mappls (${e.cause?.code ?? e.message})`)
  }
}

const ways = [
  ['static key in path', key, (k, r) => `https://apis.mappls.com/advancedmaps/v1/${encodeURIComponent(k)}/${r}/driving/${C}?${opts}`],
  ['static key as access_token', key, (k, r) => `https://route.mappls.com/route/direction/${r}/driving/${C}?${opts}&access_token=${encodeURIComponent(k)}`],
  ['OAuth token', tok, (t, r) => `https://route.mappls.com/route/direction/${r}/driving/${C}?${opts}&access_token=${encodeURIComponent(t)}`],
  ['OAuth token in path', tok, (t, r) => `https://apis.mappls.com/advancedmaps/v1/${encodeURIComponent(t)}/${r}/driving/${C}?${opts}`],
]
let ok = null
console.log('\n  Testing VIT Wadala → Dadar:')
for (const [name, cred, url] of ways) {
  if (!cred) continue
  for (const r of RES) {
    try {
      const res = await fetch(url(cred, r), { signal: AbortSignal.timeout(10000) })
      const t = await res.text()
      const d = res.ok ? JSON.parse(t).routes?.[0]?.duration : null
      if (d) {
        console.log(`   ✓ ${name} · ${r}: ${Math.round(d / 60)} min right now`)
        ok ??= { name, r }
      } else console.log(`   ✗ ${name} · ${r}: ${res.status} ${hide(t.replace(/\s+/g, ' ').slice(0, 120), key, tok)}`)
    } catch (e) {
      console.log(`   ? ${name} · ${r}: couldn’t reach Mappls (${e.cause?.code ?? e.message})`)
    }
  }
}

if (ok) {
  for (const k of ['MAPPLS_KEY', 'MAPPLS_CLIENT_ID', 'MAPPLS_CLIENT_SECRET']) env.delete(k)
  if (key) env.set('MAPPLS_KEY', key)
  if (id && secret) {
    env.set('MAPPLS_CLIENT_ID', id)
    env.set('MAPPLS_CLIENT_SECRET', secret)
  }
  save()
  console.log(`\n  Mappls saved ✓ (works with: ${ok.name}, ${ok.r}). Close the server window and run start.bat again.`)
  console.log('  RideSync now uses Mappls live traffic for trip times.\n')
} else {
  console.log('\n  Mappls didn’t accept these. Nothing was changed.')
  console.log('  Common reasons: wrong code copied · the key is restricted to a domain/IP · the project')
  console.log('  doesn’t have Routing enabled · the account is still waiting for approval.')
  console.log('  Send a screenshot of the ✗ lines above (keys are hidden) and we’ll fix it.\n')
}
rl.close()
