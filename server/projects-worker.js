// LexEikôn — dictionary projects (accounts, projects, cards, publishing to GitHub).
// Bindings: D1 database as DB.
// Secrets (Settings → Variables and Secrets): GITHUB_TOKEN (fine-grained, Contents: read & write on kimserge/lexeikon),
//   RESEND_API_KEY (optional, for e-mail), MAIL_FROM (e.g. "LexEikôn <noreply@your-domain>"), ADMIN_EMAIL.
const ORIGINS = new Set(['https://kimserge.github.io']);
const REPO = 'kimserge/lexeikon', BRANCH = 'contrib';
let ready = false;

async function init(db) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, nick TEXT UNIQUE NOT NULL, email TEXT NOT NULL,
      salt TEXT NOT NULL, hash TEXT NOT NULL, lang TEXT, created TEXT NOT NULL)`),
    db.prepare('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created TEXT NOT NULL)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL,
      tl TEXT NOT NULL DEFAULT 'de', note TEXT, created TEXT NOT NULL, updated TEXT NOT NULL, pushed TEXT, UNIQUE(user_id, slug))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, data TEXT NOT NULL,
      created TEXT NOT NULL, updated TEXT NOT NULL)`),
  ]);
  ready = true;
}
const now = () => new Date().toISOString();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const rand = (n) => b64(crypto.getRandomValues(new Uint8Array(n))).replace(/[+/=]/g, '').slice(0, n);
async function pbkdf2(pass, salt) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, k, 256));
}
const slugify = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'dict';
const clean = (s, n = 2000) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n);
function cardData(d) {
  const ar = (Array.isArray(d.ar) ? d.ar : []).slice(0, 3).map((a) => ({ f: clean(a.f, 200), r: clean(a.r, 50), t: clean(a.t, 500) }))
    .filter((a) => a.f || a.r || a.t);
  return { gf: clean(d.gf, 200), gl: clean(d.gl, 200), ar, ref: clean(d.ref, 2000) };
}
// Dictionary file in LexEikôn format: Greek entries and Arabic entries cross-referencing each other
function toDict(user, p, cards) {
  const E = [];
  for (const c of cards) {
    const d = JSON.parse(c.data);
    if (d.gf) {
      const lines = [];
      if (d.gl && d.gl !== d.gf) lines.push('→ ' + d.gl);
      for (const a of d.ar) lines.push([a.f, a.r ? '(\u0002' + 'rad.' + '\u0003 ' + a.r + ')' : '', a.t ? '— ' + a.t : ''].filter(Boolean).join(' '));
      if (d.ref) lines.push('\u000b' + d.ref + '\u000c');
      E.push([d.gf, lines.join('\n'), 'grc']);
    }
    for (const a of d.ar) if (a.f) {
      const lines = [[d.gf, d.gl && d.gl !== d.gf ? '(→ ' + d.gl + ')' : ''].filter(Boolean).join(' ')];
      if (a.r) lines.push('\u0002rad.\u0003 ' + a.r);
      if (a.t) lines.push(a.t);
      if (d.ref) lines.push('\u000b' + d.ref + '\u000c');
      E.push([a.f, lines.join('\n'), 'ar']);
    }
  }
  return { id: 'u-' + user.nick + '-' + p.slug, name: p.name, author: user.nick, tl: p.tl, note: p.note || '', updated: p.updated, lang: 'grc',
    entries: E, cards: cards.map((c) => JSON.parse(c.data)) };
}
async function gh(env, path, opt = {}) {
  const r = await fetch('https://api.github.com/repos/' + REPO + path, { ...opt, headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN,
    Accept: 'application/vnd.github+json', 'User-Agent': 'lexeikon-projects', 'Content-Type': 'application/json' } });
  return r;
}
async function pushFile(env, path, text, msg) {
  let br = await gh(env, '/git/ref/heads/' + BRANCH);
  if (br.status === 404) {
    const main = await (await gh(env, '/git/ref/heads/main')).json();
    br = await gh(env, '/git/refs', { method: 'POST', body: JSON.stringify({ ref: 'refs/heads/' + BRANCH, sha: main.object.sha }) });
    if (!br.ok) throw new Error('branch');
  }
  const cur = await gh(env, '/contents/' + encodeURI(path) + '?ref=' + BRANCH);
  const sha = cur.ok ? (await cur.json()).sha : undefined;
  const bytes = new TextEncoder().encode(text);let bin = '';for (const b of bytes) bin += String.fromCharCode(b);
  const r = await gh(env, '/contents/' + encodeURI(path), { method: 'PUT', body: JSON.stringify({ message: msg, content: btoa(bin), branch: BRANCH, sha }) });
  if (!r.ok) throw new Error('push ' + r.status);
  return (await r.json()).content.html_url;
}
async function mail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !to) return false;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }) });
  return r.ok;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin'), allowed = origin !== null && ORIGINS.has(origin);
    const headers = { 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin', 'Cache-Control': 'no-store' };
    if (allowed) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' });
    const reply = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers });
    if (!allowed) return reply({ error: 'forbidden' }, 403);
    if (request.method === 'OPTIONS') return reply(null, 204);
    const db = env.DB, url = new URL(request.url), P = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    const body = async () => { try { return await request.json(); } catch { return {}; } };
    try {
      await init(db);
      // ---- accounts ----
      if (request.method === 'POST' && P[0] === 'register') {
        const b = await body(), nick = clean(b.nick, 24).toLowerCase(), email = clean(b.email, 200), pass = String(b.password || '');
        if (!/^[a-z0-9][a-z0-9_-]{2,23}$/.test(nick)) return reply({ error: 'nick' }, 400);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply({ error: 'email' }, 400);
        if (pass.length < 8) return reply({ error: 'password' }, 400);
        if (await db.prepare('SELECT 1 FROM users WHERE nick=?1').bind(nick).first()) return reply({ error: 'taken' }, 409);
        const salt = rand(16), hash = await pbkdf2(pass, salt);
        const u = await db.prepare('INSERT INTO users (nick,email,salt,hash,lang,created) VALUES (?1,?2,?3,?4,?5,?6) RETURNING id')
          .bind(nick, email, salt, hash, clean(b.lang, 5), now()).first();
        const token = rand(40); await db.prepare('INSERT INTO sessions VALUES (?1,?2,?3)').bind(token, u.id, now()).run();
        await mail(env, env.ADMIN_EMAIL, 'LexEikôn: new contributor ' + nick, nick + ' <' + email + '> registered.');
        return reply({ token, nick, email });
      }
      if (request.method === 'POST' && P[0] === 'login') {
        const b = await body(), nick = clean(b.nick, 200).toLowerCase();
        const u = await db.prepare('SELECT * FROM users WHERE nick=?1 OR lower(email)=?1').bind(nick).first();
        if (!u || (await pbkdf2(String(b.password || ''), u.salt)) !== u.hash) return reply({ error: 'login' }, 401);
        const token = rand(40); await db.prepare('INSERT INTO sessions VALUES (?1,?2,?3)').bind(token, u.id, now()).run();
        return reply({ token, nick: u.nick, email: u.email });
      }
      const tok = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/, '');
      const user = tok ? await db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?1').bind(tok).first() : null;
      if (!user) return reply({ error: 'auth' }, 401);
      if (request.method === 'POST' && P[0] === 'logout') { await db.prepare('DELETE FROM sessions WHERE token=?1').bind(tok).run(); return reply({ ok: true }); }
      if (request.method === 'GET' && P[0] === 'me') return reply({ nick: user.nick, email: user.email });
      // ---- projects ----
      const own = async (id) => db.prepare('SELECT * FROM projects WHERE id=?1 AND user_id=?2').bind(id, user.id).first();
      if (P[0] === 'projects' && P.length === 1) {
        if (request.method === 'GET') {
          const r = await db.prepare(`SELECT p.*, (SELECT count(*) FROM cards c WHERE c.project_id=p.id) n FROM projects p WHERE user_id=?1 ORDER BY updated DESC`).bind(user.id).all();
          return reply(r.results);
        }
        if (request.method === 'POST') {
          const b = await body(), name = clean(b.name, 120); if (!name) return reply({ error: 'name' }, 400);
          let slug = slugify(name), k = 1; while (await db.prepare('SELECT 1 FROM projects WHERE user_id=?1 AND slug=?2').bind(user.id, slug).first()) slug = slugify(name) + '-' + (++k);
          const t = now(), p = await db.prepare('INSERT INTO projects (user_id,name,slug,tl,note,created,updated) VALUES (?1,?2,?3,?4,?5,?6,?6) RETURNING *')
            .bind(user.id, name, slug, clean(b.tl, 5) || 'de', clean(b.note, 1000), t).first();
          return reply(p);
        }
      }
      if (P[0] === 'projects' && P[1]) {
        const p = await own(+P[1]); if (!p) return reply({ error: 'not found' }, 404);
        if (P.length === 2 && request.method === 'PUT') { const b = await body();
          await db.prepare('UPDATE projects SET name=?1, tl=?2, note=?3, updated=?4 WHERE id=?5').bind(clean(b.name, 120) || p.name, clean(b.tl, 5) || p.tl, clean(b.note, 1000), now(), p.id).run();
          return reply(await own(p.id)); }
        if (P.length === 2 && request.method === 'DELETE') { await db.batch([db.prepare('DELETE FROM cards WHERE project_id=?1').bind(p.id), db.prepare('DELETE FROM projects WHERE id=?1').bind(p.id)]); return reply({ ok: true }); }
        if (P[2] === 'cards' && request.method === 'GET') return reply((await db.prepare('SELECT * FROM cards WHERE project_id=?1 ORDER BY id').bind(p.id).all()).results.map((c) => ({ ...c, data: JSON.parse(c.data) })));
        if (P[2] === 'cards' && request.method === 'POST') { const t = now(), d = JSON.stringify(cardData(await body()));
          const c = await db.prepare('INSERT INTO cards (project_id,data,created,updated) VALUES (?1,?2,?3,?3) RETURNING *').bind(p.id, d, t).first();
          await db.prepare('UPDATE projects SET updated=?1 WHERE id=?2').bind(t, p.id).run(); return reply({ ...c, data: JSON.parse(c.data) }); }
        if (P[2] === 'cards' && P[3]) { const c = await db.prepare('SELECT * FROM cards WHERE id=?1 AND project_id=?2').bind(+P[3], p.id).first(); if (!c) return reply({ error: 'not found' }, 404);
          const t = now();
          if (request.method === 'PUT') { const d = JSON.stringify(cardData(await body()));
            await db.batch([db.prepare('UPDATE cards SET data=?1, updated=?2 WHERE id=?3').bind(d, t, c.id), db.prepare('UPDATE projects SET updated=?1 WHERE id=?2').bind(t, p.id)]);
            return reply({ ...c, data: JSON.parse(d), updated: t }); }
          if (request.method === 'DELETE') { await db.batch([db.prepare('DELETE FROM cards WHERE id=?1').bind(c.id), db.prepare('UPDATE projects SET updated=?1 WHERE id=?2').bind(t, p.id)]); return reply({ ok: true }); } }
        if (P[2] === 'publish' && request.method === 'POST') {
          const cards = (await db.prepare('SELECT * FROM cards WHERE project_id=?1 ORDER BY id').bind(p.id).all()).results;
          const file = 'contrib/' + user.nick + '/' + p.slug + '.json', t = now();
          const link = await pushFile(env, file, JSON.stringify(toDict(user, { ...p, updated: t }, cards), null, 1) + '\n', `contrib: ${user.nick}/${p.slug} (${cards.length} cards)`);
          await db.prepare('UPDATE projects SET pushed=?1 WHERE id=?2').bind(t, p.id).run();
          const txt = `«${p.name}» (${cards.length}) → ${link}`;
          const sent = await mail(env, user.email, 'LexEikôn: ' + p.name, 'Your dictionary update has been placed for review.\n' + txt);
          await mail(env, env.ADMIN_EMAIL, 'LexEikôn update: ' + user.nick + '/' + p.slug, txt);
          return reply({ ok: true, link, pushed: t, mailed: sent });
        }
      }
      // all own dictionaries (for the main app)
      if (request.method === 'GET' && P[0] === 'dicts') {
        const ps = (await db.prepare('SELECT * FROM projects WHERE user_id=?1').bind(user.id).all()).results, out = [];
        for (const p of ps) out.push(toDict(user, p, (await db.prepare('SELECT * FROM cards WHERE project_id=?1 ORDER BY id').bind(p.id).all()).results));
        return reply(out);
      }
      return reply({ error: 'not found' }, 404);
    } catch (e) {
      return reply({ error: 'unavailable', detail: String(e && e.message || e).slice(0, 200) }, 503);
    }
  },
};
