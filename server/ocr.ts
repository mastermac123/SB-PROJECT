import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { env } from './env'
import { one, run } from './db'

/**
 * AI ID-card check: reads the text on an uploaded VIT ID card with OCR (Tesseract, runs on this
 * computer — free, no cloud) and checks whether the student's name and student ID appear on it.
 * The admin sees the result before approving. If OCR can't run, the admin simply checks by eye.
 */

export type IdOcr = { status: 'done' | 'failed'; nameMatch: boolean; idMatch: boolean; nameScore: number; confidence: number; text: string; at: string }

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Share of the name's words found in the card text (handles OCR noise like "PR1YA"). */
export function nameScore(name: string, text: string) {
  const t = norm(text).replace(/1/g, 'I').replace(/0/g, 'O')
  const words = name.toUpperCase().split(/\s+/).map(norm).filter((w) => w.length >= 2)
  if (!words.length) return 0
  return words.filter((w) => t.includes(w.replace(/1/g, 'I').replace(/0/g, 'O'))).length / words.length
}
export const idFound = (studentId: string, text: string) => !!studentId && norm(text).includes(norm(studentId))

let worker: Promise<{ recognize: (img: Buffer) => Promise<{ data: { text: string; confidence: number } }> }> | null = null
async function getWorker() {
  if (!worker) {
    const cachePath = join(dirname(env.databasePath === ':memory:' ? './data/x' : env.databasePath), 'ocr')
    mkdirSync(cachePath, { recursive: true })
    // The English model ships with the app (@tesseract.js-data/eng), so nothing is downloaded.
    const langPath = join(dirname(createRequire(import.meta.url).resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int')
    worker = import('tesseract.js').then(
      ({ createWorker }) =>
        createWorker('eng', 1, {
          langPath,
          cachePath,
          gzip: true,
          logger: () => {},
          // Report problems through the promise instead of crashing the server.
          errorHandler: (e: unknown) => console.error('[ridesync] OCR worker error', String(e)),
        }) as never,
    )
    worker.catch(() => (worker = null))
  }
  return worker
}

/** Runs in the background after upload; stores the result on the user. */
export async function checkIdCard(userId: string, dataUrl: string) {
  const u = one<{ name: string; student_id: string }>(`SELECT name, student_id FROM users WHERE id = ?`, userId)
  if (!u) return
  let result: IdOcr
  try {
    const img = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')
    const { data } = await (await getWorker()).recognize(img)
    const ns = nameScore(u.name, data.text)
    result = { status: 'done', nameMatch: ns >= 0.5, idMatch: idFound(u.student_id, data.text), nameScore: Math.round(ns * 100) / 100, confidence: Math.round(data.confidence), text: data.text.replace(/\s+/g, ' ').trim().slice(0, 300), at: new Date().toISOString() }
  } catch (e) {
    console.error('[ridesync] ID card OCR failed', (e as Error).message)
    result = { status: 'failed', nameMatch: false, idMatch: false, nameScore: 0, confidence: 0, text: '', at: new Date().toISOString() }
  }
  run(`UPDATE users SET id_ocr = ? WHERE id = ? AND id_status = 'pending'`, JSON.stringify(result), userId)
}
