// LexEikôn — mail relay for the dictionary-projects server.
// 1. https://script.google.com → New project → paste this code.
// 2. Replace the SECRET below by any long phrase of your own (the same phrase goes into Cloudflare as MAIL_SECRET).
// 3. Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone → Deploy, allow access.
// 4. Copy the web app URL (…/exec) into Cloudflare as MAIL_SCRIPT_URL.
const SECRET = 'REPLACE-WITH-YOUR-OWN-LONG-PHRASE';

function doPost(e) {
  let d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'json' }); }
  if (!d.secret || d.secret !== SECRET) return out({ ok: false, error: 'secret' });
  if (!d.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.to)) return out({ ok: false, error: 'to' });
  MailApp.sendEmail({ to: d.to, subject: String(d.subject || 'LexEikôn').slice(0, 200), body: String(d.text || '').slice(0, 10000), name: 'LexEikôn' });
  return out({ ok: true });
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
