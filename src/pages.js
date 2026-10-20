// Server-rendered HTML shells. The player itself is public/player.js.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const pick = (text, lang) => (typeof text === 'string' ? text : text?.[lang] ?? Object.values(text || {})[0] ?? '');

function shell({ title, body, lang = 'th', head = '' }) {
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/static/player.css">
${head}
</head>
<body>
${body}
</body>
</html>`;
}

export function tourPage(tour, { expiresAt }) {
  const lang = tour.defaultLanguage;
  const data = JSON.stringify({ tour, expiresAt }).replace(/</g, '\\u003c');
  return shell({
    title: pick(tour.title, lang),
    lang,
    head: `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="" defer></script>`,
    body: `<div id="app"></div>
<script id="tour-data" type="application/json">${data}</script>
<script src="/static/i18n.js" defer></script>
<script src="/static/player.js" defer></script>`,
  });
}

export function codePage(tour, { error = '' } = {}) {
  const lang = tour.defaultLanguage;
  return shell({
    title: pick(tour.title, lang),
    lang,
    body: `<main class="center-card">
  <h1>${esc(pick(tour.title, lang))}</h1>
  <p>กรอกรหัสเข้าใช้ที่ได้รับ / Enter your access code</p>
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  <form method="get" action="/t/${esc(tour.slug)}">
    <input name="code" autocomplete="off" autocapitalize="characters" required maxlength="16">
    <button type="submit">เริ่มทัวร์ / Start</button>
  </form>
</main>`,
  });
}

export function messagePage(title, text) {
  return shell({
    title,
    body: `<main class="center-card"><h1>${esc(title)}</h1><p>${esc(text)}</p></main>`,
  });
}

export function indexPage(tours) {
  const items = tours
    .filter((t) => t.listed)
    .map((t) => `<li><a href="/t/${esc(t.slug)}">${esc(pick(t.title, t.defaultLanguage))}</a></li>`)
    .join('\n');
  return shell({
    title: 'Audio Guides',
    body: `<main class="center-card"><h1>Audio Guides</h1><ul class="tour-list">${items || '<li>ยังไม่มีทัวร์</li>'}</ul></main>`,
  });
}

export const CODE_ERRORS = {
  unknown_code: 'รหัสไม่ถูกต้อง / Invalid code',
  code_expired: 'รหัสนี้หมดเวลาแล้ว / This code has expired',
  code_device_limit: 'รหัสนี้ถูกใช้ครบจำนวนเครื่องแล้ว / This code is already used on the maximum number of devices',
};
