// domokup.ru 리뉴얼 미리보기 — 정적 사이트 생성기
//
// 원칙
//  - 운영 사이트(domokup.ru)를 호출하지 않는다. 상품 데이터는 저장소의 스냅샷 JSON 만 읽는다.
//  - 외부 라이브러리 없음(Node 내장 모듈만). 결과물은 순수 HTML/CSS/JS.
//  - 고객 개인정보를 만들거나 저장하지 않는다. 결제·주문 전송 없음(데모).
//
// 사용법
//   node scripts/build.mjs
// 모든 내부 주소는 상대 경로로 만든다 → GitHub Pages(/domokup-preview/)·로컬·CI 검사 서버(/) 어디서 열어도 같다.

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
// 빌드 중에는 표지 문자열로 쓰고, 파일을 쓸 때 그 페이지 깊이에 맞는 상대 경로(./, ../ …)로 바꾼다.
const BASE = '/__DKBASE__/';
const relFor = path => (path.endsWith('.html') ? path.split('/').length - 1 : path.split('/').filter(Boolean).length);
const toRel = (text, path) => { const d = relFor(path); return text.split(BASE).join(d ? '../'.repeat(d) : './'); };
const BUILD_DATE = new Date().toISOString().slice(0, 10);

// ───────────────────────── 데이터 읽기 ─────────────────────────
const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const snapshot = readJson(join(SRC, 'data', 'catalog-snapshot-20261120.json'));
const copyFile = readJson(join(SRC, 'data', 'copy-ru.json'), {});
const contentFile = readJson(join(SRC, 'data', 'products-content-ru.json'), {});
const C = deepMerge(readJson(join(SRC, 'data', 'copy-defaults-ru.json')), copyFile);

function deepMerge(a, b) {
  if (Array.isArray(b)) return b;
  if (b && typeof b === 'object') {
    const out = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) };
    for (const k of Object.keys(b)) out[k] = deepMerge(out[k], b[k]);
    return out;
  }
  return b === undefined ? a : b;
}

// 2026-11-02 대표 확정: 자사몰 사료 7종. 순서 = 판매량 순(고양이 연어가 1위).
const CORE = [
  { sku: '88103', group: 'cat-salmon', species: 'cat', flavor: 'salmon', kg: 2, img: 'cat-salmon' },
  { sku: '88104', group: 'cat-salmon', species: 'cat', flavor: 'salmon', kg: 5, img: 'cat-salmon' },
  { sku: '88101', group: 'cat-chicken', species: 'cat', flavor: 'chicken', kg: 2, img: 'cat-chicken' },
  { sku: '88102', group: 'cat-chicken', species: 'cat', flavor: 'chicken', kg: 5, img: 'cat-chicken' },
  { sku: '88106', group: 'cat-diet', species: 'cat', flavor: 'diet', kg: 5, img: 'cat-diet' },
  { sku: '88204', group: 'dog-salmon', species: 'dog', flavor: 'salmon', kg: 5, img: 'dog-salmon' },
  { sku: '88206', group: 'dog-lamb', species: 'dog', flavor: 'lamb', kg: 5, img: 'dog-lamb' },
];
const FLAVOR_RU = { salmon: 'Лосось', chicken: 'Курица', diet: 'Диета', lamb: 'Ягнёнок' };
const SPECIES_RU = { cat: 'Для кошек', dog: 'Для собак' };
const ACC_CATS = { 'igrushki-dlja-koshek': 'cat', 'igrushki-dlja-sobak': 'dog', 'amunicija-dlja-sobak': 'dog' };

const bySku = new Map(snapshot.products.map(p => [p.sku, p]));
const price = p => Math.round(p.priceMinor / 10 ** (p.currencyMinorUnit ?? 2));

const feeds = CORE.map(c => {
  const p = bySku.get(c.sku);
  if (!p) throw new Error(`스냅샷에 없는 SKU: ${c.sku}`);
  const ct = contentFile[c.sku] || {};
  return {
    ...c, kind: 'feed', id: p.id, slug: p.slug, name: p.name,
    displayName: ct.displayName || `Pure Nature · ${FLAVOR_RU[c.flavor]} · ${SPECIES_RU[c.species].toLowerCase()}`,
    price: price(p), inStock: p.inStock, url: `product/${p.slug}/`,
    image: `assets/img/${c.img}-600.webp`, thumb: `assets/img/${c.img}-300.webp`, imageRemote: false,
    content: ct, reviews: p.reviewCount || 0,
  };
});

// 장난감·하네스(JOYSER 쿠폰 대상으로 가정 — 대표 확인 필요). 재고 있는 것만.
const accessories = snapshot.products
  .filter(p => p.inStock && p.categories.some(k => ACC_CATS[k.slug]))
  .map(p => {
    const cat = p.categories.find(k => ACC_CATS[k.slug]);
    return {
      kind: 'acc', sku: p.sku, id: p.id, slug: p.slug, name: p.name, displayName: p.name,
      species: ACC_CATS[cat.slug], catSlug: cat.slug, catName: cat.name,
      price: price(p), inStock: true, url: `product/${p.slug}/`,
      image: p.image?.src || '', thumb: p.image?.thumbnail || p.image?.src || '', imageRemote: true, joyser: true,
    };
  });

const ALL = [...feeds, ...accessories];

