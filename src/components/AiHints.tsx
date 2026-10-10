import { Sparkles } from 'lucide-react'
import { Badge } from './ui'

/** ML: chance the driver accepts (match model). Shown only when the model is trained. */
export function AiChance({ chance, compact }: { chance?: number; compact?: boolean }) {
  if (chance === undefined) return null
  const pct = Math.round(chance * 100)
  if (compact) return pct >= 75 ? <span className="badge badge--ai"><Sparkles /> AI pick</span> : null
  return (
    <span className="badge badge--ai" title="Predicted by RideSync's matching model from past requests">
      <Sparkles /> AI: {pct}% likely to accept
    </span>
  )
}

/** ML: rider reliability from the no-show/cancellation model. */
export function Reliability({ risk }: { risk?: number }) {
  if (risk === undefined) return null
  if (risk < 0.25) return <Badge tone="success">Usually shows up</Badge>
  if (risk < 0.5) return <Badge tone="warning">Sometimes cancels</Badge>
  return <Badge tone="error">Often cancels</Badge>
}
