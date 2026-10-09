# RideSync AI — Design notes

The live reference is `/design-system` (tokens and components) and `/states` (every empty, loading and error state). This file records why things are the way they are.

## Principles applied

1. **One primary action per screen.** Each screen has a single filled button, pinned at the bottom: Find a Ride, Find AI Matches, Request Ride, Continue to Payment, Pay ₹X, Publish Ride.
2. **Map when location matters.** Home, Find, Results, Ride details, Live ride, Offer and Driver requests are map-first. Profile, wallet and history are not.
3. **Bottom sheets for context.** On mobile the sheet has two snap points and the primary action stays pinned to the screen, so it is always reachable. On desktop the sheet becomes a fixed left panel.
4. **Progressive disclosure.** Ride cards show who, match, when, where and price. The full AI breakdown sits behind "Why this ride?". Weak matches are collapsed.
5. **Every booking state is named.** Requested → Accepted (pay now) → Confirmed → Arriving → Arrived → Live → Completed, plus Declined and Cancelled. Each one has its own copy, badge colour and next action.

## Colour

Colours are sampled from the logo: mark blue `#4365F2`, indigo `#503CEB` (primary is `#5038E6`), "AI" violet `#6A3EF8`, and wordmark navy `#15182E`. The gradient is used only on the illustrated route and the wallet card. Buttons are solid indigo, because gradients on controls read as template-like. Green is for success and eco only; red is for errors, cancellation and SOS only.

## Type

Plus Jakarta Sans for headings, because its geometry is close to the wordmark. Inter for UI and body text. Times and fares use tabular figures so lists align.

## AI without gimmicks

There are no sparkles on every surface, no glow and no "thinking" animation. The score is a small ring with a percentage. The loading state says what is actually being compared ("routes, timing and pickup distance"). Every score can be explained in plain language: "Passes within 300 m of your pickup", "Reaches your pickup 10 min later than you asked".

## Language

The product uses Offer a Ride, Find a Ride, Verified VIT Student, AI Match, Shared Ride and cost share. Taxi and fare-market vocabulary is avoided. Prices are framed as cost-sharing; the server caps drivers at 1.5× the suggested contribution, and riders pay drivers directly (UPI or cash).

## Motion

- 150 ms for feedback.
- 220 ms for page and content transitions.
- Spring (420/40) for sheets.
- 900 ms for the route-draw on map load.
- Path-draw for the success check.

Skeletons replace spinners for lists. `prefers-reduced-motion` is respected globally.

## Accessibility

- Touch targets are at least 40 px (most are 48–56 px).
- Focus rings use the brand colour.
- Every icon button has a label.
- Segmented controls and tabs use `role=tablist`, and choice rows use `role=radio`.
- Live ETAs use `aria-live`.
- Errors are announced with `role=alert` and are never shown by colour alone.

## Geography

Places are set around **Vidyalankar Institute of Technology, Wadala (vit.edu.in)**, with common student destinations across Mumbai in `src/data/places.ts`. Search also falls back to OpenStreetMap for anything not in the list.
