import { Camera } from 'lucide-react'
import { useRef, useState } from 'react'
import { ApiError, updateMe } from '@/services/api'
import { useToast } from './Toast'
import { Avatar } from './ui'

/** Downscale to a 320px square JPEG so uploads stay small (~30 KB). */
function toSquareJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const s = 320
      const c = document.createElement('canvas')
      c.width = s
      c.height = s
      const m = Math.min(img.width, img.height)
      c.getContext('2d')!.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s)
      URL.revokeObjectURL(img.src)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => reject(new Error('That file isn’t an image we can read.'))
    img.src = URL.createObjectURL(file)
  })
}

/** Your own profile photo — saved to your account straight away. */
export function PhotoPicker({ name, photo }: { name: string; photo?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toast({ tone: 'error', message: 'Choose a photo (JPG, PNG or WebP).' })
    if (file.size > 15 * 1024 * 1024) return toast({ tone: 'error', message: 'That photo is over 15 MB.' })
    setBusy(true)
    try {
      await updateMe({ photo: await toSquareJpeg(file) })
      toast({ tone: 'success', message: 'Profile photo updated' })
    } catch (err) {
      toast({ tone: 'error', message: err instanceof ApiError || err instanceof Error ? err.message : 'Couldn’t upload photo' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="row gap-4">
      <button type="button" className="photo-edit" onClick={() => input.current?.click()} aria-label={photo ? 'Change profile photo' : 'Add profile photo'} disabled={busy}>
        <Avatar name={name || '?'} src={photo} size="xl" />
        <span className="photo-edit__badge">{busy ? <span className="btn__spinner" style={{ position: 'static', width: 14, height: 14 }} /> : <Camera />}</span>
      </button>
      <div className="stack gap-1">
        <button type="button" className="t-body t-strong t-primary" style={{ textAlign: 'left' }} onClick={() => input.current?.click()} disabled={busy}>
          {photo ? 'Change photo' : 'Add your photo'}
        </button>
        <span className="t-caption t-muted" style={{ fontWeight: 400 }}>
          Helps your driver or riders recognise you at pickup
        </span>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />
    </div>
  )
}
