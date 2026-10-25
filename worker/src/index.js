// Tea Rex Woodworks: the whole site on one Cloudflare Worker.
//
// Static files in ../site are served by the assets binding. The quote form posts to /api/submit.
// Every submission is written to D1 first, then emailed. If the email fails, the row stays
// "pending" and the hourly cron retries it; nothing is lost either way, and /api/admin lists
// everything. Routes (the same paths without /api/ still work, for the Bluehost-hosted copy):
//   POST /api/submit            the form posts here (fetch from site.js, or a plain POST without JS)
//   GET  /api/admin             list of submissions, Basic auth (ADMIN_USER / ADMIN_PASS)
//   GET  /api/admin.csv         same as CSV
//   POST /api/admin/resend/:id  retry the email for one submission
//   GET  /api/health            JSON status, no auth
//   *                           static site

import { EmailMessage } from 'cloudflare:email';

const RATE_WINDOW_MIN = 10;  // a single IP may send
const RATE_LIMIT = 5;        // this many in that window
const MAX_EMAIL_ATTEMPTS = 24;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // http -> https, and www (or any alias) -> the canonical host.
    if (url.protocol === 'http:' || (env.CANONICAL_HOST && url.hostname !== env.CANONICAL_HOST && url.hostname.endsWith('.' + env.CANONICAL_HOST))) {
      url.protocol = 'https:';
      if (env.CANONICAL_HOST && url.hostname.endsWith('.' + env.CANONICAL_HOST)) url.hostname = env.CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }

    // Accept /api/x and the pre-migration bare /x for the backend routes.
    let path = url.pathname.startsWith('/api/') ? url.pathname.slice(4) : url.pathname;
    const isApi = url.pathname.startsWith('/api/') || /^\/(submit|admin|admin\.csv|admin\/.*|health)$/.test(path);

    if (!isApi) {
      if (!env.ASSETS) return Response.redirect(env.SITE_URL + '/', 302);
      return env.ASSETS.fetch(request);
    }

    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (path === '/submit' && request.method === 'POST') return await submit(request, env, cors);
      if (path === '/submit') return Response.redirect(env.SITE_URL + '/#quote-form', 303);
      if (path === '/health') return await health(env, cors);
      if (path === '/admin' || path === '/admin.csv' || path.startsWith('/admin/')) {
        return await admin(request, env, url, path);
      }
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error('unhandled', err && err.stack || err);
      return new Response('Something went wrong on our side.', { status: 500, headers: cors });
    }
  },

  // Hourly: retry emails that never went out (Resend down, key not yet set, ...).
  async scheduled(event, env, ctx) {
    const { results } = await env.DB.prepare(
      `SELECT * FROM submissions
        WHERE status = 'new' AND email_status != 'sent' AND email_attempts < ?
          AND created_at > datetime('now', '-14 days')
        ORDER BY id ASC LIMIT 50`
    ).bind(MAX_EMAIL_ATTEMPTS).all();
    for (const row of results) {
      await sendEmail(env, row);
    }
  },
};

// ---------- submit ----------

