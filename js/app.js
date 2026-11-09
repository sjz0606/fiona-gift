/* Fiona v4 — «Кому цветы?» gift finder + swipe catalog. Vanilla JS, no build. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HELIX_URL = new URL('helix.js', (document.currentScript && document.currentScript.src) || location.href).href;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------- state ---------- */
  const S = {
    lang: store.get('f4lang', 'ru') === 'uz' ? 'uz' : 'ru',
    who: 'mom', why: 'bday', budget: 'b2000',
    fav: store.get('f4fav', []),
    vases: store.get('f4vases', []),
    items: [], byId: {}, matches: [], over: false, idx: 0,
    deck: [], deckIdx: 0, deckFilter: 'all', history: []
  };
  const T = () => window.I18N[S.lang];
  const nbsp = ' ';
  const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, nbsp);
  const money = (n) => fmt(n) + nbsp + T().sum;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  const BUDGET = { b700: 700000, b1200: 1200000, b2000: 2000000, b4000: 4000000, b99: Infinity };
  const WHO = {
    mom:       { color: { peach: 4, pink: 3, white: 1, mixed: 1 }, format: { basket: 3, dome: 2, bouquet: 1, box: 1 }, scale: { large: 2, huge: 1, medium: 1 }, peony: 1 },
    love:      { color: { red: 3, pink: 2, mixed: 1, peach: 1 }, format: { bouquet: 2, basket: 2, box: 1, teddy: 1 }, scale: { huge: 3, large: 2 }, peony: 1 },
    friend:    { color: { pink: 2, peach: 2, mixed: 2, yellow: 2 }, format: { bouquet: 2, box: 2, dome: 1 }, scale: { small: 2, medium: 2 }, peony: 1 },
    daughter:  { color: { pink: 3, mixed: 1 }, format: { teddy: 4, box: 2, bouquet: 1 }, scale: { small: 1, medium: 2, large: 1 } },
    teacher:   { color: { white: 2, peach: 2, mixed: 1, yellow: 1, pink: 1 }, format: { bouquet: 2, basket: 1 }, scale: { small: 2, medium: 2 } },
    colleague: { color: { white: 2, yellow: 2, peach: 1, mixed: 1 }, format: { bouquet: 2, box: 1 }, scale: { small: 2, medium: 2 } },
    bride:     { color: { white: 3, pink: 1, mixed: 1 }, format: { bridal: 3 }, scale: {} },
    self:      { color: { peach: 2, pink: 1, white: 1 }, format: { dome: 2, bouquet: 1 }, scale: { medium: 2, small: 1 }, peony: 2 }
  };
  const WHY = {
    bday: { scale: { huge: 1, large: 1 }, format: { basket: 1 } },
    just: { scale: { small: 2, medium: 1 } },
    sorry: { color: { white: 3, peach: 2, red: -2, mixed: -1 } },
    date: { color: { red: 3 }, scale: { huge: 2 } },
    m8: { color: { pink: 1, peach: 1 } },
    tday: { color: { white: 1 }, format: { bouquet: 1 }, scale: { small: 1, medium: 1 } },
    wedding: {},
    newyear: { color: { red: 1, white: 1 } }
  };

  /* ---------- i18n ---------- */
  function applyLang() {
    const t = T();
    document.documentElement.lang = S.lang === 'uz' ? 'uz' : 'ru';
    $$('[data-i18n]').forEach(el => { const v = t[el.dataset.i18n]; if (typeof v === 'string') el.textContent = v; });
    $$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === S.lang)));
    $('#trayBtn').setAttribute('aria-label', t['tray.t']);
    renderChips(); renderMarquee(); renderFilters(); renderOcc(); renderVases(); renderPeony(); renderBride();
    renderMatches(true); renderDeck(); renderTray(); fillSelects();
    if ($('#composer').open) renderComposer();
  }

  /* ---------- names / tags ---------- */
  function itemName(it) {
    const t = T();
    if (it.src === 'peony') return t.peonyName.replace('{n}', it.stems);
    if (it.src === 'bride') return t.brideName + ' №' + parseInt(it.id.slice(6), 10);
    return t.code + ' ' + it.id;
  }
  function priceLabel(it) {
    const t = T();
    return it.from && S.lang === 'uz' ? money(it.price) + 'dan' : (it.from ? t.from : '') + money(it.price);
  }
  function priceSub(it) {
    const t = T();
    if (it.each) return t.each;
    if (it.discount) return t.discount;
    if (it.stems) return it.stems + ' ' + t.pcs;
    return '';
  }

  /* ---------- matching ---------- */
  function scoreItem(it) {
    const p = WHO[S.who], q = WHY[S.why] || {};
    const part = k => ((p[k] || {})[it[k]] || 0) + ((q[k] || {})[it[k]] || 0);
    const c = part('color'), f = part('format'), s = part('scale');
    const pe = it.flower === 'peony' ? (p.peony || 0) : 0;
    return { c, f, s, pe, total: c + f + s + pe };
  }
  function computeMatches() {
    const bridal = S.who === 'bride' || S.why === 'wedding';
    const pool = S.items.filter(it => bridal ? it.src === 'bride' : it.src !== 'bride');
    const cap = BUDGET[S.budget];
    let list = pool.filter(it => it.price <= cap);
    S.over = false;
    if (!list.length) { list = pool.slice().sort((a, b) => a.price - b.price).slice(0, 4); S.over = true; }
    const scored = list.map(it => {
      const sc = scoreItem(it);
      const fill = isFinite(cap) ? 1.6 * (it.price / cap) : 0;
      return { it, sc, rank: sc.total + fill + (it.video ? .3 : 0) };
    }).sort((a, b) => b.rank - a.rank);
    // keep variety: avoid more than 3 of the same format in the top list
    const out = [], fc = {};
    for (const x of scored) { const k = x.it.format; if ((fc[k] || 0) >= 3 && scored.length > 8) continue; fc[k] = (fc[k] || 0) + 1; out.push(x); if (out.length === 8) break; }
    return out;
  }
  function reasonFor(x) {
    const r = T().reason, it = x.it, sc = x.sc;
    const parts = [['format', sc.f, r.format[it.format]], ['color', sc.c, r.color[it.color]], ['scale', sc.s, r.scale[it.scale]]]
      .filter(p => p[1] > 0 && p[2]).sort((a, b) => b[1] - a[1]).slice(0, 2).map(p => p[2]);
    if (it.flower === 'peony') parts.splice(1, 1, r.peony);
    if (!parts.length) parts.push(r.format[it.format], r.budget);
    return cap(parts.filter(Boolean).join('; '));
  }

  /* ---------- chips + popover ---------- */
  function chipText(kind) {
    const t = T();
    if (kind === 'why' && S.why === 'bday') return (t.bdayAlt && t.bdayAlt[S.who]) || t.why.bday;
    return t[kind][S[kind]];
  }
  function renderChips(popKind) {
    $$('.chip').forEach(ch => {
      const k = ch.dataset.chip;
      ch.querySelector('.chip-v').textContent = chipText(k);
      if (popKind === k) { ch.classList.remove('pop'); void ch.offsetWidth; ch.classList.add('pop'); }
    });
  }
  const pop = $('#popover');
  let popFor = null;
  function openPop(chip) {
    const k = chip.dataset.chip, t = T();
    if (popFor === chip) return closePop();
    closePop();
    popFor = chip; chip.setAttribute('aria-expanded', 'true');
    pop.innerHTML = Object.keys(t[k]).map(key => {
      const label = (k === 'why' && key === 'bday') ? ((t.bdayAlt && t.bdayAlt[S.who]) || t.why.bday) : t[k][key];
      return `<button type="button" role="option" data-v="${key}" aria-selected="${S[k] === key}">${esc(label)}</button>`;
    }).join('');
    pop.hidden = false;
    const fr = $('#finder').getBoundingClientRect(), cr = chip.getBoundingClientRect();
    const w = Math.min(360, window.innerWidth - 24);
    let left = cr.left - fr.left; left = Math.max(12, Math.min(left, fr.width - w - 12));
    pop.style.left = left + 'px'; pop.style.top = (cr.bottom - fr.top + 10) + 'px';
    pop.style.transformOrigin = `${Math.max(10, cr.left - fr.left - left + 30)}px top`;
    const sel = pop.querySelector('[aria-selected="true"]') || pop.firstElementChild;
    sel && sel.focus({ preventScroll: true });
  }
  function closePop(focusBack) {
    if (!popFor) return;
    popFor.setAttribute('aria-expanded', 'false');
    if (focusBack) popFor.focus();
    popFor = null; pop.hidden = true;
  }
  $$('.chip').forEach(ch => { ch.setAttribute('aria-expanded', 'false'); ch.addEventListener('click', e => { e.stopPropagation(); openPop(ch); }); ch.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); openPop(ch); } }); });
  pop.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !popFor) return;
    const k = popFor.dataset.chip; S[k] = b.dataset.v;
    const chip = popFor; closePop(); chip.focus({ preventScroll: true });
    renderChips(k); if (k === 'who') renderChips('why');
    S.idx = 0; renderMatches();
  });
  pop.addEventListener('keydown', e => {
    const bs = $$('button', pop), i = bs.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closePop(true); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
  });
  document.addEventListener('click', e => { if (popFor && !pop.contains(e.target)) closePop(); });
  window.addEventListener('resize', () => closePop());

  /* ---------- hero stack ---------- */
  const stack = $('#stack');
  const heartSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.5 1.1 4.4 2.5.2.3.6.3.8 0 .9-1.4 2.3-2.5 4.4-2.5 3.7 0 5.8 3.8 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
  function cardHTML(x, i) {
    const it = x.it, t = T(), sub = priceSub(it), liked = S.fav.includes(it.id);
    return `<div class="card" data-i="${i}" data-id="${esc(it.id)}">
      <img src="${it.img}" alt="${esc(itemName(it))}" ${i > 2 ? 'loading="lazy"' : ''} decoding="async" draggable="false">
      ${it.video ? `<video muted playsinline loop preload="none" poster="${it.img}" data-src="${it.video}"></video>` : ''}
      <span class="price-st">${priceLabel(it)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>
      <span class="gloss" aria-hidden="true"></span>
      ${S.over && i === 0 ? `<span class="over-note">${esc(t.over)}</span>` : ''}
      <div class="card-info">
        <p class="card-why"><b>${esc(t.why_t)}</b>${esc(reasonFor(x))}</p>
        <div class="card-row">
          <button type="button" class="heart" data-fav="${esc(it.id)}" aria-pressed="${liked}" aria-label="${esc(liked ? t.liked : t.like)}">${heartSVG}</button>
          <button type="button" class="btn solid" data-order="${esc(it.id)}">${esc(t.order)}</button>
          <span class="card-code">${esc(it.src === 'ig' ? t.code + '\n' + it.id : itemName(it))}</span>
        </div>
      </div></div>`;
  }
  function layoutStack() {
    const n = S.matches.length;
    $$('.card', stack).forEach(c => {
      if (c.classList.contains('leaving')) return;
      const i = +c.dataset.i, off = (i - S.idx + n) % n;
      const pos = [
        'translate3d(0,0,60px) rotateY(0deg) rotateZ(0deg)',
        'translate3d(-17%,1%,-60px) rotateY(24deg) rotateZ(-7deg)',
        'translate3d(17%,3%,-150px) rotateY(-24deg) rotateZ(7deg)'
      ];
      c.style.transform = off < 3 ? pos[off] : 'translate3d(0,6%,-320px) rotateY(0deg) scale(.9)';
      c.style.opacity = off < 3 ? '' : '0';
      c.style.zIndex = String(10 - Math.min(off, 9));
      c.classList.toggle('top', off === 0);
      c.classList.toggle('back', off > 0);
      c.setAttribute('aria-hidden', off === 0 ? 'false' : 'true');
      $$('button', c).forEach(b => b.tabIndex = off === 0 ? 0 : -1);
      const v = c.querySelector('video');
      if (v) {
        if (off === 0 && !RM) {
          if (!v.src) v.src = v.dataset.src;
          v.play().then(() => v.classList.add('on')).catch(() => {});
        } else { v.pause(); v.classList.remove('on'); }
      }
    });
    $('#stackCount').textContent = (S.idx + 1) + ' / ' + n;
    $$('#thumbs button').forEach((b, i) => b.setAttribute('aria-current', String(i === S.idx)));
  }
  function renderMatches(soft) {
    S.matches = computeMatches();
    if (S.idx >= S.matches.length) S.idx = 0;
    const old = $$('.card', stack);
    if (soft) { old.forEach(c => c.remove()); }
    else old.forEach((c, k) => {
      if (RM) { c.remove(); return; }
      const dir = k % 2 ? 1 : -1;
      c.classList.add('leaving');
      c.style.transitionDelay = (k * 28) + 'ms';
      c.style.transform = `translate3d(${dir * 150}%, ${18 + k * 6}%, ${260 - k * 40}px) rotateY(${dir * 80}deg) rotateZ(${dir * 28}deg)`;
      setTimeout(() => c.remove(), 700);
    });
    const frag = document.createElement('div');
    frag.innerHTML = S.matches.map(cardHTML).join('');
    const fresh = [...frag.children];
    fresh.forEach((c, k) => { if (!soft && !RM) { c.classList.add('entering'); c.style.transitionDelay = (240 + (2 - Math.min(k, 2)) * 110) + 'ms'; } stack.appendChild(c); });
    layoutStack();
    if (!soft && !RM) requestAnimationFrame(() => requestAnimationFrame(() => {
      fresh.forEach(c => c.classList.remove('entering'));
      setTimeout(() => fresh.forEach(c => c.style.transitionDelay = ''), 900);
    }));
    $('#thumbs').innerHTML = S.matches.map((x, i) => `<button type="button" data-go="${i}" aria-label="${i + 1}"><img src="${x.it.img}" alt="" loading="lazy"></button>`).join('');
    $$('#thumbs button').forEach((b, i) => b.setAttribute('aria-current', String(i === S.idx)));
  }
  function stackGo(d) { const n = S.matches.length; if (!n) return; S.idx = (S.idx + d + n) % n; layoutStack(); }
  $('#stackPrev').addEventListener('click', () => stackGo(-1));
  $('#stackNext').addEventListener('click', () => stackGo(1));
  $('#thumbs').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { S.idx = +b.dataset.go; layoutStack(); } });
  stack.addEventListener('click', e => {
    const fav = e.target.closest('[data-fav]'), ord = e.target.closest('[data-order]'), card = e.target.closest('.card');
    if (fav) { toggleFav(fav.dataset.fav); return; }
    if (ord) { if (!S.fav.includes(ord.dataset.order)) addFav(ord.dataset.order, true); openComposer([ord.dataset.order]); return; }
    if (card && card.classList.contains('back')) { S.idx = +card.dataset.i; layoutStack(); }
  });
  // 3D tilt of the whole fan toward the pointer (and device tilt on phones, where no permission is needed)
  (() => {
    if (RM) return;
    const area = $('#finder');
    let tx = 0, ty = 0, cx = 0, cy = 0, run = false, gx = 50, gy = 30;
    const loop = () => {
      cx += (tx - cx) * .08; cy += (ty - cy) * .08;
      stack.style.transform = `rotateX(${cy.toFixed(2)}deg) rotateY(${cx.toFixed(2)}deg)`;
      stack.style.setProperty('--gx', (50 + cx * 3.2).toFixed(1) + '%');
      stack.style.setProperty('--gy', (30 - cy * 3.2).toFixed(1) + '%');
      if (Math.abs(tx - cx) > .02 || Math.abs(ty - cy) > .02) requestAnimationFrame(loop); else run = false;
    };
    const kick = () => { if (!run) { run = true; requestAnimationFrame(loop); } };
    area.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = stack.getBoundingClientRect();
      const px = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      const py = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      tx = Math.max(-1, Math.min(1, px * 2)) * 14; ty = Math.max(-1, Math.min(1, -py * 2)) * 10; kick();
    });
    area.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (coarse && 'DeviceOrientationEvent' in window && typeof DeviceOrientationEvent.requestPermission !== 'function') {
      let base = null;
      window.addEventListener('deviceorientation', e => {
        if (e.gamma == null) return;
        if (base === null) base = e.beta;
        tx = Math.max(-12, Math.min(12, e.gamma * .5)); ty = Math.max(-8, Math.min(8, (base - e.beta) * .4)); kick();
      }, { passive: true });
    }
  })();
  // swipe the hero stack on touch too
  (() => {
    let x0 = null, y0 = 0;
    stack.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; x0 = e.clientX; y0 = e.clientY; });
    stack.addEventListener('pointerup', e => {
      if (x0 === null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) stackGo(dx < 0 ? 1 : -1);
    });
  })();

  /* ---------- favourites ---------- */
  function saveFav() { store.set('f4fav', S.fav); }
  function bumpTray() { const b = $('#trayBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  function addFav(id, quiet) { if (!S.fav.includes(id)) { S.fav.push(id); saveFav(); renderTray(); syncHearts(); bumpTray(); if (!quiet) toast(T().addedTray); } }
  function removeFav(id) { S.fav = S.fav.filter(x => x !== id); saveFav(); renderTray(); syncHearts(); }
  function toggleFav(id) { if (S.fav.includes(id)) { removeFav(id); toast(T().removedTray); } else addFav(id); }
  function syncHearts() {
    const t = T();
    $$('[data-fav]').forEach(b => { const on = S.fav.includes(b.dataset.fav); b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? t.liked : t.like); });
  }
  function renderTray() {
    const t = T(), favs = S.fav.map(id => S.byId[id]).filter(Boolean);
    $('#trayCount').textContent = favs.length;
    $('#miniList').innerHTML = favs.slice(-9).reverse().map(it => `<button type="button" data-open-drawer aria-label="${esc(itemName(it))}"><img src="${it.img}" alt="" loading="lazy"><b>${fmt(Math.round(it.price / 1000))}k</b></button>`).join('');
    $('#miniEmpty').hidden = favs.length > 0;
    $('#miniOrder').disabled = !favs.length;
    $('#drawerList').innerHTML = favs.map(it => `<div class="ditem"><img src="${it.img}" alt="" loading="lazy"><div><b>${priceLabel(it)}</b><small>${esc(itemName(it))}</small></div><button type="button" class="x" data-rm="${esc(it.id)}" aria-label="${esc(t.remove)}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`).join('');
    $('#drawerEmpty').hidden = favs.length > 0;
    $('#drawerOrder').disabled = !favs.length;
  }
  const drawer = $('#drawer');
  let lastFocus = null;
  function openDrawer() { lastFocus = document.activeElement; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); setTimeout(() => $('.drawer-panel [data-close]').focus(), 50); }
  function closeDrawer() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); lastFocus && lastFocus.focus && lastFocus.focus(); }
  $('#trayBtn').addEventListener('click', openDrawer);
  $('#miniList').addEventListener('click', e => { if (e.target.closest('[data-open-drawer]')) openDrawer(); });
  drawer.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) closeDrawer();
    const rm = e.target.closest('[data-rm]'); if (rm) removeFav(rm.dataset.rm);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });
  $('#drawerOrder').addEventListener('click', () => { closeDrawer(); openComposer(); });
  $('#miniOrder').addEventListener('click', () => openComposer());

  /* ---------- swipe deck ---------- */
  const deckEl = $('#deck');
  const FILTERS = {
    all: () => true,
    basket: it => it.format === 'basket',
    red: it => it.color === 'red',
    soft: it => ['pink', 'peach', 'white'].includes(it.color) && it.scale !== 'huge',
    huge: it => it.scale === 'huge',
    b1: it => it.price <= 1000000
  };
  function buildDeck() {
    const pool = S.items.filter(it => it.src !== 'bride' && FILTERS[S.deckFilter](it));
    // deterministic shuffle so the deck feels mixed (prices and formats alternate)
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const arr = pool.slice();
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    S.deck = arr; S.deckIdx = 0; S.history = [];
  }
  function renderFilters() {
    const t = T().filters;
    $('#filters').innerHTML = Object.keys(FILTERS).map(k => `<button type="button" data-f="${k}" aria-pressed="${S.deckFilter === k}">${esc(t[k])}</button>`).join('');
  }
  $('#filters').addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    S.deckFilter = b.dataset.f; renderFilters(); buildDeck(); renderDeck();
  });
  /* 3D deck: cards stacked in depth; the top one is driven by spring physics */
  const DEPTH = d => `translate3d(0, ${d * 18}px, ${-d * 80}px) rotateX(${d * 3}deg)`;
  function dcardHTML(it, depth) {
    const t = T(), tg = t.tags, sub = priceSub(it);
    return `<div class="dcard" data-id="${esc(it.id)}" data-depth="${depth}" style="z-index:${10 - depth};transform:${DEPTH(depth)}">
      <img src="${it.img}" alt="${esc(itemName(it))}" decoding="async" draggable="false">
      <span class="sheen" aria-hidden="true"></span>
      <span class="price-st">${priceLabel(it)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>
      <span class="stamp yes">${esc(t.stampLike)}</span><span class="stamp no">${esc(t.stampNope)}</span>
      <div class="dcard-meta"><span>${esc(tg.format[it.format])}</span><span>${esc(tg.color[it.color])}</span><span>${esc(tg.scale[it.scale])}</span></div>
    </div>`;
  }
  function renderDeck() {
    const t = T();
    const rest = S.deck.slice(S.deckIdx, S.deckIdx + 3);
    if (!rest.length) {
      deckEl.innerHTML = `<div class="deck-end"><p>${esc(t.deckEnd)}</p><button type="button" class="btn solid" id="deckAgain">${esc(t.deckAgain)}</button></div>`;
      $('#deckAgain').addEventListener('click', () => { buildDeck(); renderDeck(); });
    } else {
      deckEl.innerHTML = rest.map((it, d) => dcardHTML(it, d)).reverse().join('');
      bindDrag(deckEl.querySelector('[data-depth="0"]'));
    }
    $('#btnUndo').disabled = !S.history.length;
    const nx = S.deck[S.deckIdx + 3]; if (nx) { const im = new Image(); im.src = nx.img; }
  }
  let busy = false;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // lean (rotateY) follows velocity, roll (rotateZ) follows offset, like a real card held at the bottom
  function poseCard(card, s) {
    const ry = clamp(s.x * .045 + s.lean * 22, -38, 38), rz = clamp(s.x * .05, -24, 24), rx = clamp(-s.y * .04, -12, 12) + s.tiltX;
    card.style.transform = `translate3d(${s.x.toFixed(1)}px, ${(s.y * .45).toFixed(1)}px, ${s.z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${(ry + s.tiltY).toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg)`;
    const k = clamp(Math.abs(s.x) / 120, 0, 1);
    const yes = card.querySelector('.stamp.yes'), no = card.querySelector('.stamp.no');
    if (yes) { yes.style.opacity = s.x > 0 ? k : 0; no.style.opacity = s.x < 0 ? k : 0; }
    // the cards behind rise out of depth as the top one leaves
    const b = deckEl.querySelector('[data-depth="1"]');
    if (b) b.style.transform = `translate3d(0, ${18 - 18 * k}px, ${-80 + 80 * k}px) rotateX(${3 - 3 * k}deg)`;
    const c = deckEl.querySelector('[data-depth="2"]');
    if (c) c.style.transform = `translate3d(0, ${36 - 18 * k}px, ${-160 + 80 * k}px) rotateX(${6 - 3 * k}deg)`;
  }
  function fly(card, dir, vx0 = 0, vy0 = 0) {
    if (busy || !card) return; busy = true;
    const it = S.byId[card.dataset.id];
    S.history.push({ id: it.id, dir });
    if (dir > 0) addFav(it.id, true);
    const st = card._s || { x: 0, y: 0, z: 0, lean: 0, tiltX: 0, tiltY: 0 };
    st.tiltX = 0; st.tiltY = 0;
    const finish = () => { S.deckIdx++; busy = false; renderDeck(); };
    if (RM) { card.style.opacity = '0'; setTimeout(finish, 150); return; }
    let vx = dir * Math.max(Math.abs(vx0), 1.5), vy = vy0 || -.25, last = performance.now();
    const w = deckEl.offsetWidth;
    const step = now => {
      const dt = Math.min(now - last, 32); last = now;
      vx *= 1.025; vy += .0025 * dt; // accelerate out, slight gravity
      st.x += vx * dt; st.y += vy * dt; st.z += .25 * dt; st.lean += (clamp(vx / 3, -1, 1) - st.lean) * .2;
      poseCard(card, st);
      card.style.opacity = String(clamp(1.6 - Math.abs(st.x) / (w * 1.2), 0, 1));
      if (Math.abs(st.x) < w * 1.8) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
  }
  function springBack(card, st) {
    if (card._spring) return; card._spring = true;
    let vx = 0, vy = 0, last = performance.now();
    const K = 210, C = 15; // stiffness / damping per second: a little overshoot, then settles
    const step = now => {
      if (card._drag) { card._spring = false; return; }
      const dt = Math.min((now - last) / 1000, .032); last = now;
      vx += (-K * st.x - C * vx) * dt; vy += (-K * st.y - C * vy) * dt;
      st.x += vx * dt; st.y += vy * dt; st.z += (0 - st.z) * .2; st.lean += (vx / 2400 - st.lean) * .3;
      st.tiltX *= .85; st.tiltY *= .85;
      poseCard(card, st);
      if (Math.abs(st.x) + Math.abs(st.y) + Math.abs(vx) + Math.abs(vy) + Math.abs(st.tiltX) + Math.abs(st.tiltY) > .4) requestAnimationFrame(step);
      else { st.x = st.y = st.lean = st.tiltX = st.tiltY = 0; st.z = 0; poseCard(card, st); card._spring = false; }
    };
    requestAnimationFrame(step);
  }
  function bindDrag(card) {
    if (!card) return;
    const st = card._s = { x: 0, y: 0, z: 0, lean: 0, tiltX: 0, tiltY: 0 };
    const sheen = card.querySelector('.sheen');
    let sx = 0, sy = 0, samples = [], vxs = 0;
    const setSheen = (e, a) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--sx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      card.style.setProperty('--sy', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      sheen.style.opacity = a;
    };
    card.addEventListener('pointerdown', e => {
      if (busy || (e.button !== undefined && e.button !== 0)) return;
      card._drag = true; sx = e.clientX - st.x; sy = e.clientY - st.y; samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      card.setPointerCapture(e.pointerId); st.tiltX = st.tiltY = 0; st.z = 30;
      card.classList.add('held'); setSheen(e, .9);
    });
    card.addEventListener('pointermove', e => {
      if (!card._drag) {
        if (e.pointerType === 'mouse' && !busy && !RM && !card._spring) { // idle hover tilt
          const r = card.getBoundingClientRect();
          st.tiltY = ((e.clientX - r.left) / r.width - .5) * 14; st.tiltX = -((e.clientY - r.top) / r.height - .5) * 10;
          poseCard(card, st); setSheen(e, .55);
        }
        return;
      }
      const now = performance.now();
      samples.push({ x: e.clientX, y: e.clientY, t: now }); if (samples.length > 6) samples.shift();
      const a = samples[0], dt = Math.max(now - a.t, 1);
      vxs = (e.clientX - a.x) / dt;
      st.x = e.clientX - sx; st.y = e.clientY - sy; st.lean += (clamp(vxs / 2.2, -1, 1) - st.lean) * .25;
      poseCard(card, st); setSheen(e, .9);
    });
    card.addEventListener('pointerleave', () => { if (!card._drag && !busy) { sheen.style.opacity = 0; springBack(card, st); } });
    const end = () => {
      if (!card._drag) return; card._drag = false; card.classList.remove('held'); sheen.style.opacity = 0;
      const a = samples[0], z = samples[samples.length - 1], dt = Math.max(z.t - a.t, 1);
      const vx = (z.x - a.x) / dt, vy = (z.y - a.y) / dt;
      if (st.x > 110 || (vx > .5 && st.x > 30)) fly(card, 1, vx, vy);
      else if (st.x < -110 || (vx < -.5 && st.x < -30)) fly(card, -1, vx, vy);
      else springBack(card, st);
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }
  function nudgeAndFly(dir) {
    const card = deckEl.querySelector('[data-depth="0"]'); if (!card || busy) return;
    fly(card, dir, dir * 1.2, -.2);
  }
  $('#btnLike').addEventListener('click', () => nudgeAndFly(1));
  $('#btnNope').addEventListener('click', () => nudgeAndFly(-1));
  function undo() {
    if (busy || !S.history.length) return;
    const h = S.history.pop();
    if (h.dir > 0) removeFav(h.id);
    S.deckIdx = Math.max(0, S.deckIdx - 1);
    renderDeck();
    const c = deckEl.querySelector('[data-depth="0"]');
    if (c && !RM) { const st = c._s; st.x = h.dir * deckEl.offsetWidth * 1.3; st.y = -80; st.lean = -h.dir * .6; poseCard(c, st); springBack(c, st); }
  }
  $('#btnUndo').addEventListener('click', undo);
  document.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea,select,dialog') || popFor) return;
    const r = $('#swipe').getBoundingClientRect();
    const inView = r.top < window.innerHeight * .6 && r.bottom > window.innerHeight * .4;
    if (!inView && document.activeElement !== deckEl) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); nudgeAndFly(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeAndFly(-1); }
    else if (e.key === 'Backspace') { e.preventDefault(); undo(); }
  });

  /* ---------- marquee ---------- */
  function renderMarquee() {
    const words = T().marquee;
    const one = words.map(w => `<span>${esc(w)}</span><em>✺</em>`).join('');
    $('#marquee').innerHTML = one + one;
  }

  /* ---------- occasions ---------- */
  const MONTHS = {
    ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']
  };
  const OCC = [
    { k: 'feb14', m: 1, d: 14, set: { who: 'love', why: 'date' } },
    { k: 'm8', m: 2, d: 8, set: { why: 'm8' } },
    { k: 'sep1', m: 8, d: 1, set: { who: 'teacher', why: 'tday' } },
    { k: 'oct1', m: 9, d: 1, set: { who: 'teacher', why: 'tday' } },
    { k: 'ny', m: 11, d: 31, set: { why: 'newyear' } }
  ];
  function nextDate(o, now) {
    let d = new Date(now.getFullYear(), o.m, o.d);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (d < today) d = new Date(now.getFullYear() + 1, o.m, o.d);
    return d;
  }
  let cdTimer = null;
  // real Fiona posts used on the back face of each occasion tile
  const OCC_IMG = { feb14: 'Dbl-ZyrN7rs', m8: 'DeFdqZQRTWT', sep1: 'DaSXMaONLVc', oct1: 'DZckccANOXQ', ny: 'DaLZNqKNhzY', bday: 'Dd8rq99tA9x' };
  function tileHTML(k, front, near) {
    const t = T();
    return `<button type="button" class="otile${near ? ' near' : ''}" data-occ="${k}">
      <span class="oface front">${front}</span>
      <span class="oface back" style="background-image:url('media/p/${OCC_IMG[k]}.jpg')"><span class="oback-t">${esc(t.occ[k])}</span><span class="oback-cta">${esc(t.occPick)}</span></span>
    </button>`;
  }
  /* split-flap digit pair: static top/bottom halves + two animated leaves */
  function flapHTML(v, label) {
    return `<span class="flap" data-v="${v}"><span class="fl-top">${v}</span><span class="fl-bot">${v}</span><span class="fl-leaf-top">${v}</span><span class="fl-leaf-bot">${v}</span></span><small>${label}</small>`;
  }
  function setFlap(el, v) {
    if (el.dataset.v === v) return;
    const old = el.dataset.v; el.dataset.v = v;
    const top = el.querySelector('.fl-top'), bot = el.querySelector('.fl-bot'), lt = el.querySelector('.fl-leaf-top'), lb = el.querySelector('.fl-leaf-bot');
    if (RM) { top.textContent = bot.textContent = lt.textContent = lb.textContent = v; return; }
    top.textContent = v; lt.textContent = old; lb.textContent = v; bot.textContent = old;
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    clearTimeout(el._t); el._t = setTimeout(() => { bot.textContent = v; lt.textContent = v; el.classList.remove('go'); }, 620);
  }
  function renderOcc() {
    const t = T(), now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const list = OCC.map(o => { const d = nextDate(o, now); return { ...o, date: d, days: Math.round((d - today) / 864e5) }; }).sort((a, b) => a.days - b.days);
    const near = list[0];
    const tiles = list.map(o => tileHTML(o.k, `<span class="od">${o.d}</span><span class="om">${MONTHS[S.lang][o.m]}</span>
        <span class="on">${esc(t.occ[o.k])}</span>
        <span class="oin">${o.days === 0 ? esc(t.occToday) : esc(t.occIn.replace('{d}', o.days))}</span>`, o === near));
    tiles.push(tileHTML('bday', `<span class="od">365</span><span class="om">${esc(t.occBday)}</span><span class="on">${esc(t.occ.bday)}</span><span class="oin">${esc(t.occPick)}</span>`, false));
    $('#occStrip').innerHTML = tiles.join('');
    const u = t.units;
    $('#occNext').innerHTML = `${esc(t.occNext.replace('{name}', t.occ[near.k]))}<span class="cd" id="cd">${[u.d, u.h, u.m, u.s].map(l => `<span class="cdu">${flapHTML('00', l)}</span>`).join('')}</span>`;
    const flaps = $$('#cd .flap');
    const tick = () => {
      const ms = Math.max(0, near.date - new Date());
      const vals = [Math.floor(ms / 864e5), Math.floor(ms / 36e5) % 24, Math.floor(ms / 6e4) % 60, Math.floor(ms / 1e3) % 60];
      vals.forEach((v, i) => setFlap(flaps[i], String(v).padStart(2, '0')));
    };
    tick(); clearInterval(cdTimer); cdTimer = setInterval(tick, 1000);
  }
  $('#occStrip').addEventListener('click', e => {
    const b = e.target.closest('[data-occ]'); if (!b) return;
    const o = OCC.find(x => x.k === b.dataset.occ);
    if (o) Object.assign(S, o.set); else S.why = 'bday';
    S.idx = 0; renderChips('why'); renderChips('who'); renderMatches();
    b.classList.add('picked');
    setTimeout(() => { b.classList.remove('picked'); $('#finder').scrollIntoView({ behavior: RM ? 'auto' : 'smooth' }); }, RM ? 0 : 420);
  });
  // 3D tilt toward the pointer on every tile (desktop); flip happens in CSS on hover/focus
  function tiltOn(container, sel, max = 10) {
    if (RM) return;
    container.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest(sel); if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--rx', (-((e.clientY - r.top) / r.height - .5) * max).toFixed(2) + 'deg');
      el.style.setProperty('--ry', (((e.clientX - r.left) / r.width - .5) * max).toFixed(2) + 'deg');
      el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
    container.addEventListener('pointerout', e => {
      const el = e.target.closest(sel); if (el && !el.contains(e.relatedTarget)) { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); }
    });
  }
  tiltOn($('#occStrip'), '.otile', 12);

  /* ---------- customer photos: WebGL helix with flat-wall fallback ---------- */
  const REVIEWS = [0, 13, 3, 16, 11, 20, 4, 43, 28, 12, 45, 63, 40, 44, 15];
  const HELIX = [0, 2, 3, 4, 5, 7, 10, 11, 12, 13, 14, 15, 16, 18, 20, 21, 25, 26, 28, 32, 34, 39, 40, 43, 44, 45, 47, 50, 52, 55, 57, 58, 62, 63, 66, 68];
  const pad2 = n => String(n).padStart(2, '0');
  function renderWall() {
    const cols = [[], [], [], [], []];
    REVIEWS.forEach((n, i) => cols[i % 5].push(n));
    $('#wall').innerHTML = cols.map(c => `<div class="wcol">${c.map(n => `<figure><img src="media/hl/reviews_${pad2(n)}.jpg" alt="" loading="lazy" decoding="async"></figure>`).join('')}</div>`).join('');
  }
  function parallax() {
    if (RM) return;
    const wall = $('#wall'), cols = $$('.wcol', wall), speeds = [-40, 55, -15, 45, -30];
    let ticking = false, active = false;
    new IntersectionObserver(es => { active = es[0].isIntersecting; }).observe(wall);
    const upd = () => {
      ticking = false; if (!active) return;
      const r = wall.getBoundingClientRect();
      const p = (window.innerHeight - r.top) / (window.innerHeight + r.height) - .5;
      cols.forEach((c, i) => c.style.transform = `translateY(${p * speeds[i] * 2}px)`);
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
  }
  function canWebGL() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
  function lowPower() {
    const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
    return (mem && mem <= 2) || (cores && cores <= 2) || (navigator.connection && navigator.connection.saveData);
  }
  const lightbox = $('#lightbox');
  function openPhoto(i) {
    $('#lbImg').src = `media/hl/reviews_${pad2(HELIX[i])}.jpg`;
    lightbox._t = performance.now();
    if (typeof lightbox.showModal === 'function') lightbox.showModal(); else lightbox.setAttribute('open', '');
  }
  lightbox.addEventListener('click', e => { if (performance.now() - (lightbox._t || 0) < 450) return; if (e.target === lightbox || e.target.closest('[data-lb-close]')) lightbox.close(); });
  function initPhotos() {
    renderWall();
    const stage = $('#helix');
    if (RM || !canWebGL() || lowPower()) { document.body.classList.add('no-helix'); parallax(); return; }
    const io = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      import(HELIX_URL).then(m => {
        m.mountHelix(stage, HELIX.map(n => `img/rev/r${pad2(n)}.jpg`), { onOpen: openPhoto });
        document.body.classList.add('has-helix');
      }).catch(err => { console.warn('helix fallback', err); document.body.classList.add('no-helix'); parallax(); });
    }, { rootMargin: '1600px 0px' });
    io.observe(stage);
  }

  /* ---------- vases: 3D coverflow driven by scroll position ---------- */
  const VASES = [
    ['Ceramic 1', 450000], ['Ceramic 2', 350000], ['Ceramic 3', 450000], ['Ceramic 4', 350000], ['Ceramic 5', 500000], ['Ceramic 6', 450000], ['Ceramic 7', 350000],
    ['Crystal 1', 200000], ['Crystal 2', 250000], ['Crystal 3', 400000], ['Crystal 4', 375000], ['Ceramic 8', 400000], ['Ceramic 9', 450000], ['Ceramic 10', 450000], ['Ceramic 11', 300000],
    ['petals', 59000]
  ].map(([n, p], i) => ({ id: 'v' + i, n, p, img: `img/vase_${pad2(i)}.jpg` }));
  const vName = v => v.n === 'petals' ? T().petals : v.n;
  const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>', ICON_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const vaddInner = on => `${on ? ICON_OK : ICON_PLUS}<span>${esc(on ? T().vAdded : T().vAdd)}</span>`;
  function renderVases() {
    const t = T();
    $('#vRow').innerHTML = VASES.map(v => { const on = S.vases.includes(v.id); return `<article class="vcard"><div class="vtilt">
      <div class="vimg"><img src="${v.img}" alt="${esc(vName(v))}" loading="lazy"><span class="vglare" aria-hidden="true"></span></div>
      <h3>${esc(vName(v))}</h3><p class="vp">${money(v.p)}</p>${v.n === 'petals' ? `<p class="vmin">${esc(t.petalsMin)}</p>` : ''}
      <button type="button" class="vadd" data-v="${v.id}" aria-pressed="${on}">${vaddInner(on)}</button></div></article>`; }).join('');
    coverflow();
  }
  function toggleVase(id) {
    const on = S.vases.includes(id);
    S.vases = on ? S.vases.filter(x => x !== id) : [...S.vases, id];
    store.set('f4vases', S.vases);
    const b = $(`[data-v="${id}"]`, $('#vRow'));
    if (b) {
      b.setAttribute('aria-pressed', String(!on)); b.innerHTML = vaddInner(!on);
      const card = b.closest('.vtilt'); card.classList.remove('spin'); void card.offsetWidth; if (!on && !RM) card.classList.add('spin');
    }
    toast(on ? T().vaseRemoved : T().vaseAdded);
    if ($('#composer').open) renderComposer();
  }
  let cfRaf = 0;
  function coverflow() {
    if (RM || cfRaf) return;
    cfRaf = requestAnimationFrame(() => {
      cfRaf = 0;
      const row = $('#vRow'), rr = row.getBoundingClientRect(), mid = rr.left + rr.width / 2;
      $$('.vcard', row).forEach(c => {
        const r = c.getBoundingClientRect();
        const d = Math.max(-1.4, Math.min(1.4, (r.left + r.width / 2 - mid) / (rr.width / 2)));
        c.style.setProperty('--cf-ry', (-d * 22).toFixed(2) + 'deg');
        c.style.setProperty('--cf-z', (-Math.abs(d) * 90).toFixed(1) + 'px');
      });
    });
  }
  $('#vRow').addEventListener('scroll', coverflow, { passive: true });
  window.addEventListener('resize', coverflow);
  tiltOn($('#vRow'), '.vtilt', 14);
  $('#vRow').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) toggleVase(b.dataset.v); });
  $('#vPrev').addEventListener('click', () => $('#vRow').scrollBy({ left: -520, behavior: RM ? 'auto' : 'smooth' }));
  $('#vNext').addEventListener('click', () => $('#vRow').scrollBy({ left: 520, behavior: RM ? 'auto' : 'smooth' }));

  /* ---------- peony + bride ---------- */
  function favBadge(id) {
    const on = S.fav.includes(id);
    return `<span class="fav-dot" data-fav="${esc(id)}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${esc(on ? T().liked : T().like)}">${heartSVG}</span>`;
  }
  function renderPeony() {
    $('#peonyRow').innerHTML = S.items.filter(i => i.src === 'peony').map(it => `<div class="pcard"><img src="${it.img}" alt="${esc(itemName(it))}" loading="lazy">${favBadge(it.id)}<span class="pl"><b>${money(it.price)}</b>${it.stems} ${esc(T().pcs)}</span></div>`).join('');
  }
  function renderBride() {
    $('#brideGrid').innerHTML = S.items.filter(i => i.src === 'bride').map(it => `<div class="bcard"><img src="${it.img}" alt="${esc(itemName(it))}" loading="lazy">${it.video ? `<video muted playsinline loop preload="none" poster="${it.img}" data-src="${it.video}"></video>` : ''}${favBadge(it.id)}<span class="pl">${money(it.price)}</span></div>`).join('');
    observeVideos($$('#brideGrid video'));
  }
  $('#peony').addEventListener('click', e => { const f = e.target.closest('[data-fav]'); if (f) toggleFav(f.dataset.fav); });
  $('#peony').addEventListener('keydown', e => { const f = e.target.closest('[data-fav]'); if (f && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleFav(f.dataset.fav); } });
  let vio = null;
  function observeVideos(vs) {
    if (RM || !('IntersectionObserver' in window)) return;
    if (!vio) vio = new IntersectionObserver(es => es.forEach(en => {
      const v = en.target;
      if (en.isIntersecting) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } else v.pause();
    }), { threshold: .35 });
    vs.forEach(v => vio.observe(v));
  }

  /* ---------- composer ---------- */
  const dlg = $('#composer'), form = $('#compForm');
  let compSel = new Set();
  function fillSelects() {
    const t = T();
    const ts = $('#timeSel'), cur = ts.value;
    const slots = [];
    for (let h = 9; h <= 24; h++) { const a = String(h % 24).padStart(2, '0') + ':00', b = String((h + 1) % 24).padStart(2, '0') + ':00'; slots.push(a + '–' + b); }
    ts.innerHTML = `<option value="asap">${esc(t.asap)}</option>` + slots.map(s => `<option>${s}</option>`).join('');
    if (cur) ts.value = cur;
    const ds = $('#distSel'), dv = ds.selectedIndex;
    ds.innerHTML = `<option value="">${esc(t.pickDistrict)}</option>` + t.districts.map((d, i) => `<option value="${i}">${esc(d)}</option>`).join('');
    if (dv > 0) ds.selectedIndex = dv;
  }
  function todayISO() { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
  function openComposer(only) {
    compSel = new Set(only && only.length ? only : S.fav);
    if (!form.date.value) form.date.value = todayISO();
    form.date.min = todayISO();
    renderComposer();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function buildMessage() {
    const t = T(), m = t.msg, f = form;
    const items = S.fav.map(id => S.byId[id]).filter(it => it && compSel.has(it.id));
    const vs = VASES.filter(v => S.vases.includes(v.id));
    const lines = [m.hello];
    items.forEach((it, i) => {
      lines.push(`${i + 1}) ${itemName(it)} — ${priceLabel(it)}`);
      if (it.src === 'ig') lines.push(`   https://www.instagram.com/p/${it.id}/`);
    });
    if (vs.length) { lines.push(m.extras); vs.forEach(v => lines.push(`• ${vName(v)} — ${money(v.p)}${v.n === 'petals' ? ' (' + t.petalsMin + ')' : ''}`)); }
    const total = items.reduce((a, it) => a + it.price, 0) + vs.reduce((a, v) => a + v.p * (v.n === 'petals' ? 5 : 1), 0);
    lines.push(`${m.total}: ${money(total)}`, '');
    lines.push(`${m.occasion}: ${chipText('why')}`, `${m.forWhom}: ${t.whoTo[S.who]}`);
    if (f.to.value.trim()) lines.push(`${m.to}: ${f.to.value.trim()}`);
    if (f.toPhone.value.trim()) lines.push(`${m.phone}: ${f.toPhone.value.trim()}`);
    const when = (f.date.value ? f.date.value.split('-').reverse().join('.') + ', ' : '') + (f.time.value === 'asap' ? t.asap : f.time.value);
    lines.push(`${m.when}: ${when}`);
    if (f.district.value !== '') lines.push(`${m.district}: ${t.districts[+f.district.value]}`);
    if (f.addr.value.trim()) lines.push(`${m.addr}: ${f.addr.value.trim()}`);
    if (f.card.value.trim()) lines.push(`${m.card}: «${f.card.value.trim()}»`);
    if (f.photo.checked) lines.push(m.photo);
    if (f.anon.checked) lines.push(m.anon);
    return { text: lines.join('\n'), total, count: items.length };
  }
  function renderComposer() {
    const t = T();
    const favs = S.fav.map(id => S.byId[id]).filter(Boolean);
    $('#compItems').innerHTML = favs.length ? favs.map(it => `<label class="citem"><input type="checkbox" data-sel="${esc(it.id)}" ${compSel.has(it.id) ? 'checked' : ''}><img src="${it.img}" alt=""><span><b>${priceLabel(it)}</b><small>${esc(itemName(it))}</small></span></label>`).join('') : `<p class="mini-empty">${esc(t['tray.empty'])}</p>`;
    $('#compExtras').innerHTML = VASES.filter(v => S.vases.includes(v.id)).map(v => `<div class="cextra"><span>${esc(vName(v))} — ${money(v.p)}</span><button type="button" data-unvase="${v.id}">${esc(t.remove)}</button></div>`).join('');
    updateMsg();
  }
  function updateMsg() {
    const r = buildMessage();
    $('#compMsg').textContent = r.count ? r.text : T()['o.empty'];
    $('#compTotal').textContent = money(r.total);
  }
  form.addEventListener('input', updateMsg);
  form.addEventListener('change', e => {
    const c = e.target.closest('[data-sel]');
    if (c) { c.checked ? compSel.add(c.dataset.sel) : compSel.delete(c.dataset.sel); }
    updateMsg();
  });
  form.addEventListener('click', e => { const u = e.target.closest('[data-unvase]'); if (u) toggleVase(u.dataset.unvase); });
  form.addEventListener('submit', e => e.preventDefault());
  $('#compClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  async function copyMsg(silent) {
    const r = buildMessage(); if (!r.count) { toast(T()['o.empty']); return false; }
    try { await navigator.clipboard.writeText(r.text); }
    catch (err) { const ta = document.createElement('textarea'); ta.value = r.text; ta.style.position = 'fixed'; ta.style.opacity = '0'; dlg.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (x) {} ta.remove(); }
    toast(T()['o.copied']); return true;
  }
  $('#copyBtn').addEventListener('click', () => copyMsg());
  ['#tgBtn', '#igBtn'].forEach(s => $(s).addEventListener('click', () => { copyMsg(true); }));

  /* ---------- toast ---------- */
  let tt = null;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------- header ---------- */
  const top = $('#top');
  const onScroll = () => top.classList.toggle('scrolled', window.scrollY > 30);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  $$('.lang button').forEach(b => b.addEventListener('click', () => { S.lang = b.dataset.lang; store.set('f4lang', S.lang); applyLang(); }));

  /* ---------- boot ---------- */
  fetch('data/bouquets.json').then(r => r.json()).then(items => {
    S.items = items; items.forEach(it => S.byId[it.id] = it);
    S.fav = S.fav.filter(id => S.byId[id]);
    buildDeck(); initPhotos();
    applyLang();
  }).catch(err => { console.error('bouquets.json', err); });
})();