// ───────────────────────── 도우미 ─────────────────────────
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const rub = n => `${Number(n).toLocaleString('ru-RU').replace(/,/g, ' ')} ₽`;
const u = path => BASE + path.replace(/^\//, '');
// 대표 결정 전 자리표시 — 미리보기에서는 「уточняется」로 보여 준다(결정 나면 copy-ru.json 값만 바꾼다).
const PENDING = {
  PICKUP_HOURS: 'часы работы уточняются',
  DELIVERY_TERMS: 'Условия бесплатной доставки уточняются.',
  MAX_URL: '',
  RETURNS_CLAIM_DAYS: 'уточняется',
  RETURNS_PROPER_QUALITY: 'уточняется',
};
const fill = s => String(s ?? '').replace(/{{([A-Z_]+)}}/g, (m, k) => {
  const v = C.placeholders?.[k];
  return v && !/{{/.test(v) && k !== 'DELIVERY_TERMS_A' ? v : (PENDING[k] ?? 'уточняется');
}).replace(/{year}/g, new Date().getFullYear());
const t = (path, fb = '') => fill(path.split('.').reduce((o, k) => (o == null ? o : o[k]), C) ?? fb);

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  cart: '<path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.9a1.5 1.5 0 0 0 1.5-1.1L21 8H6"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  gift: '<rect x="3.5" y="9" width="17" height="11" rx="1.5"/><path d="M12 9v11M3.5 13h17"/><path d="M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  box: '<path d="m3.5 7.5 8.5-4 8.5 4v9l-8.5 4-8.5-4z"/><path d="m3.5 7.5 8.5 4 8.5-4M12 11.5v9"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  arrow: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  minus: '<path d="M6 12h12"/>', plus: '<path d="M12 6v12M6 12h12"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5"/>',
  paw: '<circle cx="7" cy="9" r="1.8"/><circle cx="17" cy="9" r="1.8"/><circle cx="10" cy="5.5" r="1.6"/><circle cx="14" cy="5.5" r="1.6"/><path d="M12 12c-3 0-5.5 3.4-5.5 5.6 0 1.6 1.3 2.4 2.8 2.4 1.1 0 1.8-.6 2.7-.6s1.6.6 2.7.6c1.5 0 2.8-.8 2.8-2.4C17.5 15.4 15 12 12 12z"/>',
  tg: '<path d="M21 4 3 11.2l5.6 2 2.1 6.3 3.2-3.8 5 3.8z"/><path d="m8.6 13.2 8.4-5.6-6.3 7.1"/>',
};
const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

function img(item, size, { lazy = true, sizes = '' } = {}) {
  const src = item.imageRemote ? (size === 'thumb' ? item.thumb : item.image) : u(size === 'thumb' ? item.thumb : item.image);
  const dim = size === 'thumb' ? 300 : 600;
  return `<img src="${esc(src)}" alt="${esc(item.displayName)}" width="${dim}" height="${dim}"${lazy ? ' loading="lazy" decoding="async"' : ' fetchpriority="high"'}${sizes ? ` sizes="${sizes}"` : ''}>`;
}

function card(item) {
  const perKg = item.kind === 'feed' ? `<span class="perkg">${rub(Math.round(item.price / item.kg))} / кг</span>` : '';
  const badge = item.kind === 'feed' ? `<span class="badge badge-gift">${icon('gift')}${esc(t('product.giftBadgeShort', 'Подарок'))}</span><span class="badge badge-kg">${item.kg} кг</span>` : '';
  const meta = item.kind === 'feed' ? `<span class="meta">${item.kg} кг · ${esc(FLAVOR_RU[item.flavor])}</span>` : '';
  return `<li class="card" data-kind="${item.kind}" data-species="${item.species}" data-flavor="${item.flavor || ''}" data-kg="${item.kg || ''}" data-price="${item.price}" data-name="${esc(item.displayName.toLowerCase())}">
  <a class="card-link" href="${u(item.url)}">
    <div class="card-img">${img(item, 'thumb')}${badge}</div>
    <div class="card-body">${meta}<h3 class="card-title">${esc(item.displayName)}</h3>
      <div class="card-price"><b>${rub(item.price)}</b>${perKg}</div></div>
  </a>
  <button class="btn btn-add" type="button" data-add="${esc(item.sku)}" aria-label="${esc(t('product.addToCart', 'В корзину'))}: ${esc(item.displayName)}">${icon('cart')}<span>${esc(t('product.addToCartShort', 'В корзину'))}</span></button>
</li>`;
}

// ───────────────────────── 공통 틀 ─────────────────────────
function layout({ path, title, description, body, jsonld = [], active = '' }) {
  const tabs = [
    ['home', '', t('nav.bottomTabs.home', 'Главная'), 'home'],
    ['catalog', 'catalog/', t('nav.bottomTabs.catalog', 'Каталог'), 'grid'],
    ['search', 'search/', t('nav.bottomTabs.search', 'Поиск'), 'search'],
    ['cart', 'cart/', t('nav.bottomTabs.cart', 'Корзина'), 'cart'],
    ['help', 'contacts/', t('nav.bottomTabs.help', 'Помощь'), 'chat'],
  ];
  const canonicalLive = `https://domokup.ru/${path}`;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#1F3A2E">
<link rel="canonical" href="${esc(canonicalLive)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${u('assets/img/og-1200x630.jpg')}"><meta property="og:locale" content="ru_RU">
<link rel="manifest" href="${u('manifest.webmanifest')}">
<link rel="icon" href="${u('assets/img/favicon-32.png')}" sizes="32x32"><link rel="apple-touch-icon" href="${u('assets/img/apple-touch-icon-180.png')}">
<link rel="stylesheet" href="${u('assets/css/tokens.css')}"><link rel="stylesheet" href="${u('assets/css/main.css')}">
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
<script>window.DK={base:${JSON.stringify(BASE)},version:"${BUILD_DATE}"};</script>
<script src="${u('assets/js/app.js')}" defer></script>
</head>
<body data-page="${esc(active)}">
<a class="skip" href="#main">${esc(t('nav.skipToContent', 'Перейти к содержимому'))}</a>
<div class="demo-bar" role="note">${esc(t('meta.demoBar', 'Демо-версия обновлённого сайта ДОМОКУП · заказы не принимаются'))}</div>
<header class="hdr">
  <div class="wrap hdr-row">
    <a class="logo" href="${u('')}" aria-label="ДОМОКУП — на главную"><span class="logo-mark">Д</span><span class="logo-text">ДОМОКУП</span></a>
    <form class="hdr-search" action="${u('search/')}" role="search">
      <label class="sr" for="q-hdr">${esc(t('nav.searchLabel', 'Поиск по каталогу'))}</label>
      <input id="q-hdr" name="q" type="search" autocomplete="off" placeholder="${esc(t('nav.searchPlaceholder', 'Например: корм для кошек с лососем'))}">
      <button type="submit" aria-label="${esc(t('nav.searchSubmit', 'Найти'))}">${icon('search')}</button>
    </form>
    <nav class="hdr-nav" aria-label="${esc(t('nav.mainLabel', 'Основное меню'))}">
      <a href="${u('catalog/koshki/')}">${esc(t('nav.forCats', 'Для кошек'))}</a>
      <a href="${u('catalog/sobaki/')}">${esc(t('nav.forDogs', 'Для собак'))}</a>
      <a href="${u('catalog/igrushki/')}">${esc(t('catalog.categories.toys', 'Игрушки JOYSER'))}</a>
      <a href="${u('delivery/')}">${esc(t('nav.delivery', 'Доставка'))}</a>
    </nav>
    <a class="hdr-cart" href="${u('cart/')}" aria-label="${esc(t('nav.bottomTabs.cart', 'Корзина'))}">${icon('cart')}<span class="cart-count" data-cart-count hidden>0</span></a>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="ftr">
  <div class="wrap">
    <div class="ftr-grid">
      <div>
        <p class="ftr-brand">ДОМОКУП</p>
        <p>${esc(t('footer.tagline', 'Корма Pure Nature из Южной Кореи. Официальный импорт.'))}</p>
        <p class="ftr-msg"><a class="btn btn-ghost" href="https://t.me/domopet_kor" rel="noopener" target="_blank">${icon('tg')}Telegram</a> <a class="btn btn-ghost" href="${u('contacts/')}">MAX</a></p>
      </div>
      <div>
        <p class="ftr-h">${esc(t('footer.buyers', 'Покупателям'))}</p>
        <ul><li><a href="${u('delivery/')}">${esc(t('pages.delivery.title', 'Доставка и оплата'))}</a></li><li><a href="${u('returns/')}">${esc(t('pages.returns.title', 'Возврат и обмен'))}</a></li><li><a href="${u('faq/')}">${esc(t('nav.faq', 'Вопросы и ответы'))}</a></li><li><a href="${u('contacts/')}">${esc(t('pages.contacts.title', 'Контакты'))}</a></li><li><a href="${u('about/')}">${esc(t('pages.about.title', 'О магазине'))}</a></li></ul>
      </div>
      <div>
        <p class="ftr-h">${esc(t('footer.requisitesTitle', 'Продавец'))}</p>
        <p class="req">${esc(t('footer.requisites', 'ИП Цхай Наталья Генадьевна · ИНН 250908672910 · ОГРНИП 319253600007389'))}</p>
        <p class="req">${esc(t('footer.pickupAddress', 'Самовывоз: г. Москва, ул. Производственная, д. 11, стр. 1'))}</p>
        <p class="req"><a href="tel:+79147219286">+7 914 721-92-86</a></p>
      </div>
    </div>
    <p class="ftr-copy">${esc(t('footer.copyright', '© {year} ДОМОКУП'))} ${esc(t('footer.copyNotice', 'Копирование материалов сайта без письменного разрешения запрещено.'))}</p>
  </div>
</footer>
<nav class="tabbar" aria-label="${esc(t('nav.tabsLabel', 'Быстрое меню'))}">
${tabs.map(([key, href, label, ic]) => `<a href="${u(href)}"${active === key ? ' aria-current="page"' : ''}>${icon(ic)}<span>${esc(label)}</span>${key === 'cart' ? '<b class="cart-count" data-cart-count hidden>0</b>' : ''}</a>`).join('\n')}
</nav>
<div class="toast" role="status" aria-live="polite" data-toast hidden></div>
</body>
</html>`;
}

function crumbs(items) {
  const html = `<nav class="crumbs wrap" aria-label="Навигация"><ol>${items.map(([label, href], i) => i === items.length - 1 ? `<li aria-current="page">${esc(label)}</li>` : `<li><a href="${u(href)}">${esc(label)}</a></li>`).join('')}</ol></nav>`;
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([label, href], i) => ({ '@type': 'ListItem', position: i + 1, name: label, item: `https://domokup.ru/${href}` })) };
  return { html, ld };
}

const ORG_LD = { '@context': 'https://schema.org', '@type': 'OnlineStore', name: 'ДОМОКУП', url: 'https://domokup.ru/', telephone: '+7 914 721-92-86', address: { '@type': 'PostalAddress', addressCountry: 'RU', addressLocality: 'Москва', streetAddress: 'ул. Производственная, д. 11, стр. 1' }, sameAs: ['https://vk.ru/domopet', 'https://t.me/domopet_kor'] };

// ───────────────────────── 페이지 ─────────────────────────
const pages = [];
const page = (path, html) => pages.push([path, html]);

// 홈
{
  const usp = (C.home?.usp || []).slice(0, 4);
  const uspIcons = ['shield', 'box', 'gift', 'truck'];
  const catFeeds = feeds.filter(f => f.species === 'cat');
  const dogFeeds = feeds.filter(f => f.species === 'dog');
  const toys = accessories.filter(a => a.catSlug === 'igrushki-dlja-koshek').slice(0, 8);
  const body = `
<section class="hero">
  <picture class="hero-img"><source media="(min-width: 800px)" srcset="${u('assets/img/hero-cat-1600.webp')}"><img src="${u('assets/img/hero-cat-800.webp')}" alt="${esc(t('home.heroAlt', 'Кошка и корма Pure Nature'))}" width="800" height="412" fetchpriority="high"></picture>
  <div class="hero-txt wrap">
    <p class="eyebrow">${esc(t('home.eyebrow', 'Pure Nature · Южная Корея'))}</p>
    <h1>${esc(t('home.heroTitle', 'Корм, который кошка ест с удовольствием'))}</h1>
    <p class="lead">${esc(t('home.heroSub', 'Официальный импорт. Внутри упаковки — порционные пакеты.'))}</p>
    <div class="hero-cta"><a class="btn btn-primary" href="${u('catalog/koshki/')}">${esc(t('home.heroCta', 'Выбрать корм'))}</a><a class="btn btn-light" href="#quiz">${esc(t('home.heroCtaSecondary', 'Подобрать за минуту'))}</a></div>
  </div>
</section>
<section class="usp wrap" aria-label="${esc(t('home.sections.trust', 'Почему нам доверяют'))}">
  <ul>${usp.map((x, i) => `<li>${icon(uspIcons[i] || 'check')}<div><b>${esc(fill(x.title))}</b><span>${esc(fill(x.text))}</span></div></li>`).join('')}</ul>
</section>
<section class="gift-banner wrap">
  <div>${icon('gift', 'ic-lg')}<div><h2>${esc(t('home.giftBanner.title', 'Игрушка JOYSER в подарок к каждому заказу корма'))}</h2><p>${esc(t('home.giftBanner.text', 'Подарок добавится в корзину автоматически.'))}</p></div></div>
</section>
<section class="sec wrap">
  <div class="sec-h"><h2>${esc(t('home.sections.forCats', 'Для кошек'))}</h2><a href="${u('catalog/koshki/')}">${esc(t('home.sections.showAll', 'Смотреть все'))} ${icon('arrow')}</a></div>
  <ul class="grid grid-scroll">${catFeeds.map(card).join('')}</ul>
</section>
<section class="sec wrap" id="quiz">
  <div class="quiz" data-quiz data-result-title="${esc(t('home.chooseQuiz.result.title', 'Вам подойдёт'))}" data-result-help="${esc(t('home.chooseQuiz.result.help', ''))}">
    <h2>${esc(t('home.chooseQuiz.title', 'Подберём корм за три вопроса'))}</h2>
    <div class="quiz-step" data-step="1"><p>${esc(t('home.chooseQuiz.steps.species.question', 'Для кого выбираете корм?'))}</p><div class="chips"><button type="button" data-v="cat">${esc(t('home.chooseQuiz.steps.species.options.cat', 'Для кошки'))}</button><button type="button" data-v="dog">${esc(t('home.chooseQuiz.steps.species.options.dog', 'Для собаки'))}</button></div></div>
    <div class="quiz-step" data-step="2" hidden><p>${esc(t('home.chooseQuiz.steps.weight.question', 'Кошке нужно следить за весом?'))}</p><div class="chips"><button type="button" data-v="diet">${esc(t('home.chooseQuiz.steps.weight.options.yes', 'Да'))}</button><button type="button" data-v="any">${esc(t('home.chooseQuiz.steps.weight.options.no', 'Нет'))}</button></div><p class="hint">${esc(t('home.chooseQuiz.steps.weight.hint', ''))}</p></div>
    <div class="quiz-step" data-step="3" hidden><p>${esc(t('home.chooseQuiz.steps.taste.question', 'Что питомец любит больше?'))}</p><div class="chips"><button type="button" data-v="salmon" data-only="">${esc(t('home.chooseQuiz.steps.taste.options.salmon', 'Лосось'))}</button><button type="button" data-v="chicken" data-only="cat">${esc(t('home.chooseQuiz.steps.taste.options.chicken', 'Курицу'))}</button><button type="button" data-v="lamb" data-only="dog">${esc(t('home.chooseQuiz.steps.taste.options.lamb', 'Ягнёнка'))}</button><button type="button" data-v="">${esc(t('home.chooseQuiz.steps.taste.options.any', 'Не знаю'))}</button></div></div>
    <div class="quiz-result" data-result hidden></div>
  </div>
</section>
<section class="sec wrap">
  <div class="sec-h"><h2>${esc(t('home.sections.forDogs', 'Для собак'))}</h2><a href="${u('catalog/sobaki/')}">${esc(t('home.sections.showAll', 'Смотреть все'))} ${icon('arrow')}</a></div>
  <ul class="grid grid-scroll">${dogFeeds.map(card).join('')}</ul>
</section>
<section class="sec wrap">
  <div class="sec-h"><h2>${esc(t('catalog.categories.toys', 'Игрушки JOYSER'))}</h2><a href="${u('catalog/igrushki/')}">${esc(t('home.sections.showAll', 'Смотреть все'))} ${icon('arrow')}</a></div>
  <ul class="grid grid-scroll">${toys.map(card).join('')}</ul>
</section>
<section class="sec wrap trust">
  <h2>${esc(t('home.sections.trust', 'Покупать у нас спокойно'))}</h2>
  <ul class="trust-list">${(C.product?.trustBadges || []).map(x => typeof x === 'string' ? `<li>${icon('check')}<span>${esc(fill(x))}</span></li>` : `<li>${icon('check')}<span><b>${esc(fill(x.title))}</b> ${esc(fill(x.text))}</span></li>`).join('')}</ul>
  <div class="trust-cta"><a class="btn btn-light" href="${u('delivery/')}">${icon('truck')}${esc(t('pages.delivery.title', 'Доставка и оплата'))}</a><a class="btn btn-light" href="${u('contacts/')}">${icon('pin')}${esc(t('home.pickup', 'Самовывоз в Москве'))}</a></div>
</section>
<section class="sec wrap faq-mini">
  <div class="sec-h"><h2>${esc(t('nav.faq', 'Вопросы и ответы'))}</h2><a href="${u('faq/')}">${esc(t('home.sections.showAll', 'Смотреть все'))} ${icon('arrow')}</a></div>
  ${(C.pages?.faq || []).slice(0, 4).map(f => `<details><summary>${esc(fill(f.q))}</summary><p>${esc(fill(f.a))}</p></details>`).join('')}
</section>`;
  page('', layout({ path: '', title: t('meta.defaultTitle', 'ДОМОКУП — корма Pure Nature для кошек и собак'), description: t('meta.defaultDescription', 'Интернет-магазин кормов Pure Nature. Официальный импорт из Южной Кореи, доставка СДЭК по России, самовывоз в Москве.'), body, jsonld: [ORG_LD], active: 'home' }));
}

// 카탈로그 (전체 + 프리셋 3개)
function catalogPage({ path, title, h1, preset, items, crumbsList }) {
  const flavors = [...new Set(items.filter(i => i.flavor).map(i => i.flavor))];
  const weights = [...new Set(items.filter(i => i.kg).map(i => i.kg))].sort((a, b) => a - b);
  const cr = crumbs(crumbsList);
  const body = `${cr.html}
<section class="wrap cat-head"><h1>${esc(h1)}</h1><p class="muted"><span data-count>${items.length}</span> ${esc(t('catalog.itemsWord', 'товаров'))}</p></section>
<section class="wrap filters" data-filters${preset ? ` data-preset="${preset}"` : ''}>
  <div class="chips" role="group" aria-label="${esc(t('catalog.filters.species', 'Питомец'))}">
    <button type="button" data-f="species" data-v="" aria-pressed="${preset ? 'false' : 'true'}">${esc(t('catalog.filters.all', 'Все'))}</button>
    <button type="button" data-f="species" data-v="cat" aria-pressed="${preset === 'cat'}">${esc(t('catalog.filters.speciesCat', 'Кошки'))}</button>
    <button type="button" data-f="species" data-v="dog" aria-pressed="${preset === 'dog'}">${esc(t('catalog.filters.speciesDog', 'Собаки'))}</button>
  </div>
  ${flavors.length ? `<div class="chips" role="group" aria-label="${esc(t('catalog.filters.taste', 'Вкус'))}"><button type="button" data-f="flavor" data-v="" aria-pressed="true">${esc(t('catalog.filters.anyFlavor', 'Любой вкус'))}</button>${flavors.map(f => `<button type="button" data-f="flavor" data-v="${f}" aria-pressed="false">${esc(FLAVOR_RU[f])}</button>`).join('')}</div>` : ''}
  ${weights.length ? `<div class="chips" role="group" aria-label="${esc(t('catalog.filters.packSize', 'Вес упаковки'))}"><button type="button" data-f="kg" data-v="" aria-pressed="true">${esc(t('catalog.filters.anyWeight', 'Любой вес'))}</button>${weights.map(w => `<button type="button" data-f="kg" data-v="${w}" aria-pressed="false">${w} кг</button>`).join('')}</div>` : ''}
  <label class="sort"><span>${esc(t('catalog.sort.label', 'Сортировка'))}</span><select data-sort><option value="pop">${esc(t('catalog.sort.popular', 'Популярные'))}</option><option value="asc">${esc(t('catalog.sort.priceAsc', 'Сначала дешевле'))}</option><option value="desc">${esc(t('catalog.sort.priceDesc', 'Сначала дороже'))}</option><option value="kg">${esc(t('catalog.sort.perKg', 'Цена за кг'))}</option></select></label>
</section>
<section class="wrap"><ul class="grid" data-grid>${items.map(card).join('')}</ul><p class="empty" data-empty hidden>${esc(t('catalog.empty.text', 'Ничего не нашлось. Попробуйте изменить фильтры.'))}</p></section>`;
  page(path, layout({ path, title, description: t('meta.defaultDescription', ''), body, jsonld: [cr.ld], active: 'catalog' }));
}
const HOME = t('nav.bottomTabs.home', 'Главная');
catalogPage({ path: 'catalog/', title: `${t('nav.bottomTabs.catalog', 'Каталог')} — ДОМОКУП`, h1: t('nav.bottomTabs.catalog', 'Каталог'), items: ALL, crumbsList: [[HOME, ''], [t('nav.bottomTabs.catalog', 'Каталог'), 'catalog/']] });
catalogPage({ path: 'catalog/koshki/', title: `${t('catalog.categories.cats', 'Корм для кошек')} — ДОМОКУП`, h1: t('catalog.categories.cats', 'Корм для кошек'), preset: 'cat', items: feeds.filter(f => f.species === 'cat'), crumbsList: [[HOME, ''], [t('nav.bottomTabs.catalog', 'Каталог'), 'catalog/'], [t('nav.forCats', 'Для кошек'), 'catalog/koshki/']] });
catalogPage({ path: 'catalog/sobaki/', title: `${t('catalog.categories.dogs', 'Корм для собак')} — ДОМОКУП`, h1: t('catalog.categories.dogs', 'Корм для собак'), preset: 'dog', items: feeds.filter(f => f.species === 'dog'), crumbsList: [[HOME, ''], [t('nav.bottomTabs.catalog', 'Каталог'), 'catalog/'], [t('nav.forDogs', 'Для собак'), 'catalog/sobaki/']] });
catalogPage({ path: 'catalog/igrushki/', title: `${t('catalog.categories.toys', 'Игрушки JOYSER')} — ДОМОКУП`, h1: t('catalog.categories.toys', 'Игрушки JOYSER'), items: accessories, crumbsList: [[HOME, ''], [t('nav.bottomTabs.catalog', 'Каталог'), 'catalog/'], [t('catalog.categories.toys', 'Игрушки JOYSER'), 'catalog/igrushki/']] });

// 상품 상세
for (const it of ALL) {
  const isFeed = it.kind === 'feed';
  const ct = it.content || {};
  const siblings = isFeed ? feeds.filter(f => f.group === it.group) : [];
  const section = isFeed ? (it.species === 'cat' ? [t('nav.forCats', 'Для кошек'), 'catalog/koshki/'] : [t('nav.forDogs', 'Для собак'), 'catalog/sobaki/']) : [t('catalog.categories.toys', 'Игрушки JOYSER'), 'catalog/igrushki/'];
  const cr = crumbs([[HOME, ''], section, [it.displayName, it.url]]);
  const tabs = [];
  const desc = (ct.description || []).map(p => `<p>${esc(fill(p))}</p>`).join('');
  tabs.push(['description', t('product.tabs.description', 'Описание'), (desc || `<p>${esc(it.name)}</p>`) + (isFeed ? `<p class="muted">${esc(t('product.healthDisclaimer', ''))}</p>` : '')]);
  if (isFeed) tabs.push(['composition', t('product.tabs.composition', 'Состав'), (ct.composition?.length ? `<table class="spec">${ct.composition.map(r => `<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.value)}</td></tr>`).join('')}</table><p class="muted">${esc(t('product.compositionPending', ''))}</p>` : `<p>${esc(t('product.compositionPending', ''))}</p>`)]);
  if (isFeed) tabs.push(['feeding', t('product.tabs.feeding', 'Кормление'), ct.feeding?.rows ? `<div class="tbl"><table class="feed"><thead><tr>${ct.feeding.columns.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${ct.feeding.rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table></div><ul class="notes">${(ct.feeding.notes || []).map(n => `<li>${esc(fill(n))}</li>`).join('')}</ul><p class="muted">${esc(t('product.feedingDisclaimer', ''))}</p>` : `<p>${esc(t('product.feedingPending', 'Норма кормления указана на упаковке.'))}</p>`]);
  tabs.push(['delivery', t('product.tabs.delivery', 'Доставка'), `<p>${esc(t('product.deliveryText', 'Доставка СДЭК по всей России, самовывоз в Москве.'))}</p><p><a href="${u('delivery/')}">${esc(t('pages.delivery.title', 'Доставка и оплата'))} ${icon('arrow')}</a></p>`]);
  tabs.push(['reviews', `${t('product.tabs.reviews', 'Отзывы')} (${it.reviews || 0})`, `<p class="muted">${esc(t('product.reviewsEmpty', 'Отзывов пока нет. Купили этот товар? Расскажите о нём — это поможет другим.'))}</p>`]);

  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: it.name, sku: it.sku, image: it.imageRemote ? it.image : `https://domokup.ru/`, brand: isFeed ? 'Pure Nature' : 'JOYSER', offers: { '@type': 'Offer', price: it.price, priceCurrency: 'RUB', availability: it.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: `https://domokup.ru/${it.url}` } };
  const body = `${cr.html}
<article class="wrap pdp" data-product data-sku="${esc(it.sku)}">
  <div class="pdp-media">${img(it, 'full', { lazy: false })}${isFeed ? `<span class="badge badge-gift">${icon('gift')}${esc(t('product.giftBadgeShort', 'Подарок'))}</span><span class="badge badge-kg">${it.kg} кг</span>` : ''}</div>
  <div class="pdp-info">
    ${isFeed ? `<p class="eyebrow">Pure Nature · ${esc(SPECIES_RU[it.species])}</p>` : `<p class="eyebrow">JOYSER</p>`}
    <h1>${esc(it.displayName)}</h1>
    ${ct.shortTagline ? `<p class="lead">${esc(fill(ct.shortTagline))}</p>` : ''}
    ${siblings.length > 1 ? `<div class="weights" role="group" aria-label="${esc(t('product.weight', 'Вес'))}"><span>${esc(t('product.weight', 'Вес'))}</span>${siblings.map(s => s.sku === it.sku ? `<a aria-current="true" class="w-on" href="${u(s.url)}">${s.kg} кг<small>${rub(Math.round(s.price / s.kg))}/кг</small></a>` : `<a href="${u(s.url)}">${s.kg} кг<small>${rub(Math.round(s.price / s.kg))}/кг</small></a>`).join('')}</div>` : ''}
    <div class="pdp-price"><b>${rub(it.price)}</b>${isFeed ? `<span class="perkg">${rub(Math.round(it.price / it.kg))} / кг</span>` : ''}</div>
    <p class="stock ${it.inStock ? 'ok' : 'no'}">${icon(it.inStock ? 'check' : 'close')}${esc(it.inStock ? t('product.inStock', 'В наличии') : t('product.outOfStock', 'Нет в наличии'))}</p>
    ${isFeed ? `<p class="gift-note">${icon('gift')}<span>${esc(t('product.giftNote', 'Игрушка JOYSER в подарок к каждому заказу корма'))}</span></p>` : `<p class="gift-note">${icon('gift')}<span>${esc(t('product.couponNote', 'Ежемесячная скидка 7% на игрушки и шлейки JOYSER — по промокоду месяца.'))}</span></p>`}
    <div class="pdp-buy">
      ${it.inStock ? `<div class="qty" data-qty><button type="button" data-step="-1" aria-label="Меньше">${icon('minus')}</button><input type="number" min="1" max="20" value="1" inputmode="numeric" aria-label="Количество"><button type="button" data-step="1" aria-label="Больше">${icon('plus')}</button></div><button class="btn btn-primary btn-wide" type="button" data-add="${esc(it.sku)}" data-with-qty>${icon('cart')}${esc(t('product.addToCart', 'Добавить в корзину'))}</button>` : `<a class="btn btn-primary btn-wide" href="https://t.me/domopet_kor" target="_blank" rel="noopener">${icon('bell')}${esc(t('product.notifyMe', 'Сообщить о поступлении'))}</a>`}
    </div>
    <ul class="pdp-facts">
      <li>${icon('truck')}<span>${esc(t('product.deliveryEstimate', 'Отправка СДЭК за 1–3 рабочих дня'))}</span></li>
      <li>${icon('pin')}<span>${esc(t('product.pickupNote', 'Самовывоз: Москва, ул. Производственная, 11, стр. 1'))}</span></li>
      ${isFeed ? `<li>${icon('shield')}<span>${esc(t('product.importNote', 'Официальный импорт: данные импортёра на русской этикетке'))}</span></li>` : ''}
    </ul>
    ${(ct.bullets || []).length ? `<ul class="bullets">${ct.bullets.map(b => `<li>${icon('check')}<span>${esc(fill(b))}</span></li>`).join('')}</ul>` : ''}
  </div>
  <div class="pdp-tabs" data-tabs>
    <div class="tablist" role="tablist">${tabs.map(([id, label], i) => `<button role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(label)}</button>`).join('')}</div>
    ${tabs.map(([id, , html], i) => `<section role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}"${i === 0 ? '' : ' hidden'}>${html}</section>`).join('')}
  </div>
