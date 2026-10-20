(() => {
  let { tour, expiresAt } = JSON.parse(document.getElementById('tour-data').textContent);
  const app = document.getElementById('app');
  const store = safeStorage();
  const posKey = `ag:${tour.slug}`;

  let lang = store.get(`${posKey}:lang`) || tour.defaultLanguage;
  if (!tour.languages[lang]) lang = tour.defaultLanguage;
  let current = -1;
  let serverOffset = 0;
  let map = null;
  let markers = [];

  const pick = (text) => (typeof text === 'string' ? text : text?.[lang] ?? text?.[tour.defaultLanguage] ?? Object.values(text || {})[0] ?? '');
  const t = (key) => {
    const ui = window.UI_TEXT || {};
    const base = lang.split('-')[0];
    return ui[lang]?.[key] ?? ui[base]?.[key] ?? ui.en?.[key] ?? key;
  };

  // --- layout -------------------------------------------------------------

  app.innerHTML = `
    <header class="hero">
      <div class="hero-images"></div>
      <div class="hero-text"><h1 class="tour-title"></h1><p class="tour-subtitle"></p></div>
      <button class="theme-toggle" aria-label="Theme">◐</button>
    </header>
    <section class="card session-bar"><span class="label-time-left"></span> <strong class="countdown">--:--</strong></section>
    <section class="card language">
      <button class="language-current" aria-expanded="false"></button>
      <div class="language-panel" hidden>
        <input class="language-search" type="search">
        <div class="language-list"></div>
      </div>
    </section>
    <section class="card player">
      <h2 class="track-title"></h2>
      <p class="message" hidden></p>
      <input class="progress" type="range" min="0" max="0" step="0.1" value="0" aria-label="Progress">
      <div class="times"><span class="time-now">0:00</span><span class="time-total">0:00</span></div>
      <div class="controls">
        <button class="btn-prev" aria-label="Previous">⏮</button>
        <button class="btn-back" aria-label="-15s">↺15</button>
        <button class="btn-play" aria-label="Play">▶</button>
        <button class="btn-fwd" aria-label="+15s">15↻</button>
        <button class="btn-next" aria-label="Next">⏭</button>
      </div>
      <label class="speed"><span class="label-speed"></span>
        <select class="speed-select">
          ${[0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => `<option value="${s}" ${s === 1 ? 'selected' : ''}>${s}×</option>`).join('')}
        </select>
      </label>
      <details class="transcript" hidden><summary class="label-transcript"></summary><div class="transcript-body"></div></details>
    </section>
    <section class="card"><h3 class="label-playlist"></h3><ol class="playlist"></ol></section>
    <section class="card map-card" hidden>
      <h3 class="label-map"></h3>
      <div id="map"></div>
      <button class="locate"></button>
    </section>
    <section class="card links" hidden></section>
    <audio preload="none" controlslist="nodownload noplaybackrate" disableremoteplayback></audio>
  `;

  const $ = (sel) => app.querySelector(sel);
  const audio = $('audio');
  const progress = $('.progress');

  // No "Save audio as…" menu on the player.
  app.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.player, audio')) e.preventDefault();
  });

  // --- rendering ----------------------------------------------------------

  function render() {
    document.documentElement.lang = lang;
    $('.tour-title').textContent = pick(tour.title);
    $('.tour-subtitle').textContent = pick(tour.subtitle);
    $('.label-time-left').textContent = t('timeLeft');
    $('.language-current').textContent = `${t('language')}: ${tour.languages[lang]?.label || lang}`;
    $('.language-search').placeholder = t('searchLanguage');
    $('.label-speed').textContent = t('speed');
    $('.label-transcript').textContent = t('transcript');
    $('.label-playlist').textContent = t('playlist');
    $('.label-map').textContent = t('map');
    $('.locate').textContent = t('locateMe');
    renderLanguages();
    renderPlaylist();
    renderTrack();
    renderLinks();
    updateMapLabels();
  }

  function renderLanguages(filter = '') {
    const list = $('.language-list');
    list.innerHTML = '';
    const f = filter.toLowerCase();
    for (const [code, info] of Object.entries(tour.languages)) {
      const label = info.label || code;
      if (f && !label.toLowerCase().includes(f) && !code.includes(f)) continue;
      const b = document.createElement('button');
      b.textContent = label;
      b.className = code === lang ? 'active' : '';
      b.onclick = () => setLanguage(code);
      list.appendChild(b);
    }
  }

  function renderPlaylist() {
    const ol = $('.playlist');
    ol.innerHTML = '';
    tour.stops.forEach((stop, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.textContent = pick(stop.title) || `#${i + 1}`;
      b.className = i === current ? 'active' : '';
      if (!stop.languages.includes(lang)) b.classList.add('missing');
      b.onclick = () => playStop(i, true);
      li.appendChild(b);
      ol.appendChild(li);
    });
  }

  function renderTrack() {
    const stop = tour.stops[current];
    $('.track-title').textContent = stop ? pick(stop.title) : pick(tour.title);
    const text = stop ? pick(stop.transcript) : '';
    $('.transcript').hidden = !text;
    $('.transcript-body').textContent = text;
    $('.btn-play').textContent = audio.paused ? '▶' : '⏸';
  }

  function renderLinks() {
    const box = $('.links');
    const links = tour.links || [];
    box.hidden = links.length === 0;
    box.innerHTML = '';
    for (const link of links) {
      const a = document.createElement('a');
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'link-button';
      a.textContent = pick(link.label);
      box.appendChild(a);
    }
  }

  function showMessage(text) {
    const m = $('.message');
    m.textContent = text || '';
    m.hidden = !text;
  }

  // --- playback -----------------------------------------------------------

  async function requestLink(i) {
    const res = await fetch(`/api/${tour.slug}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stop: i, lang }),
      credentials: 'same-origin',
    });
    if (res.status === 401) return expire((await res.json()).redirect);
    if (res.status === 429) throw new Error(t('tooFast'));
    if (res.status === 404) throw new Error(t('noAudio'));
    if (!res.ok) throw new Error(t('playError'));
    return (await res.json()).url;
  }

  async function playStop(i, autoplay, resumeAt = null) {
    const stop = tour.stops[i];
    if (!stop) return;
    if (resumeAt === null) retried = false;
    current = i;
    showMessage('');
    renderPlaylist();
    renderTrack();
    focusMap(i);
    if (!stop.languages.includes(lang)) {
      audio.removeAttribute('src');
      return showMessage(t('noAudio'));
    }
    try {
      const url = await requestLink(i);
      if (!url) return;
      audio.src = url;
      const start = resumeAt ?? Number(store.get(`${posKey}:${lang}:${i}`) || 0);
      audio.addEventListener('loadedmetadata', () => {
        if (start > 0 && start < audio.duration - 5) audio.currentTime = start;
      }, { once: true });
      if (autoplay) await audio.play().catch(() => {});
      setMediaSession(stop);
    } catch (err) {
      showMessage(err.message || t('playError'));
    }
    store.set(`${posKey}:last`, String(i));
  }

  // The signed link is short-lived; when it lapses mid-track, fetch a new one once and carry on.
  let retried = false;
  audio.addEventListener('playing', () => (retried = false));
  audio.addEventListener('error', () => {
    if (current < 0 || !audio.getAttribute('src')) return;
    if (retried) return showMessage(t('playError'));
    retried = true;
    const at = audio.currentTime;
    playStop(current, !audio.paused || at > 0, at);
  });

  audio.addEventListener('timeupdate', () => {
    progress.max = audio.duration || 0;
    progress.value = audio.currentTime;
    $('.time-now').textContent = fmt(audio.currentTime);
    if (current >= 0 && Math.floor(audio.currentTime) % 5 === 0) {
      store.set(`${posKey}:${lang}:${current}`, String(Math.floor(audio.currentTime)));
    }
  });
  audio.addEventListener('loadedmetadata', () => ($('.time-total').textContent = fmt(audio.duration)));
  audio.addEventListener('play', renderTrack);
  audio.addEventListener('pause', renderTrack);
  audio.addEventListener('ended', () => {
    store.set(`${posKey}:${lang}:${current}`, '0');
    if (current < tour.stops.length - 1) playStop(current + 1, true);
  });

  progress.addEventListener('input', () => (audio.currentTime = Number(progress.value)));
  $('.btn-play').onclick = () => {
    if (current < 0) return playStop(Number(store.get(`${posKey}:last`) || 0), true);
    audio.paused ? audio.play() : audio.pause();
  };
  $('.btn-prev').onclick = () => (audio.currentTime > 3 ? (audio.currentTime = 0) : playStop(Math.max(0, current - 1), true));
  $('.btn-next').onclick = () => playStop(Math.min(tour.stops.length - 1, current + 1), true);
  $('.btn-back').onclick = () => (audio.currentTime = Math.max(0, audio.currentTime - 15));
  $('.btn-fwd').onclick = () => (audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15));
  $('.speed-select').onchange = (e) => {
    audio.playbackRate = Number(e.target.value);
    store.set('ag:speed', e.target.value);
  };
  const savedSpeed = store.get('ag:speed');
  if (savedSpeed) {
    $('.speed-select').value = savedSpeed;
    audio.playbackRate = Number(savedSpeed);
  }

  function setMediaSession(stop) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: pick(stop.title), album: pick(tour.title) });
    navigator.mediaSession.setActionHandler('previoustrack', () => $('.btn-prev').click());
    navigator.mediaSession.setActionHandler('nexttrack', () => $('.btn-next').click());
    navigator.mediaSession.setActionHandler('seekbackward', () => $('.btn-back').click());
    navigator.mediaSession.setActionHandler('seekforward', () => $('.btn-fwd').click());
  }

  // --- language -----------------------------------------------------------

  const panel = $('.language-panel');
  $('.language-current').onclick = () => {
    panel.hidden = !panel.hidden;
    $('.language-current').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) $('.language-search').focus();
  };
  $('.language-search').oninput = (e) => renderLanguages(e.target.value);

  function setLanguage(code) {
    const wasPlaying = !audio.paused;
    audio.pause();
    lang = code;
    store.set(`${posKey}:lang`, code);
    panel.hidden = true;
    render();
    if (current >= 0) playStop(current, wasPlaying);
  }

  // --- session timer ------------------------------------------------------

  function expire(target) {
    audio.pause();
    location.replace(target || tour.expiredRedirect || '/expired');
  }

  function tick() {
    const left = expiresAt - (Date.now() + serverOffset);
    if (left <= 0) return expire();
    const h = Math.floor(left / 3_600_000);
    const m = Math.floor((left % 3_600_000) / 60_000);
    const s = Math.floor((left % 60_000) / 1000);
    $('.countdown').textContent = h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  async function heartbeat() {
    try {
      const res = await fetch(`/api/${tour.slug}/session`, { credentials: 'same-origin' });
      if (res.status === 401) return expire((await res.json()).redirect);
      if (res.ok) {
        const info = await res.json();
        serverOffset = info.now - Date.now();
        expiresAt = info.expiresAt; // staff may have extended the pass
      }
    } catch {
      // Offline for a moment; the local countdown keeps running.
    }
  }

  // --- map ----------------------------------------------------------------

  function initMap() {
    const points = tour.stops.map((s, i) => ({ ...s, i })).filter((s) => s.lat != null);
    if (!points.length || !window.L) return;
    $('.map-card').hidden = false;
    map = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    markers = points.map((s) =>
      L.marker([s.lat, s.lng]).addTo(map).bindTooltip('', { permanent: true, direction: 'top' }).on('click', () => playStop(s.i, true)),
    );
    markers.forEach((m, k) => (m.stopIndex = points[k].i));
    map.fitBounds(L.featureGroup(markers).getBounds().pad(0.3));
    updateMapLabels();
  }

  function updateMapLabels() {
    markers.forEach((m) => m.setTooltipContent(`${m.stopIndex + 1}. ${pick(tour.stops[m.stopIndex].title)}`));
  }

  function focusMap(i) {
    const m = markers.find((mk) => mk.stopIndex === i);
    if (m && map) map.panTo(m.getLatLng());
  }

  let me = null;
  $('.locate').onclick = () => {
    if (!navigator.geolocation || !map) return;
    navigator.geolocation.watchPosition(
      (pos) => {
        const ll = [pos.coords.latitude, pos.coords.longitude];
        if (!me) {
          me = L.circleMarker(ll, { radius: 8, color: '#2563eb', fillOpacity: 0.8 }).addTo(map);
          map.panTo(ll);
        } else me.setLatLng(ll);
      },
      () => {},
      { enableHighAccuracy: true },
    );
  };

  // --- hero + theme -------------------------------------------------------

  function initHero() {
    const box = $('.hero-images');
    tour.heroImages.forEach((src, i) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      if (i === 0) img.className = 'active';
      box.appendChild(img);
    });
    const imgs = box.querySelectorAll('img');
    if (imgs.length > 1) {
      let k = 0;
      setInterval(() => {
        imgs[k].classList.remove('active');
        k = (k + 1) % imgs.length;
        imgs[k].classList.add('active');
      }, 5000);
    }
  }

  const theme = store.get('ag:theme');
  if (theme) document.documentElement.dataset.theme = theme;
  $('.theme-toggle').onclick = () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('ag:theme', next);
  };
  if (tour.theme?.accent) document.documentElement.style.setProperty('--accent', tour.theme.accent);

  // --- start --------------------------------------------------------------

  function fmt(sec) {
    if (!Number.isFinite(sec)) return '0:00';
    return `${Math.floor(sec / 60)}:${pad(Math.floor(sec % 60))}`;
  }
  function pad(n) {
    return String(n).padStart(2, '0');
  }
  function safeStorage() {
    return {
      get(k) {
        try {
          return localStorage.getItem(k);
        } catch {
          return null;
        }
      },
      set(k, v) {
        try {
          localStorage.setItem(k, v);
        } catch {
          /* private mode */
        }
      },
    };
  }

  initHero();
  render();
  tick();
  setInterval(tick, 1000);
  heartbeat();
  setInterval(heartbeat, 20_000);
  if (window.L) initMap();
  else window.addEventListener('load', initMap);
})();
