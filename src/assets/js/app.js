/* ДОМОКУП — 미리보기 사이트 동작 (외부 라이브러리 없음)
 * 장바구니는 이 기기 브라우저(localStorage)에만 저장된다. 서버로 보내지 않는다.
 * 선물: 사료가 1개라도 있으면 주문당 1개(고양이 사료 우선) — 2026-11-02 확정 규칙.
 * 쿠폰: JOYSER 대상만 7%, 다른 쿠폰과 중복 불가.
 */
(function () {
  'use strict';
  var BASE = (window.DK && DK.base) || '/';
  var KEY = 'dk.cart.v1', CKEY = 'dk.coupon.v1';
  var data = null, byS = {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var rub = function (n) { return Math.round(n).toLocaleString('ru-RU') + ' ₽'; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  function pic(i) { return /^https?:/.test(i.t) ? i.t : BASE + i.t; }
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 사생활 모드 등 */ } }
  function cart() { return load(KEY, { v: 1, lines: [] }); }
  function setCart(c) { save(KEY, c); paintCount(); }

  function track(ev, payload) { (window.dataLayer = window.dataLayer || []).push({ event: ev, dk: payload || {} }); }

  function getData() {
    if (data) return Promise.resolve(data);
    return fetch(BASE + 'data.json').then(function (r) { return r.json(); }).then(function (d) {
      data = d; d.items.forEach(function (i) { byS[i.s] = i; }); return d;
    });
  }

  // ── 장바구니 ──
  function add(sku, qty) {
    var c = cart(), line = c.lines.filter(function (l) { return l.s === sku; })[0];
    qty = Math.max(1, Math.min(20, qty || 1));
    if (line) line.q = Math.min(20, line.q + qty); else c.lines.push({ s: sku, q: qty });
    setCart(c);
    getData().then(function () { var it = byS[sku]; toast((it ? it.n : 'Товар') + ' — в корзине'); track('add_to_cart', { sku: sku, qty: qty, price: it && it.p }); });
  }

  function paintCount() {
    var n = cart().lines.reduce(function (a, l) { return a + l.q; }, 0);
    $$('[data-cart-count]').forEach(function (el) { el.textContent = n; el.hidden = n === 0; });
  }

  function giftFor(lines) {
    var feeds = lines.map(function (l) { return byS[l.s]; }).filter(function (i) { return i && i.k === 'feed'; });
    if (!feeds.length) return null;
    var sp = feeds.some(function (i) { return i.sp === 'cat'; }) ? 'cat' : 'dog';
    var g = (data.gift && data.gift[sp]) || { name: sp === 'cat' ? 'Игрушка JOYSER для кошки' : 'Игрушка JOYSER для собаки' };
    return { name: g.name, line: (data.gift && data.gift.line) || 'Подарок: игрушка JOYSER' };
  }

  function totals(lines) {
    var sub = 0, joy = 0;
    lines.forEach(function (l) { var i = byS[l.s]; if (!i) return; sub += i.p * l.q; if (i.j) joy += i.p * l.q; });
    var code = load(CKEY, null), cp = null, disc = 0;
    if (code) cp = (data.coupons || []).filter(function (c) { return c.code === code; })[0] || null;
    if (cp && cp.scope === 'joyser') disc = Math.round(joy * cp.pct / 100);
    return { sub: sub, disc: disc, total: sub - disc, coupon: cp, joy: joy };
  }

  function paintTotals() {
    var c = cart(), tt = totals(c.lines), g = giftFor(c.lines);
    $$('[data-totals]').forEach(function (dl) {
      dl.innerHTML = '<dt>Товары</dt><dd>' + rub(tt.sub) + '</dd>' +
        (tt.disc ? '<dt>Промокод ' + esc(tt.coupon.code) + '</dt><dd>−' + rub(tt.disc) + '</dd>' : '') +
        (g ? '<dt>' + esc(g.line) + '</dt><dd>0 ₽</dd>' : '') +
        '<dt>Доставка</dt><dd>рассчитывается при оформлении</dd>' +
        '<dt class="sum">Итого</dt><dd class="sum">' + rub(tt.total) + '</dd>';
    });
  }

  function renderCart() {
    var root = $('[data-cart-page]'); if (!root) return;
    getData().then(function () {
      var c = cart(), list = $('[data-cart-lines]'), g = giftFor(c.lines);
      c.lines = c.lines.filter(function (l) { return byS[l.s]; });
      $('[data-cart-empty]').hidden = c.lines.length > 0;
      $('[data-cart-full]').hidden = c.lines.length === 0;
      list.innerHTML = c.lines.map(function (l) {
        var i = byS[l.s];
        return '<li class="line"><img src="' + esc(pic(i)) + '" alt="" width="72" height="72" loading="lazy">' +
          '<div><a href="' + BASE + i.u + '">' + esc(i.n) + '</a><small>' + rub(i.p) + (i.kg ? ' · ' + i.kg + ' кг' : '') + '</small>' +
          '<div class="qty"><button type="button" data-line="' + esc(l.s) + '" data-d="-1" aria-label="Меньше">−</button><output>' + l.q + '</output><button type="button" data-line="' + esc(l.s) + '" data-d="1" aria-label="Больше">+</button></div></div>' +
          '<b>' + rub(i.p * l.q) + '</b><button type="button" class="rm" data-rm="' + esc(l.s) + '" aria-label="Удалить">×</button></li>';
      }).join('') + (g ? '<li class="line gift"><span class="gift-ic" aria-hidden="true">🎁</span><div><b>' + esc(g.line) + '</b><small>' + esc(g.name) + ' · 1 шт.</small></div><b>0 ₽</b></li>' : '');
      paintTotals();
      var cp = load(CKEY, null), msg = $('[data-coupon-msg]');
      if (cp && msg) { var tt = totals(c.lines); msg.textContent = tt.joy ? 'Промокод ' + cp + ' применён: −7% на игрушки и шлейки JOYSER' : 'Промокод ' + cp + ' действует только на игрушки и шлейки JOYSER'; }
    });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('button, a'); if (!b) return;
    if (b.hasAttribute('data-add')) {
      var q = 1;
      if (b.hasAttribute('data-with-qty')) { var inp = $('[data-qty] input'); q = inp ? parseInt(inp.value, 10) || 1 : 1; }
      add(b.getAttribute('data-add'), q); b.classList.add('pulse'); setTimeout(function () { b.classList.remove('pulse'); }, 400);
    } else if (b.hasAttribute('data-step')) {
      var i2 = b.parentNode.querySelector('input'); i2.value = Math.max(1, Math.min(20, (parseInt(i2.value, 10) || 1) + parseInt(b.getAttribute('data-step'), 10)));
    } else if (b.hasAttribute('data-line')) {
      var c = cart(), s = b.getAttribute('data-line'), d = parseInt(b.getAttribute('data-d'), 10);
      c.lines.forEach(function (l) { if (l.s === s) l.q = Math.max(1, Math.min(20, l.q + d)); }); setCart(c); renderCart();
    } else if (b.hasAttribute('data-rm')) {
      var c2 = cart(), s2 = b.getAttribute('data-rm'); c2.lines = c2.lines.filter(function (l) { return l.s !== s2; }); setCart(c2); renderCart();
    }
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.matches('[data-coupon]')) {
      e.preventDefault();
      getData().then(function () {
        var code = $('#coupon').value.trim().toUpperCase(), msg = $('[data-coupon-msg]');
        var cp = (data.coupons || []).filter(function (c) { return c.code === code; })[0];
        if (!cp) { msg.textContent = 'Такого промокода нет. Проверьте написание.'; return; }
        if (new Date() > new Date(cp.until + 'T23:59:59+03:00')) { msg.textContent = 'Срок действия промокода истёк.'; return; }
        save(CKEY, cp.code); renderCart();
      });
    } else if (f.matches('[data-checkout]')) { e.preventDefault(); }
  });

  // ── 상품 상세 탭 (WAI-ARIA) ──
  $$('[data-tabs]').forEach(function (box) {
    var tabs = $$('[role=tab]', box);
    function sel(t) { tabs.forEach(function (x) { var on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; $('#' + x.getAttribute('aria-controls')).hidden = !on; }); t.focus(); }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { sel(t); });
      t.addEventListener('keydown', function (e) { var k = e.key; if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); sel(tabs[(i + (k === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]); } });
    });
  });

  // ── 카탈로그 필터·정렬 ──
  var fbox = $('[data-filters]');
  if (fbox) {
    var state = { cat: '', species: '', flavor: '', kg: '', stock: false }, grid = $('[data-grid]'), cards = $$('.card', grid);
    var apply = function () {
      var n = 0;
      cards.forEach(function (c) {
        var ok = (!state.cat || c.dataset.cat === state.cat) && (!state.species || c.dataset.species === state.species || c.dataset.species === 'both') && (!state.flavor || c.dataset.flavor === state.flavor) && (!state.kg || c.dataset.kg === state.kg) && (!state.stock || c.dataset.stock === '1');
        c.hidden = !ok; if (ok) n++;
      });
      $('[data-count]').textContent = n; $('[data-empty]').hidden = n > 0;
    };
    fbox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-f]'); if (!b) return;
      var f = b.getAttribute('data-f'); state[f] = b.getAttribute('data-v');
      $$('[data-f="' + f + '"]', fbox).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); apply();
    });
    var so = $('[data-stock-only]', fbox); if (so) so.addEventListener('change', function () { state.stock = so.checked; apply(); });
    $('[data-sort]', fbox).addEventListener('change', function (e) {
      var v = e.target.value, val = function (c) { var p = +c.dataset.price, kg = +c.dataset.kg; return v === 'kg' ? (kg ? p / kg : p) : p; };
      var sorted = cards.slice().sort(function (a, b) { return v === 'pop' ? cards.indexOf(a) - cards.indexOf(b) : v === 'desc' ? val(b) - val(a) : val(a) - val(b); });
      sorted.forEach(function (c) { grid.appendChild(c); });
    });
    apply();
  }

  // ── 검색: 키릴·라틴 혼용, 오타 허용 ──
  var LAT = { a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', e: 'е', z: 'з', i: 'и', j: 'й', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', t: 'т', u: 'у', f: 'ф', h: 'х', c: 'к', y: 'ы', w: 'в', x: 'кс', q: 'к' };
  var SYN = [[/пюр\S*|пур\S*|pure|пьюр\S*/g, 'pure'], [/натур\S*|нейчер\S*|nature|нэйчер\S*/g, 'nature'], [/лосос\S*|salmon|сёмг\S*|семг\S*/g, 'лосось'], [/куриц\S*|кур\b|chicken/g, 'курица'], [/ягн\S*|баран\S*|lamb/g, 'ягнёнок'], [/диет\S*|diet|похуд\S*|вес\b/g, 'диета'], [/кош\S*|кот\S*|cat/g, 'кошк'], [/соб\S*|пес\S*|пёс\S*|dog/g, 'собак'], [/игруш\S*|toy/g, 'игрушка'], [/шлейк\S*|harness/g, 'шлейка']];
  function norm(s) { s = String(s).toLowerCase().replace(/ё/g, 'е'); SYN.forEach(function (r) { s = s.replace(r[0], r[1]); }); return s; }
  function translit(s) { return s.replace(/[a-z]/g, function (ch) { return LAT[ch] || ch; }); }
  function score(item, q) {
    var hay = norm(item.n + ' ' + item.f + ' ' + item.s + ' ' + (item.sp === 'cat' ? 'кошк' : item.sp === 'dog' ? 'собак' : 'кошк собак') + (item.k === 'feed' ? ' корм pure nature' : '') + (item.j ? ' joyser' : ''));
    var words = norm(q).split(/\s+/).filter(Boolean), sc = 0;
    for (var i = 0; i < words.length; i++) { var w = words[i]; if (hay.indexOf(w) > -1 || hay.indexOf(translit(w)) > -1) sc += 2; else if (w.length > 3 && hay.indexOf(w.slice(0, -1)) > -1) sc += 1; else return 0; }
    return sc + (item.k === 'feed' ? 1 : 0) + (item.st ? 1 : 0);
  }
  var sform = $('[data-search-form]');
  if (sform) {
    var sin = $('#q'), out = $('[data-search-results]');
    var run = function () {
      var q = sin.value.trim(); if (!q) { out.innerHTML = ''; $('[data-search-empty]').hidden = true; return; }
      getData().then(function () {
        var res = data.items.map(function (i) { return [i, score(i, q)]; }).filter(function (x) { return x[1] > 0; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 24);
        out.innerHTML = res.map(function (x) { var i = x[0]; return '<li class="card"><a class="card-link" href="' + BASE + i.u + '"><div class="card-img"><img src="' + esc(pic(i)) + '" alt="" width="300" height="300" loading="lazy"></div><div class="card-body">' + (i.kg ? '<span class="meta">' + i.kg + ' кг</span>' : '') + '<h3 class="card-title">' + esc(i.n) + '</h3><div class="card-price"><b>' + rub(i.p) + '</b></div></div></a><button class="btn btn-add" type="button" data-add="' + esc(i.s) + '"><span>В корзину</span></button></li>'; }).join('');
        $('[data-search-empty]').hidden = res.length > 0;
        track('search', { q: q, n: res.length });
      });
    };
    var p = new URLSearchParams(location.search).get('q'); if (p) sin.value = p;
    sin.addEventListener('input', run); sform.addEventListener('submit', function (e) { e.preventDefault(); run(); }); run();
  }

  // ── 3단계 추천 ──
  var quiz = $('[data-quiz]');
  if (quiz) {
    var ans = {};
    quiz.addEventListener('click', function (e) {
      var b = e.target.closest('.quiz-step button'); if (!b) return;
      var step = b.closest('.quiz-step'), n = +step.dataset.step; ans[n] = b.dataset.v;
      $$('button', step).forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      $('[data-result]', quiz).hidden = true;
      if (n === 1) {
        delete ans[2]; delete ans[3];
        $('[data-step="2"]', quiz).hidden = ans[1] !== 'cat';
        $('[data-step="3"]', quiz).hidden = ans[1] !== 'dog';
        $$('[data-step="3"] [data-only]', quiz).forEach(function (x) { x.hidden = !!x.dataset.only && x.dataset.only !== ans[1]; });
        if (ans[1] === 'cat') return;
        return;
      }
      if (n === 2 && ans[2] !== 'diet') { $('[data-step="3"]', quiz).hidden = false; return; }
      getData().then(function () {
        var sp = ans[1], fl = ans[2] === 'diet' ? 'diet' : ans[3];
        var pick = data.items.filter(function (i) { return i.k === 'feed' && i.sp === sp && (fl ? i.fl === fl : i.fl !== 'diet'); });
        if (!pick.length) pick = data.items.filter(function (i) { return i.k === 'feed' && i.sp === sp; });
        var r = $('[data-result]', quiz); r.hidden = false;
        r.innerHTML = '<p><b>' + esc(quiz.dataset.resultTitle || '') + '</b></p><ul class="grid">' + pick.slice(0, 2).map(function (i) { return '<li class="card"><a class="card-link" href="' + BASE + i.u + '"><div class="card-img"><img src="' + esc(pic(i)) + '" alt="" width="300" height="300"></div><div class="card-body"><h3 class="card-title">' + esc(i.n) + '</h3><div class="card-price"><b>' + rub(i.p) + '</b>' + (i.kg ? '<span class="perkg">' + rub(i.p / i.kg) + ' / кг</span>' : '') + '</div></div></a></li>'; }).join('') + '</ul>' + (quiz.dataset.resultHelp ? '<p class="muted">' + esc(quiz.dataset.resultHelp) + '</p>' : '');
        track('quiz_result', { sp: sp, fl: fl || '' });
      });
    });
  }

  // ── 상품 조회 이벤트·하단 구매바 ──
  var pdp = $('[data-product]');
  if (pdp) {
    track('view_product', { sku: pdp.dataset.sku });
    var bar = $('[data-buybar]'), buy = $('.pdp-buy');
    if (bar && buy && 'IntersectionObserver' in window) new IntersectionObserver(function (en) { bar.classList.toggle('show', !en[0].isIntersecting); }).observe(buy);
  }
  if ($('[data-checkout]')) getData().then(function () { paintTotals(); track('initiate_checkout', {}); });

  // ── 알림 ──
  var tt;
  function toast(msg) { var el = $('[data-toast]'); if (!el) return; el.textContent = msg; el.hidden = false; clearTimeout(tt); tt = setTimeout(function () { el.hidden = true; }, 2200); }

  // ── 복제 방지(그룹 지침 0-5) — 입력칸은 예외. 화면 단 방지일 뿐이며 소스 보기·캡처는 막지 못한다 ──
  var editable = function (el) { return el && el.closest && el.closest('input, textarea, select, [contenteditable]'); };
  ['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { if (!editable(e.target)) e.preventDefault(); });
  });

  // ── PWA ──
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(function () {}); });
  }

  paintCount(); renderCart();
})();