</article>
${isFeed ? `<section class="sec wrap"><div class="sec-h"><h2>${esc(t('product.relatedTitle', 'Вам может пригодиться'))}</h2></div><ul class="grid grid-scroll">${feeds.filter(f => f.species === it.species && f.group !== it.group).map(card).join('')}</ul></section>` : ''}
<div class="buybar" data-buybar><div><b>${rub(it.price)}</b><small>${esc(it.displayName)}</small></div>${it.inStock ? `<button class="btn btn-primary" type="button" data-add="${esc(it.sku)}">${esc(t('product.addToCartShort', 'В корзину'))}</button>` : `<a class="btn btn-primary" href="https://t.me/domopet_kor" target="_blank" rel="noopener">${esc(t('product.notifyShort', 'Сообщить'))}</a>`}</div>`;
  page(it.url, layout({ path: it.url, title: `${it.displayName} — купить в ДОМОКУП`, description: fill(ct.shortTagline) || it.name, body, jsonld: [ld, cr.ld], active: 'catalog' }));
}

// 장바구니·결제(데모)·검색
page('cart/', layout({ path: 'cart/', title: `${t('nav.bottomTabs.cart', 'Корзина')} — ДОМОКУП`, description: '', active: 'cart', body: `
<section class="wrap cart" data-cart-page>
  <h1>${esc(t('nav.bottomTabs.cart', 'Корзина'))}</h1>
  <div data-cart-empty hidden class="empty-state">${icon('cart', 'ic-lg')}<p>${esc(t('cart.empty.title', 'Корзина пока пуста'))}</p><a class="btn btn-primary" href="${u('catalog/')}">${esc(t('cart.empty.cta', 'Перейти в каталог'))}</a></div>
  <div data-cart-full hidden>
    <ul class="cart-lines" data-cart-lines></ul>
    <form class="coupon" data-coupon><label for="coupon">${esc(t('cart.coupon.label', 'Промокод'))}</label><div><input id="coupon" autocomplete="off" placeholder="JOY7-NOV26"><button class="btn btn-light" type="submit">${esc(t('cart.coupon.apply', 'Применить'))}</button></div><p class="coupon-msg" data-coupon-msg></p></form>
    <dl class="totals" data-totals></dl>
    <a class="btn btn-primary btn-wide" href="${u('checkout/')}">${esc(t('cart.checkout', 'Перейти к оформлению'))}</a>
  </div>
