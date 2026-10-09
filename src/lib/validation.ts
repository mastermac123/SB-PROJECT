/** VIT student email: name.surnameYYYY@vitstudent.ac.in (Vellore, Chennai, AP, Bhopal). */
export const VIT_EMAIL_DOMAIN = 'vitstudent.ac.in'

export function validateVitEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  if (!email) return 'Enter your VIT email'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address'
  if (!email.endsWith(`@${VIT_EMAIL_DOMAIN}`)) return `Use your VIT student email ending in @${VIT_EMAIL_DOMAIN}`
  if (!/^[a-z0-9._-]+@/.test(email)) return 'Email can only contain letters, numbers, dots and hyphens'
  return null
}

/** VIT register number, e.g. 22BCE1234 — 2-digit year, 3-letter programme, 4 digits. */
export function validateStudentId(raw: string): string | null {
  const id = raw.trim().toUpperCase()
  if (!id) return 'Enter your register number'
  if (!/^\d{2}[A-Z]{3}\d{4}$/.test(id)) return 'Register numbers look like 22BCE1234'
  const year = Number(id.slice(0, 2))
  const now = new Date().getFullYear() % 100
  if (year > now || year < now - 6) return 'This register number isn’t from a current batch'
  return null
}

export function validatePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
  if (!digits) return 'Enter your mobile number'
  if (!/^[6-9]\d{9}$/.test(digits)) return 'Enter a valid 10-digit Indian mobile number'
  return null
}

export function validatePassword(pw: string): string | null {
  if (!pw) return 'Create a password'
  if (pw.length < 8) return 'Use at least 8 characters'
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Include at least one letter and one number'
  return null
}

export function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw)) s++
  if (pw.length >= 12 || /[^A-Za-z0-9]/.test(pw)) s++
  return s as 0 | 1 | 2 | 3
}

export function validateName(raw: string): string | null {
  const n = raw.trim()
  if (!n) return 'Enter your full name'
  if (n.length < 3 || !/\s/.test(n)) return 'Enter your first and last name'
  return null
}

export function validateUpiId(raw: string): string | null {
  if (!raw.trim()) return 'Enter your UPI ID'
  if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(raw.trim())) return 'UPI IDs look like name@bank'
  return null
}

export function luhn(num: string): boolean {
  const d = num.replace(/\D/g, '')
  if (d.length < 13 || d.length > 19) return false
  let sum = 0
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}

export function validatePlate(raw: string): string | null {
  const p = raw.replace(/\s+/g, '').toUpperCase()
  if (!p) return 'Enter your registration number'
  if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/.test(p) && !/^\d{2}BH\d{4}[A-Z]{1,2}$/.test(p)) return 'Use the format TN 14 AB 1234'
  return null
}

export function formatPlate(raw: string) {
  const p = raw.replace(/\s+/g, '').toUpperCase()
  const m = p.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/)
  return m ? [m[1], m[2], m[3], m[4]].filter(Boolean).join(' ') : raw.toUpperCase()
}
