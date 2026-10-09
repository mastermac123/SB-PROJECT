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

### Test on real phones (Android and iPhone)

1. Start RideSync with `start.bat`.
2. Double-click **`share.bat`**. The first time, it installs Cloudflare's free tunnel tool; run it again afterwards.
3. It prints a link like `https://something.trycloudflare.com`. Open it on any phone, on any network.

The link is **https**, so GPS and live location work on phones. It only works while your laptop, `start.bat` and `share.bat` are running, and it changes every time. It's for testing only; Sign in with Microsoft won't work through it, but email codes do.

Same Wi-Fi only (no GPS): open the "Network" address that `npm run dev` prints.

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

### Sending codes to thousands of students

Each student gets their own code, sent from your RideSync email account. Students stay logged in for **90 days** (`SESSION_DAYS`), so after launch a college of ~5,000 needs only about 50–60 codes a day.

Launch week is the busy time. Plan for it like this:

| Setup | Codes per day | Cost |
|---|---|---|
| Gmail only | ~500 | free |
| Gmail + Brevo backup (setup helper asks for it) | ~800 | free |
| Brevo paid / Amazon SES | thousands | low monthly cost |
| **Sign in with Microsoft** | unlimited (no email sent) | free |

The sending limits above are approximate; check each provider's current figures.

When the main account hits its daily limit, RideSync **switches to the backup automatically** and logs it in the terminal. If every account is used up, students see "Login emails are busy right now… or use Sign in with Microsoft" instead of waiting for a code that never arrives. To spread out the launch, open sign-ups one year or branch at a time.

## 3b. The easy way to set up email, payments and maps

Run the setup helper. It asks for each key, saves it to `.env`, and **sends you a real test email** (or checks your Razorpay keys) so you know it works:

- **Windows:** double-click **`setup.bat`**
- **Mac/Linux:** run `npm run setup`

Then close the black RideSync window and start it again.

## 3c. Online payments with Razorpay (optional)

1. Sign up at https://razorpay.com. **Test mode** works immediately, with no business documents.
2. In the Dashboard (Test mode), go to **Account & Settings → API Keys → Generate Test Key**.
3. Put the Key Id and Key Secret in `.env`, or use the setup helper:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxx
   ```
4. Restart RideSync. Riders now see **Pay online** (UPI, cards, netbanking) first. In test mode, pay with UPI ID `success@razorpay` or card `4111 1111 1111 1111`.

How it works:

- The server creates the order and verifies Razorpay's signature before confirming a seat.
- If a ride is cancelled, the money is **refunded automatically**.
- When you're online, add a webhook so payments confirm even if a rider closes the tab: Dashboard → **Webhooks** → URL `https://your-site/api/payments/razorpay/webhook`, events `payment.captured` and `order.paid`, and put the secret in `RAZORPAY_WEBHOOK_SECRET`.
- Online payments land in **your** Razorpay account. Pay drivers out from there, or apply for Razorpay Route to split payments automatically.
- Live keys (real money) need Razorpay's business verification (KYC).

Riders can still pay the driver directly by UPI, or in cash.

## 3d. Maps

Maps, place search and routes work with **no keys**, using free OpenStreetMap services.

### Google Maps (recommended for the best place search)

One Google key switches on:

- the Google map
- Google place search
- names for "Use current location"
- driving routes with real distances and times

If Google ever fails (wrong key, quota used up, billing off), RideSync quietly switches back to the free services.

1. Go to https://console.cloud.google.com and create a project, e.g. `RideSync`.
2. **Billing → Link a billing account.** Google requires a card even for the free usage. Each API includes a monthly amount of free usage; check https://mapsplatform.google.com/pricing for current limits.
3. **APIs & Services → Library.** Enable these four:
   - **Maps JavaScript API** (the map)
   - **Places API (New)** (search)
   - **Geocoding API** (current-location names)
   - **Routes API** (driving routes)
4. **APIs & Services → Credentials → Create credentials → API key.** Copy the key, which starts with `AIza`.
5. Click the key → **API restrictions → Restrict key**. Tick only the four APIs above and save.
6. Run the setup helper (`setup.bat` / `npm run setup`) and answer **y** to "Set up Google Maps". It checks each API and tells you if one isn't enabled. Or set the key in `.env`:
   ```
   GOOGLE_MAPS_API_KEY=AIza...
   ```
7. Restart. The terminal shows `map: Google · search: Google · routes: Google`.

**Keep costs at zero:**

- Go to **APIs & Services → each API → Quotas** and set a daily cap a little below the free amount. Google then stops answering instead of charging, and RideSync uses the free services for the rest of the day.
- Also add a **budget alert** under Billing → Budgets & alerts, e.g. ₹100.

How RideSync saves on Google usage:

- Searches use **autocomplete sessions**: typing plus the final pick are billed as one lookup.
- Results and routes are cached.
- The popular VIT places in the list don't call Google at all.
- The map is the part used most. To save money, set `GOOGLE_MAPS_DISPLAY=false`: the map stays the free one, while search and routes still use Google.

