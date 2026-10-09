import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

/**
 * Android/iOS app support. The website talks to its own server with a cookie;
 * the app talks to a configured server address and keeps its login token in
 * the phone's app storage (Capacitor Preferences).
 */

export const isApp = Capacitor.isNativePlatform()
export const appPlatform = Capacitor.getPlatform() as 'android' | 'ios' | 'web'

/** Server built into the app at build time (VITE_API_URL), e.g. https://ridesync.onrender.com */
export const builtInServer = normalizeServer(import.meta.env.VITE_API_URL ?? '')

let server = ''
let token = ''

/** Load the saved server address and login before the app renders. */
export async function initNative() {
  if (!isApp) return
  const [s, t] = await Promise.all([Preferences.get({ key: 'server' }), Preferences.get({ key: 'token' })])
  server = s.value || builtInServer
  token = t.value || ''
}

export const apiBase = () => (isApp ? server : '')
export const authToken = () => token
export const needsServer = () => isApp && !server

export function setToken(t: string | null) {
  token = t ?? ''
  void (t ? Preferences.set({ key: 'token', value: t }) : Preferences.remove({ key: 'token' }))
}

export function normalizeServer(raw: string) {
  let s = raw.trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  return s.replace(/\/+$/, '').replace(/\/api$/, '')
}

/** Check a server address answers like RideSync, then save it. */
export async function connectServer(raw: string) {
  const s = normalizeServer(raw)
  if (!s) throw new Error('Enter the server address.')
  let ok = false
  try {
    const res = await fetch(`${s}/api/config`, { headers: { 'x-ridesync': '1', 'x-ridesync-app': '1' } })
    const json = (await res.json()) as { allowedDomain?: string }
    ok = res.ok && !!json.allowedDomain
  } catch {
    ok = false
  }
  if (!ok) throw new Error('Couldn’t reach RideSync at that address. Check the link, and that RideSync and share.bat are running.')
  if (s !== server) setToken(null)
  server = s
  await Preferences.set({ key: 'server', value: s })
}

export async function forgetServer() {
  server = ''
  setToken(null)
  await Preferences.remove({ key: 'server' })
}
