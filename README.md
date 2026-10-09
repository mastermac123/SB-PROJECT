# RideSync AI

AI-matched carpooling for VIT students. A student with a car offers empty seats, and another student heading the same way books one. Only verified **@vit.edu.in** accounts can sign in. The server enforces this on every login.

The app is a full stack: a React web app, a Node.js API, a SQLite database and live updates over Server-Sent Events. When a driver publishes a ride on one phone, it appears straight away on every other student's phone. Requests, acceptances, chat and the driver's live GPS position also move between devices in real time.

## Quick start (on your computer)

1. Install **Node.js 22 LTS** from https://nodejs.org. Just click Next through the installer.
2. Download this project: on GitHub, click **Code → Download ZIP**, then unzip it.
3. Start it:
   - **Windows:** double-click **`start.bat`**
   - **Mac:** right-click **`start.command`** → Open
   - **Linux:** run `./start.sh`
4. Your browser opens **http://localhost:5173**. Click **Create Account** and enter your `@vit.edu.in` email.
5. The 6-digit code appears in the **black terminal window**, because email sending isn't set up yet. Type it in and you're in.

The first start installs everything (about a minute). After that it starts in seconds. Keep the terminal window open while you use the app.

To test with two students on one computer, use a normal browser window for one and an **incognito/private** window for the other. Offer a ride in one, and it appears on the other's Home screen instantly.

---

## 1. Run it on your computer

You need **Node.js 22.13 or newer** (download it from https://nodejs.org).

```bash
npm install
cp .env.example .env      # on Windows: copy .env.example .env
npm run dev               # opens http://localhost:5173
```

To try two accounts on one computer before setting up Microsoft or email, set `DEV_LOGIN=true` in `.env`. A "Local development sign-in" box then appears on the login page. Use a normal window for one student and a private/incognito window for the other. This box **never** works in production.

Login codes are printed in the terminal while email isn't set up (local development only).

To test on your phone, connect it to the same Wi-Fi and open the "Network" address that `npm run dev` prints. Phones only allow GPS on `https://` pages or `localhost`, so test live location after deploying.

## 2. Turn on "Sign in with Microsoft" (recommended, free)

`@vit.edu.in` accounts are Microsoft 365 (Outlook) accounts, so students sign in with the same login they use for college email. Microsoft charges nothing for this.

1. Go to https://entra.microsoft.com and sign in with any Microsoft account (a personal Outlook/Hotmail account is fine).
2. Open **Applications → App registrations → New registration**.
   - **Name:** `RideSync`
   - **Supported account types:** *Accounts in any organizational directory (Any Microsoft Entra ID tenant – Multitenant)*
   - **Redirect URI:** platform **Web**, value `http://localhost:5173/api/auth/microsoft/callback`
3. After it's created, copy the **Application (client) ID** into `MICROSOFT_CLIENT_ID`.
4. Open **Certificates & secrets → New client secret**. Copy the **Value** (not the ID) into `MICROSOFT_CLIENT_SECRET`. Secrets expire; set a reminder to renew it.
5. When you deploy, add your live callback under **Authentication → Redirect URIs**, e.g. `https://your-app.onrender.com/api/auth/microsoft/callback`, and set `PUBLIC_URL=https://your-app.onrender.com`.

How the check works: the server finds VIT's Microsoft directory from the `vit.edu.in` domain and only accepts accounts from that directory, and the email must also end in `@vit.edu.in`. Personal Outlook or Hotmail accounts, and other colleges, are rejected.

**If students see "Need admin approval":** some colleges only allow apps their IT team has approved. Ask VIT IT to grant consent for "RideSync" (it only reads your name and email). Until then, students can use the email code below.

Google sign-in is also supported (`GOOGLE_CLIENT_ID`) for colleges whose email runs on Google; leave it empty for VIT.

## 3. Turn on email login codes (works for every student)

A backup that works even before IT approval: a 6-digit code sent to the student's `@vit.edu.in` Outlook inbox. Add any SMTP provider to `.env`. Gmail example:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.address@gmail.com
SMTP_PASS=your-16-char-app-password      # Google Account → Security → App passwords
MAIL_FROM="RideSync <your.address@gmail.com>"
```

Brevo, Resend, Zoho and Amazon SES work the same way and scale better. Codes expire after 10 minutes, are single-use, and are rate-limited. Send yourself a test code first: Microsoft 365 can put mail from new senders in **Junk**. If it does, mark it "Not junk"; Brevo usually delivers more reliably than Gmail.

## 4. Put it online

The app runs as **one server** that serves the website and the API together. The database is a single file, so it needs a persistent disk.

**Render (simplest):** push this repo to GitHub. In Render, choose **New → Blueprint** and pick the repo; `render.yaml` sets everything up, including a 1 GB disk. Enter `PUBLIC_URL`, the Microsoft values and the SMTP values when Render asks. Then add the live callback URL to your Microsoft app's Redirect URIs.

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
| Sign in | Sign in with Microsoft (VIT Outlook account) or an email code. The server checks the account belongs to VIT's Microsoft directory and the email ends in `@vit.edu.in`, creates the account on first login, and sets a 30-day httpOnly session cookie. |
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
  auth.ts            email codes, sessions, domain rule (+ Google)
  microsoft.ts       Sign in with Microsoft (VIT tenant only)
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
npm test          # 23 tests, including a full two-account ride and Microsoft sign-in checks
npm run typecheck
```

The tests cover:

- Microsoft sign-in: wrong college directory, non-college emails, tampered or replayed sign-ins
- domain enforcement and look-alike domains
- the CSRF check
- email codes
- onboarding rules
- privacy (phone and UPI ID hidden until a booking is accepted)
- overbooking
- declines and cancellations
- the full driver ↔ rider lifecycle
