import nodemailer from 'nodemailer';
export const smtpConfigured = () => Boolean((process.env.SMTP_URL || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)) && (process.env.SMTP_FROM || process.env.MAIL_FROM));
export async function sendReset(email, token) {
  if (!smtpConfigured()) throw new Error('SMTP_NOT_CONFIGURED');
  const transport = nodemailer.createTransport(process.env.SMTP_URL || {
    host:process.env.SMTP_HOST, port:Number(process.env.SMTP_PORT || 587),
    secure:process.env.SMTP_SECURE === 'true', requireTLS:process.env.SMTP_SECURE !== 'true',
    ...(process.env.SMTP_USER ? {auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}} : {}),
    connectionTimeout:10000, socketTimeout:15000,
  });
  // Fragment is never sent to HTTP servers or proxy access logs.
  const link = `${new URL(process.env.APP_URL).origin}/reset-password#${token}`;
  const ttl = Math.max(5,Math.min(120,Number(process.env.PASSWORD_RESET_TTL_MINUTES)||30));
  await transport.sendMail({from:process.env.SMTP_FROM || process.env.MAIL_FROM,to:email,subject:'Atur ulang password Itinerary',replyTo:'febroherdyanto98@gmail.com',text:`Buka tautan ini untuk mengatur ulang password Anda (berlaku ${ttl} menit, satu kali pakai):\n${link}\n\nAbaikan email ini jika Anda tidak meminta perubahan.`});
}
