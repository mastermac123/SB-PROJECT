import { describe, expect, it } from 'vitest'

process.env.DATABASE_PATH = ':memory:'

const core = await import('../ml/core')
const { addDemoData, removeDemoData, demoCount, demoLeftovers } = await import('../ml/demo')
const { trainAll, mlReport, predictEta, resetModels } = await import('../ml/models')

describe('ML toolkit', () => {
  it('logistic regression learns a simple rule and reports AUC', () => {
    const X = Array.from({ length: 200 }, (_, i) => [i % 10, (i * 7) % 5])
    const y = X.map(([a]) => (a > 4 ? 1 : 0))
    const m = core.trainLogistic(['a', 'b'], X, y)
    const metrics = core.classification(y, X.map((x) => core.predictProba(m, x)))
    expect(metrics.auc).toBeGreaterThan(0.95)
    expect(core.importance(m)[0].feature).toBe('a')
  })

  it('ridge regression recovers a linear relationship', () => {
    const X = Array.from({ length: 100 }, (_, i) => [i, (i * 3) % 7])
    const y = X.map(([a, b]) => 2 * a + 3 * b + 5)
    const m = core.trainRidge(['a', 'b'], X, y, 0.001)
    expect(core.regression(y, X.map((x) => core.predictRidge(m, x))).mae).toBeLessThan(0.5)
  })
})

describe('RideSync models on demo data', () => {
  it('trains all four models, beats the baselines, and demo data removes cleanly', () => {
    resetModels()
    trainAll()
    expect(mlReport().models.every((m) => m.status === 'waiting')).toBe(true)

    const added = addDemoData()
    expect(added.rides).toBeGreaterThan(200)
    expect(addDemoData().rides).toBe(added.rides) // adding twice doesn't duplicate

    trainAll()
    const byName = Object.fromEntries(mlReport().models.map((m) => [m.name, m]))
    for (const n of ['match', 'risk', 'eta', 'demand']) expect(byName[n].status).toBe('trained')
    // Match: learns who drivers accept (better than guessing).
    expect(byName.match.metrics!.auc).toBeGreaterThan(0.65)
    // Risk: finds flaky riders.
    expect(byName.risk.metrics!.auc).toBeGreaterThan(0.6)
    // ETA: far more accurate than raw TomTom.
    expect(byName.eta.metrics!.maeMin!).toBeLessThan(byName.eta.baseline!.tomtomMaeMin!)
    expect(byName.eta.importance!.length).toBe(8)
    expect(mlReport().forecast!.hours).toHaveLength(24)
    expect(predictEta({ km: 15, tomtom: 25, ola: 40, mappls: null })).toBeGreaterThan(25)

    const removed = removeDemoData()
    expect(removed.rides).toBe(added.rides)
    expect(demoLeftovers()).toHaveLength(0)
    expect(demoCount()).toEqual({ users: 0, rides: 0, bookings: 0 })
    resetModels()
    trainAll()
    expect(mlReport().models.every((m) => m.status === 'waiting')).toBe(true)
  })
})
