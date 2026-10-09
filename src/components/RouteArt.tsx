import { motion } from 'framer-motion'

/** Wadala (VIT) → BKC, drawn over a little city map. */
const ROUTE = 'M 92 318 C 150 318 150 262 196 248 S 262 236 286 196 S 318 120 392 104'

const ease = [0.45, 0, 0.2, 1] as const

/**
 * A small, real-looking city map: creek and sea, a park, building blocks, a highway
 * and streets. The route draws itself in Google-style blue (with one slow, orange
 * stretch) and a car drives it from VIT to BKC on a loop. Used on the landing page
 * and the sign-in brand panel.
 */
export function RouteArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 400" className={className} style={{ width: '100%', height: 'auto', maxWidth: 560, borderRadius: 28 }} aria-hidden>
      <defs>
        <clipPath id="ra-clip">
          <rect width="480" height="400" rx="28" />
        </clipPath>
        <filter id="ra-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#15182E" floodOpacity="0.16" />
        </filter>
        <filter id="ra-car" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#15182E" floodOpacity="0.35" />
        </filter>
        <pattern id="ra-blocks" width="34" height="30" patternUnits="userSpaceOnUse">
          <rect x="3" y="3" width="28" height="24" rx="3" fill="#e9e5de" />
          <rect x="3" y="3" width="28" height="5" rx="2" fill="#f1ede7" />
        </pattern>
      </defs>

      <g clipPath="url(#ra-clip)">
        {/* Land */}
        <rect width="480" height="400" fill="#f5f2ec" />
        {/* City blocks */}
        <rect x="0" y="0" width="480" height="400" fill="url(#ra-blocks)" opacity="0.9" />

        {/* Sea (top right) and the creek (left) */}
        <path d="M 330 0 C 360 40 420 50 480 46 L 480 0 Z" fill="#bcdcf3" />
        <path d="M 0 150 C 40 160 60 200 50 240 C 42 276 8 300 0 304 Z" fill="#bcdcf3" />
        <path d="M 120 400 C 150 360 210 350 250 372 C 280 388 300 400 300 400 Z" fill="#bcdcf3" />

        {/* Parks */}
        <rect x="350" y="250" width="92" height="64" rx="10" fill="#cfe7c6" />
        <circle cx="372" cy="270" r="6" fill="#b7dbac" />
        <circle cx="398" cy="292" r="8" fill="#b7dbac" />
        <circle cx="424" cy="268" r="5" fill="#b7dbac" />
        <rect x="70" y="40" width="70" height="52" rx="10" fill="#cfe7c6" />

        {/* Highway */}
        <path d="M -10 210 C 120 196 300 168 490 120" fill="none" stroke="#f2d27a" strokeWidth="13" strokeLinecap="round" />
        <path d="M -10 210 C 120 196 300 168 490 120" fill="none" stroke="#fde59a" strokeWidth="9" strokeLinecap="round" />

        {/* Streets */}
        <g fill="none" strokeLinecap="round">
          {['M 0 290 L 480 262', 'M 0 110 L 480 86', 'M 168 0 L 206 400', 'M 300 0 L 330 400', 'M 0 360 L 480 330'].map((d) => (
            <g key={d}>
              <path d={d} stroke="#e3ddd2" strokeWidth="11" />
              <path d={d} stroke="#ffffff" strokeWidth="8" />
            </g>
          ))}
        </g>

        {/* Area names */}
        <g fontFamily="Inter Variable, Inter, sans-serif" fontSize="10" fontWeight="600" fill="#8a8ca0" letterSpacing="0.08em">
          <text x="44" y="352">WADALA</text>
          <text x="398" y="160">BKC</text>
          <text x="222" y="150">SION</text>
          <text x="368" y="336" fill="#6f9a64">PARK</text>
          <text x="412" y="30" fill="#5f8fb6">SEA</text>
        </g>

        {/* Route: white casing, blue line drawing in, one slow orange stretch */}
        <path d={ROUTE} fill="none" stroke="#fff" strokeWidth="13" strokeLinecap="round" />
        <motion.path d={ROUTE} fill="none" stroke="#1a73e8" strokeWidth="7" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease, delay: 0.2 }} />
        <motion.path
          d={ROUTE}
          pathLength={100}
          fill="none"
          stroke="#f29900"
          strokeWidth="7"
          strokeDasharray="0 54 12 100"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6, duration: 0.4 }}
        />

        {/* Pickup: VIT */}
        <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 400, damping: 22 }} style={{ transformOrigin: '92px 318px' }}>
          <circle cx="92" cy="318" r="10" fill="#1a73e8" opacity="0.25">
            <animate attributeName="r" values="10;24;10" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.35;0;0.35" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle cx="92" cy="318" r="11" fill="#fff" />
          <circle cx="92" cy="318" r="7.5" fill="#15182E" />
          <circle cx="92" cy="318" r="3" fill="#fff" />
          <g filter="url(#ra-shadow)">
            <rect x="56" y="270" width="96" height="34" rx="9" fill="#15182E" />
          </g>
          <text x="66" y="285" fontFamily="Inter Variable, Inter, sans-serif" fontSize="11" fontWeight="700" fill="#fff">
            VIT Wadala
          </text>
          <text x="66" y="298" fontFamily="Inter Variable, Inter, sans-serif" fontSize="9.5" fontWeight="500" fill="#c9cbe0">
            Leave 8:40 AM
          </text>
        </motion.g>

        {/* Destination: BKC */}
        <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.45, type: 'spring', stiffness: 400, damping: 22 }} style={{ transformOrigin: '392px 104px' }}>
          <rect x="380" y="92" width="24" height="24" rx="6" fill="#fff" />
          <rect x="384" y="96" width="16" height="16" rx="4" fill="#5038E6" />
          <rect x="389" y="101" width="6" height="6" rx="1.5" fill="#fff" />
          <g filter="url(#ra-shadow)">
            <rect x="350" y="48" width="104" height="34" rx="9" fill="#fff" />
          </g>
          <text x="360" y="63" fontFamily="Inter Variable, Inter, sans-serif" fontSize="11" fontWeight="700" fill="#15182E">
            BKC
          </text>
          <text x="360" y="76" fontFamily="Inter Variable, Inter, sans-serif" fontSize="9.5" fontWeight="500" fill="#6b6e85">
            Arrive ~9:02 AM
          </text>
        </motion.g>

        {/* Car driving the route (top-down), turning with the road */}
        <g filter="url(#ra-car)">
          <g>
            <rect x="-12" y="-6.5" width="24" height="13" rx="4" fill="#15182E" />
            <rect x="2" y="-5" width="6" height="10" rx="2" fill="#7fb2ff" />
            <rect x="-9" y="-5" width="4.5" height="10" rx="1.5" fill="#5e6488" />
            <rect x="-4" y="-5.5" width="6" height="11" rx="1.5" fill="#262a45" />
            <rect x="10" y="-5.5" width="2" height="3" rx="1" fill="#ffe08a" />
            <rect x="10" y="2.5" width="2" height="3" rx="1" fill="#ffe08a" />
            <animateMotion dur="6s" begin="1.6s" repeatCount="indefinite" rotate="auto" path={ROUTE} keyPoints="0;1;1" keyTimes="0;0.85;1" calcMode="spline" keySplines="0.4 0 0.3 1;0 0 1 1" />
          </g>
        </g>

        {/* Time bubble on the route */}
        <motion.g initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.7, duration: 0.35 }}>
          <g filter="url(#ra-shadow)">
            <rect x="196" y="186" width="104" height="40" rx="11" fill="#15182E" />
            <path d="M 242 226 L 248 233 L 254 226 Z" fill="#15182E" />
          </g>
          <text x="208" y="203" fontFamily="Inter Variable, Inter, sans-serif" fontSize="13" fontWeight="800" fill="#fff">
            22 min
          </text>
          <circle cx="212" cy="215" r="3" fill="#ffb020" />
          <text x="219" y="218" fontFamily="Inter Variable, Inter, sans-serif" fontSize="9.5" fontWeight="500" fill="#c9cbe0">
            +4 min traffic
          </text>
        </motion.g>

        {/* Match chip */}
        <motion.g initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2, duration: 0.35 }}>
          <g filter="url(#ra-shadow)">
            <rect x="24" y="22" width="156" height="40" rx="20" fill="#fff" />
          </g>
          <circle cx="46" cy="42" r="11" fill="#e0dbff" />
          <text x="44" y="46" textAnchor="middle" fontFamily="Inter Variable, Inter, sans-serif" fontSize="10" fontWeight="700" fill="#422BC8">
            AK
          </text>
          <circle cx="68" cy="42" r="11" fill="#d7e8ff" stroke="#fff" strokeWidth="2" />
          <text x="68" y="46" textAnchor="middle" fontFamily="Inter Variable, Inter, sans-serif" fontSize="10" fontWeight="700" fill="#1a5bb8">
            RS
          </text>
          <text x="86" y="39" fontFamily="Inter Variable, Inter, sans-serif" fontSize="11" fontWeight="700" fill="#15182E">
            94% match
          </text>
          <text x="86" y="52" fontFamily="Inter Variable, Inter, sans-serif" fontSize="9.5" fontWeight="500" fill="#6b6e85">
            2 seats · ₹60
          </text>
        </motion.g>
      </g>
    </svg>
  )
}
