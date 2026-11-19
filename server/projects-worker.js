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
  for (const q of ['ALTER TABLE users ADD COLUMN sig TEXT', 'ALTER TABLE projects ADD COLUMN la TEXT', 'ALTER TABLE projects ADD COLUMN lb TEXT', 'ALTER TABLE projects ADD COLUMN sig TEXT'])
    try { await db.prepare(q).run(); } catch (e) { /* column exists */ }
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
const LANGS = ['syr', 'gez', 'ka', 'grc', 'la', 'hy', 'ar', 'cop'];
const side = (x) => ({ f: clean(x && x.f, 200), l: clean(x && x.l, 200), s: clean(x && x.s, 500), t: clean(x && x.t, 500) });
// card: {a:{f,l,s,t}, b:[{f,l,s,t}] (≤3)}; older cards {gf,gl,ar:[{f,r,t}],ref} are converted
function cardData(d) {
  if (d && !d.a && (d.gf || d.ar)) d = { a: { f: d.gf, l: d.gl, s: d.ref, t: '' }, b: (d.ar || []).map((x) => ({ f: x.f, l: x.r, s: '', t: x.t })) };
  return { a: side(d && d.a), b: (Array.isArray(d && d.b) ? d.b : []).slice(0, 3).map(side).filter((x) => x.f || x.l || x.s || x.t) };
}
// Dictionary file in LexEikôn format. Each side gets its own entry:
//   form
//   (→ lemma), source: translation          (lemma is a link … opening its own language; source grey \x0b…\x0c)
//   = other form (→ other lemma), source: translation
const XR = (w) => '\u2068\uE020' + w + '\uE021\u2069', ISO = (w) => '\u2068' + w + '\u2069';
function tail(x) {
  const g = x.s ? '\u000b' + x.s + '\u000c' : '';
  return g && x.t ? g + ': ' + x.t : g || x.t;
}
function ownLine(x) { const l = x.l && x.l !== x.f ? '(→ ' + XR(x.l) + ')' : '', t = tail(x); return [l, t].filter(Boolean).join(l && t ? ', ' : ''); }
function otherLine(x) { const l = x.l && x.l !== x.f ? ' (→ ' + XR(x.l) + ')' : '', t = tail(x); return '= ' + ISO(x.f) + l + (t ? ', ' + t : ''); }
function toDict(user, p, cards) {
  const E = [], la = p.la || 'grc', lb = p.lb || 'ar';
  for (const c of cards) {
    const d = cardData(JSON.parse(c.data));
    if (d.a.f) E.push([d.a.f, [ownLine(d.a), ...d.b.filter((x) => x.f).map(otherLine)].filter(Boolean).join('\n'), la]);
    for (const x of d.b) if (x.f) E.push([x.f, [ownLine(x), d.a.f ? otherLine(d.a) : ''].filter(Boolean).join('\n'), lb]);
  }
  return { id: 'u-' + user.nick + '-' + p.slug, name: p.name, sig: p.sig || '', author: user.sig || user.nick, la, lb, tl: p.tl, note: p.note || '', updated: p.updated, lang: la,
    entries: E, cards: cards.map((c) => cardData(JSON.parse(c.data))) };
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
        const b = await body(), nick = clean(b.nick, 24).toLowerCase(), email = clean(b.email, 200), pass = String(b.password || ''), sig = clean(b.sig, 80);
        if (!/^[a-z0-9][a-z0-9_-]{2,23}$/.test(nick)) return reply({ error: 'nick' }, 400);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply({ error: 'email' }, 400);
        if (pass.length < 8) return reply({ error: 'password' }, 400);
        if (await db.prepare('SELECT 1 FROM users WHERE nick=?1').bind(nick).first()) return reply({ error: 'taken' }, 409);
        const salt = rand(16), hash = await pbkdf2(pass, salt);
        const u = await db.prepare('INSERT INTO users (nick,email,salt,hash,lang,created,sig) VALUES (?1,?2,?3,?4,?5,?6,?7) RETURNING id')
          .bind(nick, email, salt, hash, clean(b.lang, 5), now(), sig).first();
        const token = rand(40); await db.prepare('INSERT INTO sessions VALUES (?1,?2,?3)').bind(token, u.id, now()).run();
        await mail(env, env.ADMIN_EMAIL, 'LexEikôn: new contributor ' + nick, nick + ' <' + email + '> registered.');
        return reply({ token, nick, email, sig });
      }
      if (request.method === 'POST' && P[0] === 'login') {
        const b = await body(), nick = clean(b.nick, 200).toLowerCase();
        const u = await db.prepare('SELECT * FROM users WHERE nick=?1 OR lower(email)=?1').bind(nick).first();
        if (!u || (await pbkdf2(String(b.password || ''), u.salt)) !== u.hash) return reply({ error: 'login' }, 401);
        const token = rand(40); await db.prepare('INSERT INTO sessions VALUES (?1,?2,?3)').bind(token, u.id, now()).run();
        return reply({ token, nick: u.nick, email: u.email, sig: u.sig || '' });
      }
      const tok = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/, '');
      const user = tok ? await db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?1').bind(tok).first() : null;
      if (!user) return reply({ error: 'auth' }, 401);
      if (request.method === 'POST' && P[0] === 'logout') { await db.prepare('DELETE FROM sessions WHERE token=?1').bind(tok).run(); return reply({ ok: true }); }
      if (request.method === 'GET' && P[0] === 'me') return reply({ nick: user.nick, email: user.email, sig: user.sig || '' });
      if (request.method === 'PUT' && P[0] === 'me') { const b = await body(), sig = clean(b.sig, 80);
        await db.prepare('UPDATE users SET sig=?1 WHERE id=?2').bind(sig, user.id).run(); return reply({ nick: user.nick, email: user.email, sig }); }
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
          const t = now(), lg = (x, d) => (LANGS.includes(x) ? x : d), p = await db.prepare('INSERT INTO projects (user_id,name,slug,tl,note,created,updated,la,lb,sig) VALUES (?1,?2,?3,?4,?5,?6,?6,?7,?8,?9) RETURNING *')
            .bind(user.id, name, slug, clean(b.tl, 5) || 'de', clean(b.note, 1000), t, lg(b.la, 'grc'), lg(b.lb, 'ar'), clean(b.sig, 16)).first();
          return reply(p);
        }
      }
      if (P[0] === 'projects' && P[1]) {
        const p = await own(+P[1]); if (!p) return reply({ error: 'not found' }, 404);
        if (P.length === 2 && request.method === 'PUT') { const b = await body();
          const lg = (x, d) => (LANGS.includes(x) ? x : d);
          await db.prepare('UPDATE projects SET name=?1, tl=?2, note=?3, updated=?4, la=?5, lb=?6, sig=?7 WHERE id=?8').bind(clean(b.name, 120) || p.name, clean(b.tl, 5) || p.tl, clean(b.note, 1000), now(), lg(b.la, p.la || 'grc'), lg(b.lb, p.lb || 'ar'), clean(b.sig, 16) || p.sig || '', p.id).run();
          return reply(await own(p.id)); }
        if (P.length === 2 && request.method === 'DELETE') { await db.batch([db.prepare('DELETE FROM cards WHERE project_id=?1').bind(p.id), db.prepare('DELETE FROM projects WHERE id=?1').bind(p.id)]); return reply({ ok: true }); }
        if (P[2] === 'cards' && request.method === 'GET') return reply((await db.prepare('SELECT * FROM cards WHERE project_id=?1 ORDER BY id').bind(p.id).all()).results.map((c) => ({ ...c, data: cardData(JSON.parse(c.data)) })));
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
