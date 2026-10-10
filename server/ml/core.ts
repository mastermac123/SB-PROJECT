/**
 * Small, dependency-free machine-learning toolkit used by RideSync's models.
 *  • Logistic regression (binary classification) — gradient descent with L2 regularisation
 *  • Ridge regression (numeric prediction) — closed form (normal equations)
 *  • Feature standardisation, time-ordered train/test split, evaluation metrics, feature importance
 * Models are trained on RideSync's own database and saved as plain JSON weights.
 */

export type Row = number[]
export type Scaler = { mean: number[]; std: number[] }

export function fitScaler(X: Row[]): Scaler {
  const d = X[0]?.length ?? 0
  const mean = Array(d).fill(0)
  const std = Array(d).fill(0)
  for (const x of X) for (let j = 0; j < d; j++) mean[j] += x[j] / X.length
  for (const x of X) for (let j = 0; j < d; j++) std[j] += (x[j] - mean[j]) ** 2 / X.length
  return { mean, std: std.map((v) => Math.sqrt(v) || 1) }
}
export const scale = (x: Row, s: Scaler) => x.map((v, j) => (v - s.mean[j]) / s.std[j])

/** Oldest 80% to train, newest 20% to test — evaluates on "future" data like real use. */
export function timeSplit<T>(rows: T[], testShare = 0.2): { train: T[]; test: T[] } {
  const cut = Math.max(1, Math.floor(rows.length * (1 - testShare)))
  return { train: rows.slice(0, cut), test: rows.slice(cut) }
}

/* ---- Logistic regression -------------------------------------------------- */

export type Logistic = { kind: 'logistic'; features: string[]; scaler: Scaler; w: number[]; b: number }
const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))))

export function trainLogistic(features: string[], X: Row[], y: number[], opts: { lr?: number; epochs?: number; l2?: number } = {}): Logistic {
  const { lr = 0.1, epochs = 600, l2 = 0.01 } = opts
  const scaler = fitScaler(X)
  const Z = X.map((x) => scale(x, scaler))
  const d = features.length
  const w = Array(d).fill(0)
  let b = 0
  // Balance the classes so a rare outcome (e.g. no-shows) isn't ignored.
  const pos = y.filter((v) => v === 1).length
  const wPos = pos ? y.length / (2 * pos) : 1
  const wNeg = y.length - pos ? y.length / (2 * (y.length - pos)) : 1
  for (let e = 0; e < epochs; e++) {
    const gw = Array(d).fill(0)
    let gb = 0
    for (let i = 0; i < Z.length; i++) {
      const p = sigmoid(Z[i].reduce((s, v, j) => s + v * w[j], b))
      const err = (p - y[i]) * (y[i] ? wPos : wNeg)
      for (let j = 0; j < d; j++) gw[j] += err * Z[i][j]
      gb += err
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / Z.length + l2 * w[j])
    b -= lr * (gb / Z.length)
  }
  return { kind: 'logistic', features, scaler, w, b }
}
export const predictProba = (m: Logistic, x: Row) => sigmoid(scale(x, m.scaler).reduce((s, v, j) => s + v * m.w[j], m.b))

/* ---- Ridge regression ------------------------------------------------------- */

export type Ridge = { kind: 'ridge'; features: string[]; scaler: Scaler; w: number[]; b: number }

/** Solve (XᵀX + λI) w = Xᵀy on standardised features (Gaussian elimination). */
export function trainRidge(features: string[], X: Row[], y: number[], lambda = 1): Ridge {
  const scaler = fitScaler(X)
  const Z = X.map((x) => scale(x, scaler))
  const d = features.length
  const yMean = y.reduce((a, v) => a + v, 0) / y.length
  const A = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j ? lambda : 0)))
  const c = Array(d).fill(0)
  for (let n = 0; n < Z.length; n++)
    for (let i = 0; i < d; i++) {
      c[i] += Z[n][i] * (y[n] - yMean)
      for (let j = 0; j < d; j++) A[i][j] += Z[n][i] * Z[n][j]
    }
  // Gaussian elimination with partial pivoting.
  for (let i = 0; i < d; i++) {
    let p = i
    for (let r = i + 1; r < d; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r
    ;[A[i], A[p]] = [A[p], A[i]]
    ;[c[i], c[p]] = [c[p], c[i]]
    for (let r = i + 1; r < d; r++) {
      const f = A[r][i] / (A[i][i] || 1e-9)
      for (let k = i; k < d; k++) A[r][k] -= f * A[i][k]
      c[r] -= f * c[i]
    }
  }
  const w = Array(d).fill(0)
  for (let i = d - 1; i >= 0; i--) w[i] = (c[i] - A[i].slice(i + 1).reduce((s, v, k) => s + v * w[i + 1 + k], 0)) / (A[i][i] || 1e-9)
  return { kind: 'ridge', features, scaler, w, b: yMean }
}
export const predictRidge = (m: Ridge, x: Row) => scale(x, m.scaler).reduce((s, v, j) => s + v * m.w[j], m.b)

/* ---- Metrics ---------------------------------------------------------------- */

export function classification(yTrue: number[], p: number[], threshold = 0.5) {
  let tp = 0, fp = 0, tn = 0, fn = 0
  yTrue.forEach((y, i) => {
    const hat = p[i] >= threshold ? 1 : 0
    if (hat && y) tp++
    else if (hat && !y) fp++
    else if (!hat && !y) tn++
    else fn++
  })
  const r = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : null)
  return { accuracy: r(tp + tn, yTrue.length), precision: r(tp, tp + fp), recall: r(tp, tp + fn), auc: auc(yTrue, p) }
}

/** Area under the ROC curve: chance a random positive is scored above a random negative. */
export function auc(yTrue: number[], p: number[]) {
  const pos = p.filter((_, i) => yTrue[i] === 1)
  const neg = p.filter((_, i) => yTrue[i] === 0)
  if (!pos.length || !neg.length) return null
  let wins = 0
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0
  return Math.round((wins / (pos.length * neg.length)) * 1000) / 1000
}

export function regression(yTrue: number[], yHat: number[]) {
  const n = yTrue.length
  if (!n) return { mae: null, rmse: null, r2: null }
  const mean = yTrue.reduce((a, v) => a + v, 0) / n
  const mae = yTrue.reduce((a, v, i) => a + Math.abs(v - yHat[i]), 0) / n
  const sse = yTrue.reduce((a, v, i) => a + (v - yHat[i]) ** 2, 0)
  const sst = yTrue.reduce((a, v) => a + (v - mean) ** 2, 0)
  const round = (v: number) => Math.round(v * 100) / 100
  return { mae: round(mae), rmse: round(Math.sqrt(sse / n)), r2: sst ? round(1 - sse / sst) : null }
}

/** Which features matter most: |standardised weight|, as shares of the total, with direction. */
export function importance(m: Logistic | Ridge) {
  const total = m.w.reduce((a, v) => a + Math.abs(v), 0) || 1
  return m.features
    .map((f, i) => ({ feature: f, weight: Math.round((Math.abs(m.w[i]) / total) * 1000) / 1000, direction: m.w[i] >= 0 ? ('up' as const) : ('down' as const) }))
    .sort((a, b) => b.weight - a.weight)
}