</section>` }));

page('checkout/', layout({ path: 'checkout/', title: `${t('checkout.title', 'Оформление заказа')} — ДОМОКУП`, description: '', active: 'cart', body: `
<section class="wrap checkout">
  <h1>${esc(t('checkout.title', 'Оформление заказа'))}</h1>
  <p class="demo-note" role="alert">${esc(t('checkout.demoNotice', 'Это демонстрационная версия сайта: заказ не будет отправлен, данные никуда не передаются.'))}</p>
  <ol class="steps"><li aria-current="step">${esc(t('checkout.steps.contacts', 'Контакты'))}</li><li>${esc(t('checkout.steps.delivery', 'Доставка'))}</li><li>${esc(t('checkout.steps.payment', 'Оплата'))}</li></ol>
  <form data-checkout novalidate autocomplete="off">
    <fieldset><legend>${esc(t('checkout.steps.contacts', 'Контакты'))}</legend>
      <label>${esc(t('checkout.fields.name', 'Имя и фамилия'))}<input name="n" disabled></label>
      <label>${esc(t('checkout.fields.phone', 'Телефон'))}<input name="p" type="tel" disabled placeholder="+7"></label>
    </fieldset>
    <fieldset><legend>${esc(t('checkout.deliveryMethods.title', 'Способ доставки'))}</legend>
      <label class="radio"><input type="radio" name="d" checked>${esc(t('checkout.deliveryMethods.cdekPickupPoint', 'СДЭК — пункт выдачи'))}</label>
      <label class="radio"><input type="radio" name="d">${esc(t('checkout.deliveryMethods.courier', 'Курьерская доставка'))}</label>
      <label class="radio"><input type="radio" name="d">${esc(t('checkout.deliveryMethods.selfPickup', 'Самовывоз в Москве'))}</label>
    </fieldset>
    <fieldset><legend>${esc(t('checkout.paymentMethods.title', 'Способ оплаты'))}</legend>
      <label class="radio"><input type="radio" name="pay" checked>${esc(t('checkout.paymentMethods.sbp', 'СБП'))}</label>
      <label class="radio"><input type="radio" name="pay">${esc(t('checkout.paymentMethods.card', 'Банковская карта'))}</label>
    </fieldset>
    <label class="check"><input type="checkbox" disabled>${esc(t('checkout.consents.personalData', 'Я даю согласие на обработку персональных данных'))}</label>
    <label class="check"><input type="checkbox" disabled>${esc(t('checkout.consents.marketing', 'Хочу получать новости и персональные предложения'))}</label>
    <dl class="totals" data-totals></dl>
    <button class="btn btn-primary btn-wide" type="submit" disabled>${esc(t('checkout.submitDemo', 'Оформление недоступно в демо-версии'))}</button>
  </form>
