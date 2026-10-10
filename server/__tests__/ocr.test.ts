import { describe, expect, it } from 'vitest'

process.env.DATABASE_PATH = ':memory:'
const { nameScore, idFound } = await import('../ocr')

describe('ID card OCR matching', () => {
  it('finds the student’s name and ID in noisy OCR text', () => {
    const text = 'VIDYALANKAR INSTITUTE OF TECHNOLOGY\\nName: PR1YA NAIR\\nStudent ID: VU1F2122045\\nB.Tech Computer'
    expect(nameScore('Priya Nair', text)).toBe(1)
    expect(idFound('VU1F/2122-045', text)).toBe(true)
    expect(nameScore('Rohan Desai', text)).toBe(0)
    expect(idFound('VU1F2122999', text)).toBe(false)
  })
})
