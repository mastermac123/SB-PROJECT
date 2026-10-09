import { motion } from 'framer-motion'

const ROUTE = 'M 70 330 C 120 330 130 262 190 252 S 268 236 286 178 S 340 96 410 92'

/**
 * Abstract map illustration: quiet street grid, one route being drawn, a
 * vehicle travelling along it. Used on landing and the auth brand panel.
 */
export function RouteArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 400" className={className} style={{ width: '100%', height: 'auto', maxWidth: 520 }} aria-hidden>
      <defs>
        <linearGradient id="ra-route" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#4365F2" />
          <stop offset="100%" stopColor="#6A3EF8" />
        </linearGradient>
        <radialGradient id="ra-fade" cx="50%" cy="50%" r="60%">
          <stop offset="60%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="ra-mask">
          <rect width="480" height="400" fill="url(#ra-fade)" />
        </mask>
      </defs>

      <g mask="url(#ra-mask)" stroke="#15182E" strokeOpacity="0.07" strokeWidth="10" strokeLinecap="round" fill="none">
        <path d="M 0 120 L 480 70" />
        <path d="M 0 260 L 480 230" />
        <path d="M 30 380 L 480 300" />
        <path d="M 110 0 L 160 400" />
        <path d="M 260 0 L 300 400" />
        <path d="M 390 0 L 420 400" />
        <path d="M 0 190 C 140 180 220 330 480 360" strokeWidth="6" />
      </g>

      <path d={ROUTE} fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" />
      <motion.path
        d={ROUTE}
        fill="none"
        stroke="url(#ra-route)"
        strokeWidth="7"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: [0.45, 0, 0.2, 1], delay: 0.2 }}
      />

      {/* Pickup */}
      <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 400, damping: 22 }} style={{ transformOrigin: '70px 330px' }}>
        <circle cx="70" cy="330" r="13" fill="#fff" />
        <circle cx="70" cy="330" r="9" fill="#15182E" />
        <circle cx="70" cy="330" r="3.5" fill="#fff" />
      </motion.g>

      {/* Destination */}
      <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.45, type: 'spring', stiffness: 400, damping: 22 }} style={{ transformOrigin: '410px 92px' }}>
        <rect x="397" y="79" width="26" height="26" rx="6" fill="#fff" />
        <rect x="401" y="83" width="18" height="18" rx="4" fill="#5038E6" />
        <rect x="407" y="89" width="6" height="6" rx="1.5" fill="#fff" />
      </motion.g>

      {/* Vehicle */}
      <g>
        <circle r="11" fill="#fff" stroke="#5038E6" strokeOpacity="0.18" strokeWidth="6">
          <animateMotion dur="5.5s" begin="1.6s" repeatCount="indefinite" path={ROUTE} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.3 1" />
        </circle>
        <circle r="5" fill="#5038E6">
          <animateMotion dur="5.5s" begin="1.6s" repeatCount="indefinite" path={ROUTE} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.3 1" />
        </circle>
      </g>

      {/* Match label */}
      <motion.g initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.7, duration: 0.3 }}>
        <rect x="218" y="186" width="118" height="34" rx="17" fill="#fff" style={{ filter: 'drop-shadow(0 4px 12px rgba(21,24,46,0.12))' }} />
        <circle cx="238" cy="203" r="7" fill="none" stroke="#D8D0FE" strokeWidth="3" />
        <circle cx="238" cy="203" r="7" fill="none" stroke="#5038E6" strokeWidth="3" strokeDasharray="44" strokeDashoffset="3" transform="rotate(-90 238 203)" strokeLinecap="round" />
        <text x="252" y="208" fontFamily="Inter Variable, sans-serif" fontSize="13" fontWeight="600" fill="#422BC8">
          94% match
        </text>
      </motion.g>
    </svg>
  )
}
