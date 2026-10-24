import nodemailer from 'nodemailer';

const BRAND = 'Itinerary';
const REPLY_TO = 'febroherdyanto98@gmail.com';
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

const emailLayout = ({ eyebrow, title, intro, button, link, expires, note }) => {
  const safeLink = escapeHtml(link);
  return `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${escapeHtml(title)} — Itinerary</title></head>
<body style="margin:0;padding:0;background:#eef4fc;color:#1b2d4b;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none!important;max-height:0;overflow:hidden;opacity:0">${escapeHtml(intro)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#eef4fc"><tr><td align="center" style="padding:36px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px">
<tr><td style="padding:0 0 22px 4px">
  <span style="font-size:27px;letter-spacing:-1px;font-weight:800;color:#1b2d4b">Itinerary</span>
  <span style="font-size:13px;font-weight:700;color:#5474aa">&nbsp; by Febro Herdyanto</span>
</td></tr>
<tr><td style="background:#fff;border:1px solid #d6e2f3;border-top:6px solid #618de0;border-radius:16px;padding:36px 30px">
  <p style="margin:0 0 14px;font-size:12px;letter-spacing:1.5px;font-weight:800;color:#426eb5;text-transform:uppercase">${escapeHtml(eyebrow)}</p>
  <h1 style="margin:0 0 20px;font-size:30px;line-height:1.2;letter-spacing:-.8px;color:#1b2d4b">${escapeHtml(title)}</h1>
  <p style="margin:0 0 28px;font-size:16px;line-height:1.75;color:#52637d">${escapeHtml(intro)}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#618de0" style="border-radius:10px;border:2px solid #1b2d4b">
    <a href="${safeLink}" style="display:inline-block;padding:15px 26px;color:#fff;text-decoration:none;font-size:16px;font-weight:700">${escapeHtml(button)} &rarr;</a>
  </td></tr></table>
  <p style="margin:28px 0 0;font-size:14px;line-height:1.65;color:#52637d"><strong>Keamanan akun</strong><br>Tautan ini berlaku selama ${escapeHtml(expires)} dan hanya dapat digunakan satu kali. ${escapeHtml(note)}</p>
  <div style="border-top:1px solid #e4eaf3;margin:26px 0 20px"></div>
  <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#71809a">Tombol tidak berfungsi? Salin tautan berikut ke browser:</p>
  <p style="margin:0;font-size:12px;line-height:1.6;overflow-wrap:anywhere;word-break:break-all"><a href="${safeLink}" style="color:#426eb5;text-decoration:underline">${safeLink}</a></p>
</td></tr>
<tr><td style="padding:23px 4px 8px;font-size:12px;line-height:1.8;color:#72809a">
  Email otomatis dari <strong style="color:#52637d">Itinerary by Febro Herdyanto</strong>.<br>
  Butuh bantuan? Balas email ini untuk menghubungi administrator.<br>
  &copy; ${new Date().getUTCFullYear()} Itinerary.
</td></tr>
</table></td></tr></table></body></html>`;
};

export const smtpConfigured = () => Boolean(
  (process.env.SMTP_URL || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS))
  && (process.env.SMTP_FROM || process.env.MAIL_FROM)
);

function mailTransport() {
  return nodemailer.createTransport(process.env.SMTP_URL || {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: process.env.SMTP_SECURE !== 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
}

async function deliver({ to, subject, text, html }) {
  if (!smtpConfigured()) throw new Error('SMTP_NOT_CONFIGURED');
  const transport = mailTransport();
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.MAIL_FROM,
      to,
      replyTo: REPLY_TO,
      subject,
      text,
      html,
    });
  } finally {
    transport.close();
  }
}

export async function sendActivation(email, token) {
  const link = `${new URL(process.env.APP_URL).origin}/verify-email?token=${encodeURIComponent(token)}`;
  await deliver({
    to: email,
    subject: 'Aktifkan akun Itinerary Anda',
    text: `Selamat datang di Itinerary!\n\nAktifkan akun Anda melalui tautan berikut (berlaku 15 menit, sekali pakai):\n${link}\n\nJika Anda tidak mendaftar, abaikan email ini.\n\nItinerary by Febro Herdyanto`,
    html: emailLayout({
      eyebrow: 'Selamat datang',
      title: 'Aktifkan akun Anda.',
      intro: 'Terima kasih telah mendaftar di Itinerary. Satu langkah lagi untuk mulai merencanakan perjalanan: konfirmasi alamat email Anda.',
      button: 'Aktifkan akun',
      link,
      expires: '15 menit',
      note: 'Jika Anda tidak membuat akun, abaikan email ini.',
    }),
  });
}

export async function sendReset(email, token) {
  const link = `${new URL(process.env.APP_URL).origin}/reset-password#${token}`;
  const ttl = Math.max(5, Math.min(120, Number(process.env.PASSWORD_RESET_TTL_MINUTES) || 30));
  await deliver({
    to: email,
    subject: 'Atur ulang password Itinerary',
    text: `Kami menerima permintaan pengaturan ulang password Itinerary.\n\nBuka tautan berikut (berlaku ${ttl} menit, sekali pakai):\n${link}\n\nJika bukan Anda yang meminta, abaikan email ini.\n\nItinerary by Febro Herdyanto`,
    html: emailLayout({
      eyebrow: 'Keamanan akun',
      title: 'Atur ulang password.',
      intro: 'Kami menerima permintaan untuk mengubah password akun Itinerary Anda. Gunakan tombol di bawah untuk membuat password baru.',
      button: 'Atur ulang password',
      link,
      expires: `${ttl} menit`,
      note: 'Jika Anda tidak meminta pengaturan ulang password, akun Anda tetap aman dan tidak perlu melakukan apa pun.',
    }),
  });
}
