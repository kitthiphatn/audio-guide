(() => {
  const root = document.getElementById('admin');
  let timer = null;

  // h('div.card', {attrs}, ...children). Strings are always inserted as text.
  function h(tag, attrs, ...kids) {
    const [name, ...cls] = tag.split('.');
    const el = document.createElement(name || 'div');
    if (cls.length) el.className = cls.join(' ');
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      kids.unshift(attrs);
      attrs = null;
    }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }

  const pick = (t, l) => (typeof t === 'string' ? t : t?.[l] ?? Object.values(t || {})[0] ?? '');
  const left = (ms) => (ms <= 0 ? 'หมดเวลา' : ms >= 3_600_000 ? `${Math.floor(ms / 3_600_000)} ชม. ${Math.floor((ms % 3_600_000) / 60_000)} นาที` : `${Math.ceil(ms / 60_000)} นาที`);
  const when = (t) => (t ? new Date(t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '–');
  const STATUS = { active: 'กำลังใช้', unused: 'ยังไม่ใช้', expired: 'หมดเวลา', revoked: 'ยกเลิกแล้ว' };
  const table = (heads, rows) =>
    h('div.table-wrap', h('table', h('thead', h('tr', heads.map((x) => h('th', x)))), h('tbody', rows)));

  async function api(method, path, body, raw = false) {
    const headers = { 'x-admin': '1' };
    if (body !== undefined && !raw) headers['content-type'] = 'application/json';
    const res = await fetch(`/admin/api/${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== 'login') {
      login(data.configured !== false);
      throw new Error('login_required');
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function page(active, ...content) {
    clearInterval(timer);
    window.onbeforeunload = null;
    const tab = (hash, label) => h('a', { href: hash, class: active === hash ? 'active' : null }, label);
    root.replaceChildren(
      h('nav.topbar.no-print',
        h('span.brand', 'Audio Guide'),
        tab('#overview', 'ภาพรวม'),
        tab('#tours', 'ทัวร์ / เทมเพลต'),
        tab('#passes', 'บัตรเข้าใช้ (QR)'),
        h('span.spacer'),
        h('button.small', { onclick: () => api('POST', 'logout', {}).finally(() => login()) }, 'ออกจากระบบ'),
      ),
      h('main', ...content),
    );
  }

  // --- sign in -------------------------------------------------------------

  function login(configured = true) {
    clearInterval(timer);
    const msg = h('p.error');
    const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('POST', 'login', { password: pw.value });
          route();
        } catch (err) {
          msg.textContent = err.message;
        }
      },
    }, h('label', 'รหัสผ่านผู้ดูแล', pw), h('p', h('button.primary', { type: 'submit' }, 'เข้าสู่ระบบ')));
    root.replaceChildren(h('main', h('div.card.login', h('h1', 'Audio Guide Dashboard'),
      configured ? form : h('p', 'ยังไม่ได้ตั้งรหัสผ่าน: เพิ่มบรรทัด AG_ADMIN_PASSWORD=... ในไฟล์ .env แล้ว restart server'), msg)));
  }

  // --- overview ------------------------------------------------------------

  async function overview() {
    const box = h('div');
    page('#overview', h('h1', 'ภาพรวม'), box);
    const stat = (v, l) => h('div', h('div.stat', v), h('div.stat-label', l));
    const act = (p) => p.then(load);
    async function load() {
      const d = await api('GET', 'overview');
      box.replaceChildren(
        d.loadErrors?.length ? h('div.card.error', 'ทัวร์ที่โหลดไม่ได้: ', d.loadErrors.join(' | ')) : '',
        d.tours.length
          ? h('div.grid', d.tours.map((t) => h('div.card',
            h('h3', pick(t.title, t.defaultLanguage)),
            h('div.muted', `/t/${t.slug} · ${t.mode === 'code' ? 'ใช้ QR' : 'สาธารณะ'} · ${t.stops} จุด`),
            h('div.stats', stat(t.stats.activeSessions || 0, 'กำลังฟัง'), stat(t.stats.sessions || 0, 'session ทั้งหมด'),
              stat(t.stats.plays || 0, 'ครั้งที่เล่น'), t.mode === 'code' ? stat(t.stats.unusedPasses || 0, 'QR ยังไม่ใช้') : null),
          )))
          : h('div.card', 'ยังไม่มีทัวร์ ', h('a', { href: '#tours' }, 'สร้างทัวร์แรก')),
        h('div.card', h('h2', `กำลังใช้งาน (${d.sessions.length})`),
          d.sessions.length
            ? table(['ทัวร์', 'รหัส / หมายเหตุ', 'เริ่ม', 'เหลือ', 'เล่น', ''], d.sessions.map((s) => h('tr',
              h('td', s.slug),
              h('td', s.code ? h('code', s.code) : h('span.muted', 'สาธารณะ'), s.note ? ` · ${s.note}` : ''),
              h('td', when(s.createdAt)),
              h('td', left(s.expiresAt - d.now)),
              h('td', s.plays),
              h('td', h('div.actions',
                s.code ? h('button.small', { onclick: () => act(api('POST', `passes/${s.code}/extend`, { minutes: 30 })) }, '+30 นาที') : null,
                h('button.small.danger', {
                  onclick: () => confirm('ตัดสิทธิ์ทันที?') &&
                    act(s.code ? api('POST', `passes/${s.code}/revoke`, {}) : api('POST', `sessions/${s.sid}/end`, {})),
                }, 'ตัดสิทธิ์'))),
            )))
            : h('p.muted', 'ยังไม่มีใครใช้งานตอนนี้')),
      );
    }
    await load();
    timer = setInterval(() => load().catch(() => {}), 10_000);
  }

  // --- tour list -----------------------------------------------------------

  async function tours() {
    const d = await api('GET', 'overview');
    const msg = h('p.error');
    const slug = h('input', { placeholder: 'เช่น wat-pho', required: true });
    const langs = h('input', { value: 'th en zh' });
    const from = h('select', h('option', { value: '' }, '— ทัวร์เปล่า —'),
      d.tours.map((t) => h('option', { value: t.slug }, `${pick(t.title, t.defaultLanguage)} (${t.slug})`)));
    page('#tours', h('h1', 'ทัวร์ / เทมเพลต'),
      h('div.card', h('h2', 'สร้างทัวร์ใหม่'),
        h('form.row', {
          onsubmit: async (e) => {
            e.preventDefault();
            try {
              const s = slug.value.trim();
              await api('POST', 'tours', { slug: s, languages: langs.value.split(/[\s,]+/).filter(Boolean), from: from.value || null });
              location.hash = `#tour/${s}`;
            } catch (err) {
              msg.textContent = err.message;
            }
          },
        }, h('label', 'ชื่อในลิงก์ (a-z 0-9 -)', slug), h('label', 'ภาษา', langs), h('label', 'คัดลอกจากเทมเพลต', from),
          h('button.primary', { type: 'submit' }, 'สร้าง')),
        h('p.muted', 'คัดลอกจากเทมเพลตจะได้การตั้งค่า ข้อความ จุด และรูป แต่ไม่รวมไฟล์เสียง'), msg),
      h('div.card', h('h2', 'ทัวร์ทั้งหมด'),
        table(['ชื่อ', 'ลิงก์', 'โหมด', 'จุด', ''], d.tours.map((t) => h('tr',
          h('td', pick(t.title, t.defaultLanguage)),
          h('td', h('a', { href: `/t/${t.slug}`, target: '_blank' }, `/t/${t.slug}`)),
          h('td', t.mode === 'code' ? 'QR' : 'สาธารณะ'),
          h('td', t.stops),
          h('td', h('div.actions', h('a', { href: `#tour/${t.slug}` }, 'แก้ไข'), t.mode === 'code' ? h('a', { href: `#passes/${t.slug}` }, 'ออก QR') : null)),
        )))),
    );
  }

  // --- tour editor ---------------------------------------------------------

  async function editTour(slug) {
    let { raw, media } = await api('GET', `tours/${slug}`);
    const status = h('span.muted');
    const body = h('div');
    let dirty = false;
    const touch = () => {
      dirty = true;
      status.textContent = 'ยังไม่ได้บันทึก';
    };
    const langs = () => Object.keys(raw.languages || {});
    const has = (rel) => media.some((m) => m.path === rel);

    const perLang = (obj, key, multi = false) => h('div.lang-fields', langs().map((l) => {
      if (!obj[key] || typeof obj[key] !== 'object') obj[key] = { [l]: obj[key] || '' };
      return h('label', `${raw.languages[l].label || l} (${l})`,
        h(multi ? 'textarea' : 'input', { value: obj[key][l] || '', oninput: (e) => { obj[key][l] = e.target.value; touch(); } }));
    }));
    const input = (label, value, set, attrs = {}) =>
      h('label', label, h('input', { ...attrs, value: value ?? '', oninput: (e) => { set(e.target.value); touch(); } }));

    async function upload(file, rel) {
      status.textContent = `กำลังอัปโหลด ${file.name}…`;
      const saved = await api('PUT', `tours/${slug}/media?path=${encodeURIComponent(rel)}`, file, true);
      media = (await api('GET', `tours/${slug}`)).media;
      return saved.path;
    }
    const ext = (name) => (/\.[a-z0-9]+$/i.exec(name)?.[0] || '').toLowerCase();
    const filePicker = (accept, onfile) => {
      const f = h('input', { type: 'file', accept, hidden: true, onchange: async () => {
        if (!f.files[0]) return;
        try {
          await onfile(f.files[0]);
          touch();
          draw();
        } catch (err) {
          status.textContent = err.message;
        }
      } });
      return [f, () => f.click()];
    };

    function stopCard(stop, i) {
      stop.audio ||= {};
      const move = (d) => {
        const j = i + d;
        if (j < 0 || j >= raw.stops.length) return;
        [raw.stops[i], raw.stops[j]] = [raw.stops[j], raw.stops[i]];
        touch();
        draw();
      };
      return h('div.stop',
        h('div.stop-head', h('strong', `จุดที่ ${i + 1}`),
          h('button.small', { onclick: () => move(-1) }, '↑'),
          h('button.small', { onclick: () => move(1) }, '↓'),
          h('button.small.danger', { onclick: () => { if (confirm('ลบจุดนี้?')) { raw.stops.splice(i, 1); touch(); draw(); } } }, 'ลบ')),
        h('h3', 'ชื่อจุด'), perLang(stop, 'title'),
        h('div.row',
          input('ละติจูด', stop.lat, (v) => (stop.lat = v === '' ? null : Number(v)), { type: 'number', step: 'any' }),
          input('ลองจิจูด', stop.lng, (v) => (stop.lng = v === '' ? null : Number(v)), { type: 'number', step: 'any' })),
        h('h3', 'ไฟล์เสียง'),
        langs().map((l) => {
          const rel = stop.audio[l];
          const [picker, open] = filePicker('audio/*', async (file) => {
            stop.audio[l] = await upload(file, `audio/${l}/${String(i + 1).padStart(2, '0')}-${stop.id || i + 1}${ext(file.name) || '.mp3'}`);
          });
          return h('div.audio-row', h('span.lang', l),
            h('span.file', rel ? (has(rel) ? h('span.ok', `✓ ${rel}`) : h('span.error', `ไม่พบไฟล์ ${rel}`)) : h('span.muted', 'ยังไม่มี')),
            picker, h('button.small', { onclick: open }, rel ? 'เปลี่ยนไฟล์' : 'อัปโหลด'));
        }),
        h('details', h('summary', 'บทบรรยาย (ไม่บังคับ)'), perLang(stop, 'transcript', true)),
      );
    }

    function draw() {
      const a = (raw.access ||= {});
      raw.stops ||= [];
      raw.heroImages ||= [];
      const [heroPicker, openHero] = filePicker('image/*', async (file) => {
        const name = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
        raw.heroImages.push(await upload(file, `images/${name}`));
      });
      body.replaceChildren(
        h('div.card', h('h2', 'ข้อมูลทัวร์'), h('h3', 'ชื่อทัวร์'), perLang(raw, 'title'), h('h3', 'คำอธิบายสั้น'), perLang(raw, 'subtitle'),
          h('div.row',
            input('ภาษาเริ่มต้น', raw.defaultLanguage, (v) => (raw.defaultLanguage = v)),
            input('สีหลัก', raw.theme?.accent || '#0f766e', (v) => ((raw.theme ||= {}).accent = v), { type: 'color' }),
            h('label', h('input', { type: 'checkbox', checked: raw.listed !== false, onchange: (e) => { raw.listed = e.target.checked; touch(); } }), ' แสดงในหน้ารายการทัวร์'))),
        h('div.card', h('h2', 'การเข้าใช้'),
          h('div.row',
            h('label', 'โหมด', h('select', { onchange: (e) => { a.mode = e.target.value; touch(); } },
              h('option', { value: 'code', selected: a.mode !== 'open' }, 'ต้องสแกน QR / ใส่รหัส'),
              h('option', { value: 'open', selected: a.mode === 'open' }, 'เปิดสาธารณะ'))),
            input('เวลาต่อ session (นาที)', a.sessionMinutes, (v) => (a.sessionMinutes = Number(v)), { type: 'number', min: 1 }),
            input('หมดเวลาแล้วพาไปที่', a.expiredRedirect, (v) => (a.expiredRedirect = v)),
            input('แทร็กสูงสุดต่อนาที', a.maxTracksPerMinute, (v) => (a.maxTracksPerMinute = Number(v)), { type: 'number', min: 1 }))),
        h('div.card', h('h2', 'รูปหน้าปก'),
          h('div.thumbs', raw.heroImages.map((p, k) => h('figure', h('img', { src: `/t/${slug}/${p}`, alt: '' }),
            h('button.small.danger', { onclick: () => { raw.heroImages.splice(k, 1); touch(); draw(); } }, '×')))),
          heroPicker, h('p', h('button.small', { onclick: openHero }, 'เพิ่มรูป'))),
        h('div.card', h('h2', `จุดในทัวร์ (${raw.stops.length})`), raw.stops.map(stopCard),
          h('button', { onclick: () => {
            const n = raw.stops.length + 1;
            raw.stops.push({ id: String(n), title: Object.fromEntries(langs().map((l) => [l, `Stop ${n}`])), lat: null, lng: null, audio: {} });
            touch();
            draw();
          } }, '+ เพิ่มจุด')),
        h('div.card', h('details', h('summary', 'แก้แบบ JSON (ขั้นสูง)'),
          h('textarea', { rows: 16, value: JSON.stringify(raw, null, 2), onchange: (e) => {
            try {
              raw = JSON.parse(e.target.value);
              touch();
              draw();
            } catch (err) {
              status.textContent = `JSON ผิด: ${err.message}`;
            }
          } }))),
      );
    }

    async function save() {
      try {
        await api('PUT', `tours/${slug}`, { raw });
        dirty = false;
        status.textContent = 'บันทึกแล้ว';
      } catch (err) {
        status.textContent = `บันทึกไม่ได้: ${err.message}`;
      }
    }

    page('#tours',
      h('div.row', h('h1', `แก้ไขทัวร์: ${slug}`), h('a', { href: `/t/${slug}`, target: '_blank' }, 'เปิดหน้าทัวร์')),
      body,
      h('div.savebar', h('button.primary', { onclick: save }, 'บันทึก'), status),
    );
    window.onbeforeunload = () => (dirty ? true : undefined);
    draw();
  }

  // --- passes (QR) ---------------------------------------------------------

  function qrSvg(text) {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    // The library returns a self-contained SVG string built only from the module grid.
    const tmp = document.createElement('div');
    tmp.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    return tmp.firstElementChild;
  }

  function qrCard(p, title) {
    const url = `${location.origin}/t/${p.slug}?code=${p.code}`;
    return h('div.qr-card', h('div', h('strong', title)), qrSvg(url), h('div.code', p.code),
      h('div.meta', `${p.minutes} นาที · ${p.devices} เครื่อง${p.note ? ` · ${p.note}` : ''}`),
      h('div.meta', 'สแกนเพื่อเริ่มฟัง / Scan to start'));
  }

  function showQr(cards) {
    const dlg = h('dialog', h('div.card',
      h('div.print-area', h('div.qr-sheet', cards)),
      h('p.no-print', h('button.primary', { onclick: () => window.print() }, 'พิมพ์'), ' ', h('button', { onclick: () => dlg.close() }, 'ปิด'))));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  async function passes(filterSlug = '') {
    const d = await api('GET', 'overview');
    const codeTours = d.tours.filter((t) => t.mode === 'code');
    const titleOf = (slug) => {
      const t = d.tours.find((x) => x.slug === slug);
      return t ? pick(t.title, t.defaultLanguage) : slug;
    };
    const msg = h('p.error');
    const tourSel = h('select', codeTours.map((t) => h('option', { value: t.slug, selected: t.slug === filterSlug }, titleOf(t.slug))));
    const minutes = h('input', { type: 'number', min: 1, placeholder: 'ตามค่าทัวร์' });
    const devices = h('input', { type: 'number', min: 1, value: 1 });
    const count = h('input', { type: 'number', min: 1, max: 200, value: 1 });
    const note = h('input', { placeholder: 'เช่น โต๊ะ 5 / คุณสมชาย' });
    const list = h('div');

    page('#passes', h('h1', 'บัตรเข้าใช้ (QR)'),
      codeTours.length ? h('div.card', h('h2', 'ออก QR ใหม่'),
        h('form.row', {
          onsubmit: async (e) => {
            e.preventDefault();
            msg.textContent = '';
            try {
              const r = await api('POST', 'passes', { slug: tourSel.value, minutes: Number(minutes.value) || undefined, devices: Number(devices.value), count: Number(count.value), note: note.value });
              showQr(r.passes.map((p) => qrCard(p, titleOf(p.slug))));
              note.value = '';
              await load();
            } catch (err) {
              msg.textContent = err.message;
            }
          },
        }, h('label', 'ทัวร์', tourSel), h('label', 'เวลา (นาที)', minutes), h('label', 'จำนวนเครื่องต่อ QR', devices),
          h('label', 'จำนวน QR', count), h('label', 'หมายเหตุ', note), h('button.primary', { type: 'submit' }, 'ออก QR')),
        h('p.muted', 'เวลาเริ่มนับตอนลูกค้าสแกนครั้งแรก หมดเวลาแล้วใช้ต่อไม่ได้จนกว่าคุณจะกดต่อเวลา'), msg)
        : h('div.card', 'ยังไม่มีทัวร์ที่ตั้งโหมด "ต้องสแกน QR" ไปตั้งได้ที่ ', h('a', { href: '#tours' }, 'ทัวร์')),
      list);

    async function load() {
      const r = await api('GET', `passes${filterSlug ? `?slug=${encodeURIComponent(filterSlug)}` : ''}`);
      const act = (p) => p.then(load).catch((err) => (msg.textContent = err.message));
      list.replaceChildren(h('div.card', h('h2', `QR ทั้งหมด (${r.passes.length})`),
        r.passes.length ? table(['รหัส', 'ทัวร์', 'หมายเหตุ', 'สถานะ', 'เหลือ', 'เครื่อง', 'สร้างเมื่อ', ''], r.passes.map((p) => h('tr',
          h('td', h('code', p.code)),
          h('td', titleOf(p.slug)),
          h('td', p.note || ''),
          h('td', h(`span.badge.${p.status}`, STATUS[p.status])),
          h('td', p.status === 'active' ? left(p.expiresAt - r.now) : p.status === 'unused' ? `${p.minutes} นาที` : '–'),
          h('td', `${p.sids.length}/${p.devices}`),
          h('td', when(p.createdAt)),
          h('td', h('div.actions',
            h('button.small', { onclick: () => showQr([qrCard(p, titleOf(p.slug))]) }, 'QR'),
            h('button.small', { onclick: () => act(api('POST', `passes/${p.code}/extend`, { minutes: 15 })) }, '+15'),
            h('button.small', { onclick: () => act(api('POST', `passes/${p.code}/extend`, { minutes: 60 })) }, '+60'),
            p.status !== 'revoked' ? h('button.small.danger', { onclick: () => confirm(`ยกเลิก ${p.code}?`) && act(api('POST', `passes/${p.code}/revoke`, {})) }, 'ยกเลิก') : null)),
        ))) : h('p.muted', 'ยังไม่มี QR')));
    }
    await load();
    timer = setInterval(() => load().catch(() => {}), 10_000);
  }

  // --- router --------------------------------------------------------------

  async function route() {
    const [view, arg] = (location.hash.slice(1) || 'overview').split('/');
    try {
      if (view === 'tours') await tours();
      else if (view === 'tour' && arg) await editTour(decodeURIComponent(arg));
      else if (view === 'passes') await passes(arg ? decodeURIComponent(arg) : '');
      else await overview();
    } catch (err) {
      if (err.message !== 'login_required') root.append(h('main', h('div.card.error', err.message)));
    }
  }

  window.addEventListener('hashchange', route);
  route();
})();