</section>` }));

page('search/', layout({ path: 'search/', title: `${t('nav.bottomTabs.search', 'Поиск')} — ДОМОКУП`, description: '', active: 'search', body: `
<section class="wrap search-page">
  <h1>${esc(t('nav.bottomTabs.search', 'Поиск'))}</h1>
  <form role="search" data-search-form><label class="sr" for="q">${esc(t('nav.searchLabel', 'Поиск'))}</label><input id="q" name="q" type="search" autocomplete="off" placeholder="${esc(t('nav.searchPlaceholder', 'Например: пюр натур лосось'))}"></form>
  <p class="muted" data-search-hint>${esc(t('catalog.searchHint', 'Можно писать по-русски или латиницей: «пюр натур», «pure nature», «лосось».'))}</p>
  <ul class="grid" data-search-results></ul>
  <p class="empty" data-search-empty hidden>${esc(t('catalog.noResults', 'По вашему запросу ничего не нашлось.'))} <a href="https://t.me/domopet_kor" target="_blank" rel="noopener">${esc(t('catalog.askUs', 'Спросите нас в Telegram'))}</a></p>
</section>` }));

// 안내 페이지들
function textPage(path, title, html) {
  const cr = crumbs([[HOME, ''], [title, path]]);
  page(path, layout({ path, title: `${title} — ДОМОКУП`, description: title, body: `${cr.html}<article class="wrap prose"><h1>${esc(title)}</h1>${html}</article>`, jsonld: [cr.ld], active: 'help' }));
}
const sectionsHtml = secs => (secs || []).map(s => `<h2>${esc(fill(s.title || s.h))}</h2>${(Array.isArray(s.text) ? s.text : [s.text || s.body]).filter(Boolean).map(p => `<p>${esc(fill(p))}</p>`).join('')}`).join('');
textPage('delivery/', t('pages.delivery.title', 'Доставка и оплата'), `<p class="lead">${esc(t('pages.delivery.intro', ''))}</p>` + sectionsHtml(C.pages?.delivery?.sections));
textPage('returns/', t('pages.returns.title', 'Возврат и обмен'), sectionsHtml(C.pages?.returns?.sections));
textPage('about/', t('pages.about.title', 'О магазине'), (Array.isArray(C.pages?.about?.text) ? C.pages.about.text : [C.pages?.about?.text]).filter(Boolean).map(p => `<p>${esc(fill(p))}</p>`).join(''));
textPage('faq/', t('nav.faq', 'Вопросы и ответы'), (C.pages?.faq || []).map(f => `<details><summary>${esc(fill(f.q))}</summary><p>${esc(fill(f.a))}</p></details>`).join(''));
textPage('contacts/', t('pages.contacts.title', 'Контакты'), `
<ul class="contact-list">
<li>${icon('tg')}<div><b>Telegram</b><a href="https://t.me/domopet_kor" target="_blank" rel="noopener">t.me/domopet_kor</a></div></li>
<li>${icon('chat')}<div><b>MAX</b><span>${esc(t('pages.contacts.max', 'Напишите нам в MAX — ссылка уточняется'))}</span></div></li>
<li>${icon('chat')}<div><b>${esc(t('pages.contacts.phone', 'Телефон'))}</b><a href="tel:+79147219286">+7 914 721-92-86</a></div></li>
<li>${icon('pin')}<div><b>${esc(t('pages.contacts.pickup', 'Самовывоз'))}</b><span>${esc(fill(t('pages.contacts.pickupText', 'г. Москва, ул. Производственная, д. 11, стр. 1 · {{PICKUP_HOURS}}')))}</span></div></li>
</ul>
<p class="req">${esc(t('footer.requisites', 'ИП Цхай Наталья Генадьевна · ИНН 250908672910 · ОГРНИП 319253600007389'))}</p>`);

page('404.html', layout({ path: '404.html', title: 'Страница не найдена — ДОМОКУП', description: '', body: `<section class="wrap empty-state">${icon('paw', 'ic-lg')}<h1>${esc(t('pages.notFound.title', 'Страница не найдена'))}</h1><a class="btn btn-primary" href="${u('catalog/')}">${esc(t('cart.empty.cta', 'Перейти в каталог'))}</a></section>` }));
page('offline/', layout({ path: 'offline/', title: 'Нет соединения — ДОМОКУП', description: '', body: `<section class="wrap empty-state">${icon('paw', 'ic-lg')}<h1>${esc(t('pages.offline', 'Нет подключения к интернету'))}</h1><p>${esc(t('pages.offlineText', 'Корзина сохранится. Проверьте соединение и обновите страницу.'))}</p></section>` }));

// ───────────────────────── 쓰기 ─────────────────────────
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(join(SRC, 'assets'), join(DIST, 'assets'), { recursive: true, filter: s => !s.endsWith('.md') });
for (const [path, html] of pages) {
  const file = path.endsWith('.html') ? join(DIST, path) : join(DIST, path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, toRel(html, path));
}

// 클라이언트가 쓰는 상품 데이터(장바구니·검색). 개인정보 없음.
const clientData = ALL.map(i => ({ s: i.sku, n: i.displayName, f: i.name, p: i.price, k: i.kind, sp: i.species, fl: i.flavor || '', kg: i.kg || 0, u: i.url, t: i.imageRemote ? i.thumb : i.thumb, j: i.joyser ? 1 : 0, st: i.inStock ? 1 : 0 }));
writeFileSync(join(DIST, 'data.json'), JSON.stringify({ v: BUILD_DATE, gift: { ...(C.gift || {}), line: t('cart.giftLine', C.gift?.line) }, coupons: [{ code: 'JOY7-NOV26', pct: 7, scope: 'joyser', until: '2026-11-30', single: true }], items: clientData }));

writeFileSync(join(DIST, 'manifest.webmanifest'), toRel(JSON.stringify({
  name: 'ДОМОКУП — корма Pure Nature', short_name: 'ДОМОКУП', lang: 'ru', start_url: './', scope: './', display: 'standalone',
  background_color: '#ffffff', theme_color: '#1F3A2E',
  icons: [
    { src: u('assets/img/icon-192.png'), sizes: '192x192', type: 'image/png' },
    { src: u('assets/img/icon-512.png'), sizes: '512x512', type: 'image/png' },
    { src: u('assets/img/maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2), ''));
writeFileSync(join(DIST, 'sw.js'), readFileSync(join(SRC, 'sw.js'), 'utf8').replace(/__VERSION__/g, BUILD_DATE + '-' + Date.now().toString(36)));
writeFileSync(join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
writeFileSync(join(DIST, '.nojekyll'), '');

// 무게 보고
let total = 0; const big = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else { total += s.size; if (/\.(webp|jpg|png)$/.test(f) && s.size > 200 * 1024) big.push(`${f} ${(s.size / 1024).toFixed(0)}KB`); } } })(DIST);
console.log(`페이지 ${pages.length}개 · 사료 ${feeds.length} · 장난감·하네스 ${accessories.length} · 전체 ${(total / 1024).toFixed(0)}KB`);
if (big.length) console.log('⚠ 200KB 넘는 이미지:', big.join(', '));
