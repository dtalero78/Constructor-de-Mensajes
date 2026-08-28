// ============================================================
// Envío de correo por Resend. Hoy solo lo usa la recuperación de
// contraseña, pero el sobre (remitente, marca) vive aquí para que
// cualquier correo futuro salga igual.
// ============================================================

const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const DE = process.env.MAIL_FROM || 'LivingRoom Speakers <hola@send.lvr-speakers.com>';

if (!resend) console.warn('⚠️  Falta RESEND_API_KEY: no se pueden enviar correos.');

const esc = (t = '') => String(t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plantilla sobria, en el verde de la marca, legible sin imágenes. */
function plantilla({ titulo, parrafos, boton }) {
  return `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#EFE8E0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFE8E0;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="max-width:520px;background:#fff;border-radius:24px;padding:36px 32px;
               font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#15181D;">
        <tr><td style="font-size:15px;font-weight:800;color:#0F8A3C;padding-bottom:20px;">LivingRoom Speakers</td></tr>
        <tr><td style="font-size:24px;font-weight:800;letter-spacing:-.02em;padding-bottom:14px;">${esc(titulo)}</td></tr>
        ${parrafos.map(p => `<tr><td style="font-size:15px;line-height:1.6;color:#4B5159;padding-bottom:14px;">${p}</td></tr>`).join('')}
        ${boton ? `<tr><td style="padding:10px 0 22px;">
          <a href="${esc(boton.url)}" style="display:inline-block;background:#22B24C;color:#fff;
             text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;">
            ${esc(boton.texto)}</a></td></tr>` : ''}
        <tr><td style="font-size:12.5px;line-height:1.6;color:#8E949D;border-top:1px solid #ECE7E1;padding-top:18px;">
          Si no pediste esto, ignora el correo: tu contraseña no cambia hasta que abras el enlace.</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

async function enviarRecuperacion(para, enlace) {
  if (!resend) throw new Error('El envío de correo no está configurado');
  const { data, error } = await resend.emails.send({
    from: DE,
    to: [para],
    subject: 'Recupera tu contraseña · LivingRoom Speakers',
    html: plantilla({
      titulo: 'Recupera tu contraseña',
      parrafos: [
        'Pediste volver a entrar a tu cuenta. Abre el botón y elige una contraseña nueva.',
        'El enlace <strong>vence en una hora</strong> y sirve una sola vez.'
      ],
      boton: { texto: 'Elegir contraseña nueva', url: enlace }
    }),
    text: `Recupera tu contraseña en LivingRoom Speakers.\n\n${enlace}\n\n` +
          `El enlace vence en una hora y sirve una sola vez.\n` +
          `Si no pediste esto, ignora el correo.`
  });
  if (error) throw new Error(error.message || 'Resend rechazó el envío');
  return data;
}

module.exports = { enviarRecuperacion, hayCorreo: () => Boolean(resend) };
