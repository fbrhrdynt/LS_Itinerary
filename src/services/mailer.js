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
  await transport.sendMail({from:process.env.SMTP_FROM || process.env.MAIL_FROM,to:email,subject:'Atur ulang password Itinerary',replyTo:'febroherdyanto98@gmail.com',text:`Buka tautan ini untuk mengatur ulang password Anda (berlaku ${ttl} menit, satu kali pakai):\n${link}\n\nAbaikan email ini jika Anda tidak meminta perubahan.`,html:template('Atur ulang password',`Gunakan tautan berikut dalam ${ttl} menit untuk mengatur ulang password. Jika bukan Anda, abaikan email ini.`,'Atur ulang password',link)});
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const template=(heading,description,action,link)=>`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f1f6fd;font-family:Arial,Helvetica,sans-serif;color:#203454"><div style="max-width:560px;margin:40px auto;padding:16px"><div style="font-size:24px;font-weight:800;margin-bottom:24px">Itinerary <span style="color:#4878c9">by Febro Space</span></div><div style="background:#fff;border:2px solid #203454;border-top:8px solid #6791dd;border-radius:18px;padding:32px"><h1 style="font-size:26px;line-height:1.25;margin:0 0 16px">${escapeHtml(heading)}</h1><p style="font-size:16px;line-height:1.7;margin-bottom:28px">${escapeHtml(description)}</p><a href="${escapeHtml(link)}" style="display:inline-block;background:#6791dd;border:2px solid #203454;border-radius:10px;color:#fff;text-decoration:none;font-weight:700;padding:15px 22px">${escapeHtml(action)}</a><p style="font-size:13px;line-height:1.6;color:#64748b;margin-top:28px">Jika tombol tidak berfungsi, salin tautan berikut:<br><a style="word-break:break-all" href="${escapeHtml(link)}">${escapeHtml(link)}</a></p></div><p style="font-size:12px;color:#64748b;margin-top:20px">Email otomatis dari Itinerary by Febro Space. Abaikan jika Anda tidak melakukan permintaan ini.</p></div></body></html>`;
export async function sendActivation(email,token){
 if(!smtpConfigured())throw new Error('SMTP_NOT_CONFIGURED');
 const transport=nodemailer.createTransport(process.env.SMTP_URL||{host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:process.env.SMTP_SECURE==='true',requireTLS:process.env.SMTP_SECURE!=='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:10000,socketTimeout:15000});
 // Fragment is not transmitted in HTTP requests or access logs.
 const link=`${new URL(process.env.APP_URL).origin}/verify-email#${token}`;
 try{await transport.sendMail({from:process.env.SMTP_FROM||process.env.MAIL_FROM,to:email,replyTo:'febroherdyanto98@gmail.com',subject:'Aktivasi akun Itinerary — berlaku 15 menit',text:`Aktifkan akun Itinerary dalam 15 menit: ${link}\nJika bukan Anda, abaikan email ini.`,html:template('Aktifkan akun Anda','Terima kasih sudah mendaftar. Verifikasi email Anda dalam 15 menit agar dapat mulai menggunakan Itinerary.','Aktifkan akun',link)});}
 finally{transport.close();}
}