async function submit(request, env, cors) {
  const wantsJson = (request.headers.get('Accept') || '').includes('application/json');
  const data = await readBody(request);
  const f = (k, max) => oneLine(String(data[k] ?? '')).slice(0, max);

  const row = {
    created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    name: f('name', 120),
    email: f('email', 200),
    phone: f('phone', 60),
    kind: f('kind', 60),
    details: String(data.details ?? '').trim().slice(0, 4000),
    ip: request.headers.get('CF-Connecting-IP') || '',
    user_agent: (request.headers.get('User-Agent') || '').slice(0, 300),
    origin: request.headers.get('Origin') || request.headers.get('Referer') || '',
    status: 'new',
    spam_reason: '',
  };

  // Spam signals. Stored and flagged, never emailed, but recoverable from /admin.
  if (String(data._honey ?? '') !== '') {
    row.status = 'spam'; row.spam_reason = 'honeypot filled';
  } else {
    const stamp = Number(data._t || 0);
    if (stamp > 0 && Date.now() - stamp < 3000) { row.status = 'spam'; row.spam_reason = 'submitted under 3s'; }
  }

  // Validation. These come back to the page as a message under the form.
  let why = '';
  if (row.name === '') why = 'name';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(row.email)) why = 'email';
  else if (row.details.length < 8) why = 'details';
  if (why) return reply(env, cors, wantsJson, false, why, 400);

  // Turnstile, when configured. A missing or bad token is rejected before anything is stored.
  if (env.TURNSTILE_SECRET) {
    const token = String(data['cf-turnstile-response'] ?? '');
    if (!token || !(await turnstileOk(env, token, row.ip))) {
      return reply(env, cors, wantsJson, false, 'verify', 403);
    }
  }

  // Rate limit per IP.
  if (row.ip) {
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM submissions WHERE ip = ? AND created_at > datetime('now', ?)`
    ).bind(row.ip, `-${RATE_WINDOW_MIN} minutes`).first('n');
    if (recent >= RATE_LIMIT) return reply(env, cors, wantsJson, false, 'busy', 429);
  }

  // Store first. From here on the request cannot be lost.
  const ins = await env.DB.prepare(
    `INSERT INTO submissions (created_at, name, email, phone, kind, details, ip, user_agent, origin, status, spam_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(row.created_at, row.name, row.email, row.phone, row.kind, row.details,
         row.ip, row.user_agent, row.origin, row.status, row.spam_reason).run();
  row.id = ins.meta.last_row_id;

  if (row.status === 'new') await sendEmail(env, row);  // failure is recorded, cron retries

  return reply(env, cors, wantsJson, true, '', 200, row.id);
}

async function readBody(request) {
  const type = request.headers.get('Content-Type') || '';
  if (type.includes('application/json')) {
    const j = await request.json().catch(() => ({}));
    return (j && typeof j === 'object') ? j : {};
  }
  const fd = await request.formData().catch(() => null);
  const out = {};
  if (fd) for (const [k, v] of fd.entries()) out[k] = typeof v === 'string' ? v : '';
  return out;
}

async function turnstileOk(env, token, ip) {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const j = await res.json();
    return Boolean(j.success);
  } catch (e) {
    console.warn('turnstile verify failed', e.message);
    return false;
  }
}

function oneLine(s) { return s.replace(/[\r\n]+/g, ' ').trim(); }

