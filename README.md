# RideSync AI

AI-matched carpooling for the VIT community. Drivers and riders are both verified VIT students: a student with a car offers empty seats, and another student heading the same way books one.

Built with React 19, TypeScript, Vite, Leaflet (OpenStreetMap / CARTO tiles), and Framer Motion.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # matching + validation unit tests
npm run build      # typecheck + production build
```

**Demo account:** `aarav.menon2022@vitstudent.ac.in` / `ridesync123`. The login screen also has a "Use the demo account" link. The account can both offer and find rides.

New accounts work too. Email delivery isn't connected yet, so the verification code in test mode is **123456**.

## What's in the box

| Area | Route |
|---|---|
| Splash, landing, login, register, email verification, forgot password | `/`, `/welcome`, `/login`, `/register`, `/verify`, `/forgot` |
| Onboarding: commute mode, vehicle, permissions | `/onboarding` |
| Home (map-first, find or offer) | `/home` |
| Find a Ride → AI match results → ride details | `/find`, `/find/results`, `/ride/:id` |
| Booking states → payment → live ride → rating | `/trip/:id`, `/pay/:id`, `/live/:id` |
| Offer a Ride → requests (accept / decline) → start / complete | `/offer`, `/drive/:id` |
| My Rides, Wallet, Profile (+ sections), Notifications, Chat, Settings | `/rides`, `/wallet`, `/profile`, `/notifications`, `/chat`, `/settings` |
| **Design system** and **screen states gallery** | `/design-system`, `/states` |

Mobile is the primary layout: a full-bleed map with a draggable bottom sheet. At 1024px and wider the app switches to a sidebar plus a two-column mobility layout (information panel + map), rather than stretching the mobile UI.

## Architecture

```
src/
  lib/          types, geo maths, AI match scoring, validation, formatting (pure, tested)
  data/         VIT places and seed community (students, cars, rides)
  services/
    db.ts         local persistence (localStorage) — stands in for the backend
    api.ts        the only module that reads/writes data; async, with latency + offline errors
    routing.ts    OSRM road routing with an offline estimate fallback
    payments.ts   PaymentGateway interface + sandbox gateway
  components/   design-system components (Button, Field, BottomSheet, MapView, RideCard…)
  layouts/      AppShell, MapScreen (sheet ↔ panel), Page, AuthLayout
  screens/      one file per product area
  styles/       tokens.css → base → components → layouts → screens
```

### Honest limits of this build

- **No backend yet.** `services/api.ts` runs against local storage, so data lives in your browser. Every function is async and returns realistic errors, so replacing it with HTTP calls touches one module.
- **The community is simulated.** Seed students accept requests, request seats on rides you publish, and reply in chat (`processScheduled` in `api.ts`). One seeded driver always declines, so the "ride declined" state is reachable.
- **Payments are sandbox only** and labelled "Test mode" everywhere. No money moves. `services/payments.ts` documents the steps for a real gateway (order → checkout → server-side signature verification). Test values: UPI `fail@test` and card `4000 0000 0000 0002` simulate declines.
- **Live tracking is simulated** on a timeline (driver arrives in about 30 s, trip takes about 50 s). In production these transitions come from the driver's GPS.
- **Google sign-in** works when `VITE_GOOGLE_CLIENT_ID` is set, and only `@vitstudent.ac.in` accounts are accepted. Without the variable, the button explains that it isn't configured.
- Testing tools live under **Settings → Testing**: simulate offline, and reset local data.

See [`docs/DESIGN.md`](docs/DESIGN.md) for design decisions and [`docs/AI-MATCHING.md`](docs/AI-MATCHING.md) for how matching works.

## Brand

The logo in `public/brand/` is the supplied artwork. `ridesync-logo-original.webp` is untouched. The PNG variants are crops of it (full, without tagline, mark only), never redrawn.
