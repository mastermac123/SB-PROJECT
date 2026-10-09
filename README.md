# RideSync AI

AI-matched carpooling for VIT students. A student with a car offers empty seats, and another student heading the same way books one. Only verified **@vit.edu.in** accounts can sign in. The server enforces this on every login.

The app is a full stack: a React web app, a Node.js API, a SQLite database and live updates over Server-Sent Events. When a driver publishes a ride on one phone, it appears straight away on every other student's phone. Requests, acceptances, chat and the driver's live GPS position also move between devices in real time.

---

## 1. Run it on your computer

You need **Node.js 22.13 or newer** (download it from https://nodejs.org).

```bash
npm install
cp .env.example .env      # on Windows: copy .env.example .env
npm run dev               # opens http://localhost:5173
```

To try two accounts on one computer before setting up Google or email, set `DEV_LOGIN=true` in `.env`. A "Local development sign-in" box then appears on the login page. Use a normal window for one student and a private/incognito window for the other. This box **never** works in production.

Login codes are printed in the terminal while email isn't set up (local development only).

To test on your phone, connect it to the same Wi-Fi and open the "Network" address that `npm run dev` prints. Phones only allow GPS on `https://` pages or `localhost`, so test live location after deploying.

## 2. Turn on Google sign-in (recommended)

1. Go to https://console.cloud.google.com/apis/credentials and create a project.
2. Open **OAuth consent screen**, choose **External**, and fill in the app name and email.
3. Open **Credentials → Create credentials → OAuth client ID**. Choose type **Web application**.
4. Under **Authorised JavaScript origins**, add `http://localhost:5173` and your live site, e.g. `https://ridesync.onrender.com`.
5. Copy the Client ID into `.env`:

   ```
   GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   ```

Google's sign-in popup is told to prefer `vit.edu.in` accounts. The server then checks the verified email itself and rejects anything that doesn't end in `@vit.edu.in`.

## 3. Turn on email login codes (works for every student)

Students who don't use Google with their college email can sign in with a 6-digit code sent to their `@vit.edu.in` inbox. Add any SMTP provider to `.env`. Gmail example:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.address@gmail.com
SMTP_PASS=your-16-char-app-password      # Google Account → Security → App passwords
MAIL_FROM="RideSync <your.address@gmail.com>"
```

Brevo, Resend, Zoho and Amazon SES work the same way and scale better. Codes expire after 10 minutes, are single-use, and are rate-limited.

## 4. Put it online

The app runs as **one server** that serves the website and the API together. The database is a single file, so it needs a persistent disk.

**Render (simplest):** push this repo to GitHub. In Render, choose **New → Blueprint** and pick the repo; `render.yaml` sets everything up, including a 1 GB disk. Enter `GOOGLE_CLIENT_ID` and the SMTP values when Render asks. Then add the Render URL to the Google "Authorised JavaScript origins".

**Any Docker host** (Railway, Fly.io, a VPS):

```bash
docker build -t ridesync .
docker run -p 8787:8787 -v ridesync-data:/data --env-file .env ridesync
```

**Without Docker:** run `npm run build`, then `npm start`, behind HTTPS.

Production must be served over **HTTPS**. Login cookies are marked secure, and phones need HTTPS to share GPS.

---

## How it works

| Step | What happens |
|---|---|
| Sign in | Google sign-in or an email code. The server verifies the email ends in `@vit.edu.in`, creates the account on first login, and sets a 30-day httpOnly session cookie. |
| Onboarding | Name, mobile number, student ID, commute mode, then car and UPI ID for drivers, then permissions. |
| Offer a Ride | The server gets the road route (OSRM), suggests a cost-share and enforces the 1.5× cap. Every online student's search and Home feed refresh straight away. |
| Find a Ride | The server scores every ride with the AI matcher (route overlap, pickup distance, timing, preferences, reliability) and returns explained matches. |
| Book | The rider requests a seat and the driver gets a live notification. The driver accepts or declines, and seats can't be overbooked. |
| Pay | The rider pays the driver directly by **UPI**: the app opens GPay/PhonePe/Paytm with the amount filled in, or shows a QR code on desktop. Riders can also choose **cash at pickup**. The driver can mark payment as received. RideSync never holds money, so no payment-gateway account is needed. |
| Ride | The driver taps Start. Their phone shares GPS every few seconds and riders see the car move on the map. The driver then taps Arrived → Picked up → Dropped off → Complete. |
| After | Both sides rate each other. Ratings, rides offered and taken, completion rate and CO₂ saved are calculated from real trips. |

Also included: chat for each booking, in-app and browser notifications, an SOS sheet (112, plus a text to your emergency contacts with your location), My Rides history, a payment record, and account deletion.

## Project layout

```
server/            Node API (Express + built-in node:sqlite)
  auth.ts            Google ID-token check, email codes, sessions, domain rule
  routes.ts          rides, matching, bookings, payments, chat, notifications, live location
  db.ts              schema
  events.ts          Server-Sent Events for live updates
src/               React web app
  lib/               shared with the server: types, AI matching, geo, validation
  services/api.ts    API client, live-update connection, query cache
  screens/           each product area
docs/              design notes and how matching works
```

## Checks

```bash
npm test          # 17 tests, including a full two-account ride against the real API
npm run typecheck
```

The tests cover:

- domain enforcement and look-alike domains
- the CSRF check
- email codes
- onboarding rules
- privacy (phone and UPI ID hidden until a booking is accepted)
- overbooking
- declines and cancellations
- the full driver ↔ rider lifecycle
