import nodemailer from 'nodemailer'
import { env, smtpConfigured } from './env'

const transport = smtpConfigured()
  ? nodemailer.createTransport({ host: env.smtp.host, port: env.smtp.port, secure: env.smtp.port === 465, auth: { user: env.smtp.user, pass: env.smtp.pass } })
  : null

export async function sendLoginCode(email: string, code: string) {
  if (!transport) {
    // Development without SMTP: print to the server console only.
    console.log(`[ridesync] login code for ${email}: ${code}`)
    return
  }
  await transport.sendMail({
    from: env.smtp.from,
    to: email,
    subject: `${code} is your RideSync login code`,
    text: `Your RideSync login code is ${code}.\n\nIt expires in 10 minutes. If you didn’t try to log in, you can ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;color:#15182E">
      <p style="font-size:15px">Your RideSync login code is</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>
      <p style="font-size:13px;color:#64677E">It expires in 10 minutes. If you didn’t try to log in, you can ignore this email.</p>
    </div>`,
  })
}