function reply(env, cors, wantsJson, ok, why, httpStatus, id) {
  if (wantsJson) {
    return new Response(JSON.stringify(ok ? { ok: true, id } : { ok: false, why }), {
      status: httpStatus,
      headers: { ...cors, 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' },
    });
  }
  // No-JS fallback: back to the page, which reads ?sent= and ?why= as before.
  const q = ok ? 'sent=1' : 'sent=0&why=' + encodeURIComponent(why);
  return Response.redirect(`${env.SITE_URL}/?${q}#quote-form`, 303);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const h = { 'Vary': 'Origin' };
  if (allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Accept, Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

// ---------- email ----------

function whenLocal(iso) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(iso.replace(' ', 'T') + 'Z'));
}

function emailText(env, row) {
  return [
    'New quote request from tearexwoodworks.com',
    '',
    `Name:     ${row.name}`,
    `Email:    ${row.email}`,
    `Phone:    ${row.phone || '(not given)'}`,
    `Piece:    ${row.kind}`,
    '',
    'Details:',
    row.details,
    '',
    '--',
    `Received ${whenLocal(row.created_at)} (#${row.id})`,
    'Reply to this email to answer them directly.',
  ].join('\n');
}

function emailSubject(env, row) { return `${env.MAIL_SUBJECT} from ${row.name} (#${row.id})`; }

// Cloudflare Email Routing (send_email binding). Needs the zone on Cloudflare with Email Routing on.
async function sendViaEmailRouting(env, row) {
  const fromAddr = env.MAIL_FROM.match(/<([^>]+)>/)?.[1] || env.MAIL_FROM;
  const b64 = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  const raw = [
    `From: ${env.MAIL_FROM}`,
    `To: <${env.MAIL_TO}>`,
    `Reply-To: ${row.name.replace(/["\\]/g, '')} <${row.email}>`,
    `Subject: =?UTF-8?B?${b64(emailSubject(env, row))}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <quote-${row.id}-${Date.now()}@${env.CANONICAL_HOST || 'tearexwoodworks.com'}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(emailText(env, row)).replace(/(.{76})/g, '$1\r\n'),
  ].join('\r\n');
  try {
    await env.EMAIL.send(new EmailMessage(fromAddr, env.MAIL_TO, raw));
    return { ok: true, via: 'email-routing' };
  } catch (e) {
    return { ok: false, error: `Email Routing: ${e.message}`.slice(0, 300) };
  }
}

async function sendViaResend(env, row) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM, to: [env.MAIL_TO], reply_to: row.email,
        subject: emailSubject(env, row), text: emailText(env, row),
      }),
    });
    if (res.ok) return { ok: true, via: 'resend' };
    return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
  } catch (e) {
    return { ok: false, error: `Resend fetch failed: ${e.message}`.slice(0, 300) };
  }
}

async function sendEmail(env, row) {
  let result;
  if (!env.MAIL_TO) {
    result = { ok: false, error: 'MAIL_TO not set' };
  } else if (!env.EMAIL && !env.RESEND_API_KEY) {
    result = { ok: false, error: 'no sender configured (RESEND_API_KEY not set, no EMAIL binding)' };
  } else {
    if (env.EMAIL) result = await sendViaEmailRouting(env, row);
    if ((!result || !result.ok) && env.RESEND_API_KEY) {
      const r2 = await sendViaResend(env, row);
      result = r2.ok ? r2 : { ok: false, error: [result && result.error, r2.error].filter(Boolean).join(' | ').slice(0, 300) };
    }
  }
  await env.DB.prepare(
    `UPDATE submissions SET email_status = ?, email_error = ?, email_attempts = email_attempts + 1,
            emailed_at = CASE WHEN ? THEN datetime('now') ELSE emailed_at END
      WHERE id = ?`
  ).bind(result.ok ? 'sent' : (/not set|not configured/.test(result.error) ? 'pending' : 'failed'),
         result.ok ? '' : result.error, result.ok ? 1 : 0, row.id).run();
  if (!result.ok) console.warn(`email #${row.id} not sent: ${result.error}`);
  return result;
}

// ---------- health & admin ----------

async function health(env, cors) {
  const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM submissions`).first('n');
  const pending = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM submissions WHERE status = 'new' AND email_status != 'sent'`).first('n');
  return new Response(JSON.stringify({
    ok: true, submissions: n, awaiting_email: pending,
    email_configured: Boolean(env.MAIL_TO && (env.EMAIL || env.RESEND_API_KEY)),
    sender: env.EMAIL ? 'email-routing' + (env.RESEND_API_KEY ? '+resend' : '') : (env.RESEND_API_KEY ? 'resend' : 'none'),
    turnstile: Boolean(env.TURNSTILE_SECRET),
  }), { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function authorized(request, env) {
  const h = request.headers.get('Authorization') || '';
  if (!h.startsWith('Basic ') || !env.ADMIN_PASS) return false;
  let decoded = '';
  try { decoded = atob(h.slice(6)); } catch { return false; }
  const want = `${env.ADMIN_USER}:${env.ADMIN_PASS}`;
  if (decoded.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= decoded.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

async function admin(request, env, url, path) {
  const base = url.pathname.startsWith('/api/') ? '/api' : '';
  if (!authorized(request, env)) {
    return new Response('Sign in to see quote requests.', {
      status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Tea Rex quote requests", charset="UTF-8"' },
    });
  }

  const m = path.match(/^\/admin\/resend\/(\d+)$/);
  if (m && request.method === 'POST') {
    const row = await env.DB.prepare(`SELECT * FROM submissions WHERE id = ?`).bind(Number(m[1])).first();
    if (row) {
      if (row.status === 'spam') {
        await env.DB.prepare(`UPDATE submissions SET status = 'new', spam_reason = spam_reason || ' (restored)' WHERE id = ?`)
          .bind(row.id).run();
      }
      await sendEmail(env, row);
    }
    return Response.redirect(url.origin + base + '/admin' + (url.searchParams.get('all') ? '?all=1' : ''), 303);
  }

  const showAll = url.searchParams.get('all') === '1';
  const { results } = await env.DB.prepare(
    `SELECT * FROM submissions ${showAll ? '' : "WHERE status = 'new'"} ORDER BY id DESC LIMIT 500`
  ).all();

  if (path === '/admin.csv') {
    const cols = ['id', 'created_at', 'name', 'email', 'phone', 'kind', 'details', 'status', 'spam_reason', 'email_status', 'email_error'];
    const csv = [cols.join(',')].concat(results.map(r => cols.map(c => csvCell(r[c])).join(','))).join('\r\n');
    return new Response(csv, { headers: {
      'Content-Type': 'text/csv; charset=UTF-8',
      'Content-Disposition': `attachment; filename="quote-requests-${new Date().toISOString().slice(0, 10)}.csv"`,
    } });
  }

  const rows = results.map(r => `
    <tr class="${r.status === 'spam' ? 'spam' : ''}">
      <td class="when">${esc(whenLocal(r.created_at))}<br><small>#${r.id}</small></td>
      <td><strong>${esc(r.name)}</strong><br><a href="mailto:${esc(r.email)}">${esc(r.email)}</a>${r.phone ? '<br>' + esc(r.phone) : ''}</td>
      <td>${esc(r.kind)}</td>
      <td class="details">${esc(r.details)}</td>
      <td>${badge(r)}
        <form method="POST" action="${base}/admin/resend/${r.id}${showAll ? '?all=1' : ''}"><button>${r.email_status === 'sent' ? 'Send again' : 'Send now'}</button></form>
      </td>
    </tr>`).join('');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quote requests</title><meta name="robots" content="noindex">
<style>
 :root{color-scheme:light dark} body{font:15px/1.4 system-ui,sans-serif;margin:0;padding:16px;max-width:1100px;margin-inline:auto}
 h1{font-size:20px;margin:0 0 4px} .sub{color:#777;margin:0 0 16px} .sub a{margin-right:12px}
 table{border-collapse:collapse;width:100%} th,td{text-align:left;vertical-align:top;padding:8px;border-top:1px solid #8884}
 th{font-size:13px;color:#777} .when{white-space:nowrap} .details{white-space:pre-wrap;max-width:46ch}
 .spam td{opacity:.55} .b{display:inline-block;font-size:12px;padding:1px 7px;border-radius:10px;border:1px solid currentColor;margin-bottom:6px}
 .sent{color:#2a7} .failed{color:#c33} .pending{color:#b80} .spamb{color:#888}
 small{color:#777} button{font:inherit;font-size:13px;padding:3px 8px}
 @media(max-width:700px){table,tbody,tr,td{display:block} th,thead{display:none} tr{border-top:2px solid #8886;padding:8px 0} td{border:0;padding:3px 0}}
</style></head><body>
<h1>Quote requests</h1>
<p class="sub">${results.length} shown ·
 <a href="${base}/admin${showAll ? '' : '?all=1'}">${showAll ? 'Hide spam' : 'Show spam too'}</a>
 <a href="${base}/admin.csv${showAll ? '?all=1' : ''}">Download CSV</a>
 ${(env.EMAIL || env.RESEND_API_KEY) ? '' : '<strong style="color:#b80">Email is not configured yet: requests are being saved here but not emailed.</strong>'}</p>
<table><thead><tr><th>When</th><th>Who</th><th>Piece</th><th>Details</th><th>Email</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5">Nothing yet.</td></tr>'}</tbody></table>
</body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' } });
}

function badge(r) {
  if (r.status === 'spam') return `<span class="b spamb">spam: ${esc(r.spam_reason)}</span>`;
  if (r.email_status === 'sent') return `<span class="b sent">emailed</span>`;
  const e = r.email_error ? `<br><small>${esc(r.email_error.slice(0, 120))}</small>` : '';
  return `<span class="b ${esc(r.email_status)}">${esc(r.email_status)} (${r.email_attempts} tries)</span>${e}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
