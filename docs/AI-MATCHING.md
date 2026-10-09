# AI matching

Implementation: `src/lib/matching.ts`. Tests: `src/lib/__tests__/matching.test.ts`.

## Pipeline

1. **Candidates.** Scheduled rides by other students that depart within ±4.5 h of the requested time.
2. **Route geometry.** Road geometry for each ride comes from OSRM, cached. When OSRM is unreachable, a labelled estimate is used instead.
3. **Hard filters.** These remove rides that can't work:
   - not enough free seats
   - the driver isn't heading the rider's way: the projected pickup must come before the drop along the route
   - the estimated detour is more than 1.6× the driver's maximum
   - the time gap is more than 3 h
4. **Factors.** Each factor is a 0–1 value:

| Factor | Weight | Signal |
|---|---|---|
| Route similarity | 0.30 | Overlap of the rider's trip with the driver's route, plus decay on drop-off distance |
| Pickup proximity | 0.22 | Decay on the perpendicular distance from pickup to the route (0.3 km ≈ 95 %, 2 km ≈ 42 %). ×0.8 if the detour exceeds the driver's limit |
| Time compatibility | 0.20 | Gaussian on the gap between the requested time and the driver's ETA at the pickup (σ ≈ 45 min) |
| Driver reliability | 0.16 | Bayesian-smoothed rating (prior 4.5 × 5) and completion rate, +0.05 if the rider has ridden with this driver before and rated them 4★ or more |
| Preference match | 0.12 | Share of the rider's preferences that are met. Female-friendly uses driver gender or the ride flag; Minimal detour uses the computed detour |

5. **Score.** Score = 100 × weighted sum, capped at 60 when pickup is more than 3 km from the route. Tiers: excellent ≥ 85, good ≥ 70, fair ≥ 55, weak below that.
6. **Fare.** The rider pays the driver's per-seat contribution × the share of the route they travel (minimum 40 %, minimum ₹30).
7. **Explanation.** Plain-language reasons and caveats are generated from the same numbers, so the UI never shows a score it can't explain.

## Driver side

Incoming requests are scored with the same function from the rider's point of view and shown as "96% compatible".

## Learning the weights (next step)

The weights are hand-set starting points. Once there is a backend, log `(query, candidates shown, factor vector, requested?, accepted?, completed?, rating)` and fit a ranking model. Logistic regression on the factor vector keeps the score explainable, or use gradient-boosted trees with per-factor attributions. Retrain weekly, and only ship weights that improve request-to-completion rate in an A/B test.