**When you put RideSync online:** the map key is visible in the browser, which is normal for Google Maps. For extra safety, create a second key restricted to **Websites** → `https://your-site/*` with only Maps JavaScript API, and put it in `GOOGLE_MAPS_BROWSER_KEY`. The main key then stays on the server only.

### Free alternatives

- **MapTiler** (map tiles and place search): sign up at https://cloud.maptiler.com, copy your key, and set `MAPTILER_KEY`.
- **OpenRouteService** (driving routes): sign up at https://openrouteservice.org, request a token, and set `ORS_API_KEY`.

The terminal shows which map services are active when RideSync starts.

## 3e. Android and iPhone apps

The apps contain all RideSync screens and talk to the same server as the website, so everyone shares the same rides, chats and accounts. The apps are built with **Capacitor** from this same code (`android/` and `ios/`).

### Android: get the app (no Android Studio needed)

GitHub builds the app automatically on every update to `main`.

1. On your phone, open **github.com/mastermac123/SB-PROJECT → Releases → "Android app (latest)"** and download **RideSync.apk**. You must be signed in to GitHub if the repo is private.
2. Open the file. Android asks to **allow installing from this source**; allow it, then tap **Install**.
3. On first launch the app asks for a **server link**:
   - Testing with your laptop: run `start.bat`, then `share.bat`, and paste the `https://….trycloudflare.com` link.
   - Once RideSync is online: build the address into the app instead. In GitHub, go to **Settings → Secrets and variables → Actions → Variables** and add `RIDESYNC_SERVER_URL` = `https://your-server`. The next build connects automatically.
4. Sign in with your `@vit.edu.in` email code.

Change the server later from **Profile → Settings → Change server** (test builds only).

### iPhone

Apple only allows installing apps through the App Store or TestFlight, so an iPhone app needs:

- an **Apple Developer account** ($99/year)
- a **Mac** with Xcode, or a cloud Mac build service such as Codemagic

Steps on a Mac:

```bash
VITE_API_URL=https://your-server npm run build:app
npx cap open ios        # opens Xcode → pick your team → Product → Archive → TestFlight
```

Until then, iPhone users can use the website: open the link in Safari, tap **Share**, then **Add to Home Screen**.

### What works in the app today

Everything in the website works in the app:

- login with an email code
- offering, finding and booking rides
- live GPS (while the app is open)
- chat
- UPI (opens GPay/PhonePe), call and SMS
- photo upload
- maps

**Still to add for a store release:**

- push notifications while the app is closed (needs a free Firebase project)
- location sharing with the screen off
- Sign in with Microsoft inside the app
- store listings

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
| Sign in | Sign in with Microsoft (VIT Outlook account) or an email code. The server checks the account belongs to VIT's Microsoft directory and the email ends in `@vit.edu.in`, creates the account on first login, and sets a 90-day httpOnly session cookie. |
| Onboarding | Name, mobile number, student ID, commute mode, then car and UPI ID for drivers, then permissions. |
| Offer a Ride | The server gets the road route (Google Routes, or free OSRM), suggests a cost-share and enforces the 1.5× cap. Every online student's search and Home feed refresh straight away. |
| Find a Ride | The server scores every ride with the AI matcher (route overlap, pickup distance, timing, preferences, reliability) and returns explained matches. |
| Book | The rider requests a seat and the driver gets a live notification. The driver accepts or declines, and seats can't be overbooked. |
| Pay | The rider pays the driver directly by **UPI**: the app opens GPay/PhonePe/Paytm with the amount filled in, or shows a QR code on desktop. Riders can also choose **cash at pickup**, or **pay online** when Razorpay is set up. The driver can mark UPI or cash payment as received. |
| Ride | The driver taps Start. Their phone shares GPS every few seconds and riders see the car move on the map. The driver then taps Arrived → Picked up → Dropped off → Complete. |
| After | Both sides rate each other. Ratings, rides offered and taken, completion rate and CO₂ saved are calculated from real trips. |

Also included: chat for each booking, in-app and browser notifications, an SOS sheet (112, plus a text to your emergency contacts with your location), My Rides history, a payment record, and account deletion.

## Project layout

```
server/            Node API (Express + built-in node:sqlite)
  auth.ts            email codes, sessions, domain rule (+ Google)
  microsoft.ts       Sign in with Microsoft (VIT tenant only)
  google.ts          Google Maps: place search, place names, routes
  maps.ts / routing.ts  picks Google or the free map services, with fallback
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
npm test          # 37 tests: a full two-account ride, Microsoft sign-in, Razorpay payments, refunds, webhooks and Google Maps
npm run typecheck
```

The tests cover:

- Razorpay: order amount, forged signatures, webhook confirmation, automatic refunds
- Google Maps: search sessions, place details, route decoding, fallback when Google is down
- Microsoft sign-in: wrong college directory, non-college emails, tampered or replayed sign-ins
- domain enforcement and look-alike domains
- the CSRF check
- email codes
- onboarding rules
- privacy (phone and UPI ID hidden until a booking is accepted)
- overbooking
- declines and cancellations
- the full driver ↔ rider lifecycle
