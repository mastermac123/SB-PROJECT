import { ArrowRight, Server } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button, Field, Notice } from '@/components/ui'
import { AuthLayout } from '@/layouts/AuthLayout'
import { connectServer } from '@/services/native'

/**
 * First launch of a test build of the app (no server built in): connect it to the
 * RideSync server — e.g. the https link printed by share.bat on the laptop.
 */
export function ConnectServer() {
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await connectServer(address)
      window.location.replace('/')
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <div className="auth__title">
        <h1 className="t-h1">Connect to RideSync</h1>
        <p className="t-body t-muted">Paste the server link. For testing, it’s the https link shown by share.bat on the laptop running RideSync.</p>
      </div>
      <form className="stack gap-4" onSubmit={submit} noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <Field
          label="Server link"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="https://something.trycloudflare.com"
          leading={<Server />}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <Button type="submit" size="lg" block loading={busy} trailing={<ArrowRight />}>
          Connect
        </Button>
      </form>
    </AuthLayout>
  )
}
