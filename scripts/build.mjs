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
const copyFile = readJson(join(SRC, 'data', 'copy-ru.json'), {});
const contentFile = readJson(join(SRC, 'data', 'products-content-ru.json'), {});
// 팀 산출물 덮어쓰기: 화면용 이름(names.json)·러시아어 설명(desc-*.json). 파일이 없으면 원문을 쓴다.
const OV_DIR = join(SRC, 'data', 'overrides');
const OV_NAMES = readJson(join(OV_DIR, 'names.json'), {});
const JOYSER = readJson(join(OV_DIR, 'joyser-updates.json'), { brand: null, products: {} });
const OV_DESC = existsSync(OV_DIR) ? Object.assign({}, ...readdirSync(OV_DIR).filter(n => /^desc-.*.json$/.test(n)).map(n => readJson(join(OV_DIR, n), {}))) : {};
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

// 판매 범위: 2026-11-20 대표 확정 — domokup.ru 전 상품에서 소분(200·500 г)·오리 14개만 뺀 164개.
// 데이터: 앱 팀이 만든 catalog-content 스냅샷(운영 Store API, 읽기 전용). excluded=true 는 쓰지 않는다.
const content = readJson(join(SRC, 'data', 'catalog-content-20261120.json'));
const SOURCE = content.products.filter(p => !p.excluded);

// 카테고리 — 운영 사이트의 「고양이/강아지 거울 카테고리」를 하나로 합친다(중복 페이지 방지).
// key = 미리보기 주소(catalog/<key>/), slugs = 운영 카테고리 슬러그, sp = 기본 대상
const CATS = [
  { key: 'korm-dlja-koshek', name: 'Корм для кошек', slugs: ['pure-nature'], sp: 'cat', icon: 'paw', feed: true },
  { key: 'korm-dlja-sobak', name: 'Корм для собак', slugs: ['pure-nature-dog-products'], sp: 'dog', icon: 'paw', feed: true },
  { key: 'igrushki-dlja-koshek', name: 'Игрушки для кошек', slugs: ['igrushki-dlja-koshek'], sp: 'cat', icon: 'gift' },
  { key: 'igrushki-dlja-sobak', name: 'Игрушки для собак', slugs: ['igrushki-dlja-sobak'], sp: 'dog', icon: 'gift' },
  { key: 'amunicija-dlja-sobak', name: 'Шлейки и поводки', slugs: ['amunicija-dlja-sobak'], sp: 'dog', icon: 'shield' },
  { key: 'miski', name: 'Миски', slugs: ['miski-dlja-sobak-i-koshek', 'miski-dlja-sobak-i-koshek-cat-products'], sp: 'both', icon: 'box' },
  { key: 'ot-bloh-i-kleshhej', name: 'От блох и клещей', slugs: ['sredstva-ot-bloh-i-kleshhej', 'sredstva-ot-bloh-i-kleshhej-cat-products'], sp: 'both', icon: 'shield' },
  { key: 'uhod-dlja-sobak', name: 'Уход за собаками', slugs: ['sredstva-dlja-uhoda-dlja-sobak'], sp: 'dog', icon: 'check' },
  { key: 'uhod-dlja-koshek', name: 'Уход за кошками', slugs: ['sredstva-dlja-uhoda-dlja-koshek'], sp: 'cat', icon: 'check' },
  { key: 'gruming', name: 'Груминг', slugs: ['gruming', 'gruming-cat-products', 'tovary-dlja-krasoty'], sp: 'both', icon: 'check' },
  { key: 'napolniteli', name: 'Наполнители для туалета', slugs: ['ever-dream'], sp: 'cat', icon: 'box' },
];
const catBySlug = new Map(CATS.flatMap(c => c.slugs.map(sl => [sl, c])));

const FLAVOR_RU = { salmon: 'Лосось', chicken: 'Курица', diet: 'Диета', lamb: 'Ягнёнок' };
const SPECIES_RU = { cat: 'Для кошек', dog: 'Для собак', both: 'Для кошек и собак' };
const price = p => Math.round(Number(p.priceMinor) / 10 ** (p.currencyMinorUnit ?? 2));
const ENT = { nbsp: ' ', amp: '&', quot: '"', laquo: '«', raquo: '»', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', hellip: '…' };
const stripHtml = h => String(h || '')
  .replace(/<(script|style)[\s\S]*?<\/(script|style)>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|li|h[1-6]|div|tr)>/gi, '\n')
  .replace(/<li[^>]*>/gi, '• ')
  .replace(/<[^>]+>/g, '')
  .replace(/&([a-z]+);/gi, (m, k) => ENT[k.toLowerCase()] ?? ' ')
  .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)));
const paras = h => stripHtml(h).split(/\n+/).map(x => x.trim()).filter(Boolean);

// 사료: 이름에서 맛·중량을 읽는다. 표시명·설명은 카피팀 문서(검증된 사실)만 쓴다 — 운영 설명·사진에는 확인 안 된 문구가 있다.
function feedInfo(p) {
  const n = p.name.toLowerCase().replace(/,/g, '.');
  const flavor = /лосос/.test(n) ? 'salmon' : /куриц/.test(n) ? 'chicken' : /диет/.test(n) ? 'diet' : /ягн/.test(n) ? 'lamb' : '';
  const sum = n.match(/(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)\s*кг/);
  const one = n.match(/(\d+(?:\.\d+)?)\s*кг/);
  const kg = sum ? Number(sum[1]) + Number(sum[2]) : one ? Number(one[1]) : 0;
  return { flavor, kg, pack: sum ? `${sum[1]} + ${sum[2]} кг` : `${kg} кг` };
}

const ALL = SOURCE.map(p => {
  const cat = p.categories.map(c => catBySlug.get(c.slug)).find(Boolean);
  if (!cat) throw new Error(`분류 없는 상품: ${p.id} ${p.name}`);
  const base = {
    id: p.id, sku: String(p.sku || p.id), slug: p.slug, name: p.name, cat: cat.key, catName: cat.name, species: cat.sp,
    price: price(p), inStock: !!p.inStock, url: `product/${p.slug}/`, reviews: p.reviewCount || 0,
    joyser: /joyser/i.test(p.name) || /^igrushki/.test(cat.key),
  };
  if (cat.feed) {
    const fi = feedInfo(p);
    const ct = contentFile[base.sku.split('-')[0]] || {};
    const group = `${cat.sp}-${fi.flavor}`;
    const bundle = /\+/.test(fi.pack);
    return { ...base, kind: 'feed', flavor: fi.flavor, kg: fi.kg, pack: fi.pack, group, content: ct,
      displayName: (ct.displayName || `Pure Nature ${{ salmon: 'с лососем', chicken: 'с курицей', diet: 'Диета', lamb: 'с ягнёнком' }[fi.flavor] || ''} для ${cat.sp === 'cat' ? 'кошек' : 'собак'}`) + (bundle ? ` · набор ${fi.pack}` : ''),
      image: `assets/img/p/p-${p.id}-600.webp`, thumb: `assets/img/p/p-${p.id}-300.webp` };
  }
  // 대표 이미지는 운영 사이트에서 판매 중인 것을 그대로 쓴다(2026-11-21 대표 지시 — 바꾸지 않는다)
  const local = existsSync(join(SRC, 'assets', 'img', 'p', `p-${p.id}-300.webp`));
  const ov = OV_DESC[String(p.id)] || {};
  return { ...base, kind: 'acc', displayName: JOYSER.products[String(p.id)]?.displayName || OV_NAMES[String(p.id)]?.displayName || ov.displayName || p.name, short: ov.short || '', bullets: ov.bullets || [], desc: ov.description?.length ? ov.description : paras(p.shortDescriptionHtml).concat(paras(p.descriptionHtml)),
    image: local ? `assets/img/p/p-${p.id}-600.webp` : 'assets/img/no-photo.svg', thumb: local ? `assets/img/p/p-${p.id}-300.webp` : 'assets/img/no-photo.svg' };
});
// 진열 순서: 재고 있음 먼저 → 사료 먼저(판매 순위: 고양이 연어 → 치킨 → 다이어트 → 강아지) → 작은 포장 먼저
const FEED_ORDER = ['cat-salmon', 'cat-chicken', 'cat-diet', 'dog-salmon', 'dog-lamb'];
ALL.sort((x, y) => (y.inStock - x.inStock) || ((x.kind === 'feed' ? 0 : 1) - (y.kind === 'feed' ? 0 : 1)) || (FEED_ORDER.indexOf(x.group) - FEED_ORDER.indexOf(y.group)) || ((x.kg || 0) - (y.kg || 0)));
const feeds = ALL.filter(i => i.kind === 'feed');
const accessories = ALL.filter(i => i.kind === 'acc');
// 이름이 똑같은 상품(색상만 다름 등)은 카드에 상품번호를 함께 보여 구별한다
const nameCount = ALL.reduce((m, i) => m.set(i.displayName, (m.get(i.displayName) || 0) + 1), new Map());
for (const i of ALL) i.dup = nameCount.get(i.displayName) > 1;


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

const PHONE = '+7&nbsp;914&nbsp;721&#8209;92&#8209;86';
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
  const src = u(size === 'thumb' ? item.thumb : item.image);
  const dim = size === 'thumb' ? 300 : 600;
  return `<img src="${esc(src)}" alt="${esc(item.displayName)}" width="${dim}" height="${dim}"${lazy ? ' loading="lazy" decoding="async"' : ' fetchpriority="high"'}${sizes ? ` sizes="${sizes}"` : ''}>`;
}

function card(item) {
  const perKg = item.kind === 'feed' ? `<span class="perkg">${rub(Math.round(item.price / item.kg))} / кг</span>` : '';
  const badge = item.kind === 'feed' ? `<span class="badge badge-gift">${icon('gift')}${esc(t('product.giftBadgeShort', 'Подарок'))}</span><span class="badge badge-kg">${esc(item.pack)}</span>` : '';
  const meta = item.kind === 'feed' ? `<span class="meta">${esc(item.pack)} · ${esc(FLAVOR_RU[item.flavor])}</span>` : `<span class="meta">${esc(item.catName)}${item.dup ? ` · арт. ${esc(item.sku)}` : ''}</span>`;
  return `<li class="card" data-kind="${item.kind}" data-cat="${item.cat}" data-stock="${item.inStock ? 1 : 0}" data-species="${item.species}" data-flavor="${item.flavor || ''}" data-kg="${item.kg || ''}" data-price="${item.price}" data-name="${esc(item.displayName.toLowerCase())}">
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
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title.length > 60 ? title.slice(0, 58).replace(/\s+\S*$/, '') + '…' : title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0B6B4A">
<link rel="canonical" href="${esc(canonicalLive)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${u('assets/img/og-1200x630.jpg')}"><meta property="og:locale" content="ru_RU">
<link rel="manifest" href="${u('manifest.webmanifest')}">
<link rel="icon" href="${u('assets/img/favicon-32.png')}" sizes="32x32"><link rel="apple-touch-icon" href="${u('assets/img/apple-touch-icon-180.png')}">
<link rel="preload" href="${u('assets/fonts/onest-ru.woff2')}" as="font" type="font/woff2" crossorigin>
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
    <a class="logo" href="${u('')}" aria-label="ДОМОКУП — на главную"><img src="${u('assets/img/logo-domokup.svg')}" alt="ДОМОКУП" width="42" height="40"></a>
    <form class="hdr-search" action="${u('search/')}" role="search">
      <label class="sr" for="q-hdr">${esc(t('nav.searchLabel', 'Поиск по каталогу'))}</label>
      <input id="q-hdr" name="q" type="search" autocomplete="off" placeholder="${esc(t('nav.searchPlaceholder', 'Например: корм для кошек с лососем'))}">
      <button type="submit" aria-label="${esc(t('nav.searchSubmit', 'Найти'))}">${icon('search')}</button>
    </form>
    <nav class="hdr-nav" aria-label="${esc(t('nav.mainLabel', 'Основное меню'))}">
      <a href="${u('catalog/korm-dlja-koshek/')}">${esc(t('nav.forCats', 'Для кошек'))}</a>
      <a href="${u('catalog/korm-dlja-sobak/')}">${esc(t('nav.forDogs', 'Для собак'))}</a>
      <a href="${u('catalog/')}">${esc(t('nav.catalog', 'Каталог'))}</a>
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
        <p class="ftr-brand"><img src="${u('assets/img/logo-domokup.svg')}" alt="ДОМОКУП" width="63" height="60" loading="lazy"></p>
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
        <p class="req"><a href="tel:+79147219286">${PHONE}</a></p>
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

// 홈 — 상품의 90%가 용품이므로 「분류로 바로 가기」를 첫 화면 가까이에 둔다
const catCount = key => ALL.filter(i => i.cat === key).length;
const catTiles = () => `<ul class="tiles">${CATS.filter(c => catCount(c.key)).map(c => `<li><a href="${u(`catalog/${c.key}/`)}"><span class="tile-ic">${icon(c.icon)}</span><span class="tile-t">${esc(c.name)}</span><span class="tile-n">${catCount(c.key)}</span></a></li>`).join('')}</ul>`;
const row = (title, href, items) => items.length ? `<section class="sec wrap">
  <div class="sec-h"><h2>${esc(title)}</h2><a href="${u(href)}">${esc(t('home.sections.showAll', 'Смотреть все'))} ${icon('arrow')}</a></div>
  <ul class="grid grid-scroll">${items.map(card).join('')}</ul>
</section>` : '';
const inCat = (key, n = 8) => ALL.filter(i => i.cat === key && i.inStock).slice(0, n);
{
  const usp = (C.home?.usp || []).slice(0, 4);
  const uspIcons = ['shield', 'box', 'gift', 'truck'];
  const body = `
<section class="hero">
  <picture class="hero-img"><source media="(min-width: 800px)" srcset="${u('assets/img/hero-cat-1600.webp')}" width="1600" height="825"><img src="${u('assets/img/hero-cat-800.webp')}" alt="${esc(t('home.heroAlt', 'Кошка и корма Pure Nature'))}" width="800" height="412" fetchpriority="high"></picture>
  <div class="hero-txt wrap">
    <p class="eyebrow">${esc(t('home.eyebrow', 'Pure Nature · Республика Корея'))}</p>
    <h1>${esc(t('home.heroTitle', 'Корма Pure Nature из Республики Корея'))}</h1>
    <p class="lead">${esc(t('home.heroSub', 'Официальный импорт. Внутри упаковки — пакеты поменьше.'))}</p>
    <div class="hero-cta"><a class="btn btn-primary" href="${u('catalog/korm-dlja-koshek/')}">${esc(t('home.heroCta', 'Выбрать корм'))}</a><a class="btn btn-light" href="#quiz">${esc(t('home.heroCtaSecondary', 'Подобрать за минуту'))}</a></div>
  </div>
</section>
<section class="usp wrap" aria-label="${esc(t('home.sections.trust', 'Почему нам доверяют'))}">
  <ul>${usp.map((x, i) => `<li>${icon(uspIcons[i] || 'check')}<div><b>${esc(fill(x.title))}</b><span>${esc(fill(x.text))}</span></div></li>`).join('')}</ul>
</section>
<section class="sec wrap" aria-labelledby="h-cats">
  <div class="sec-h"><h2 id="h-cats">${esc(t('home.sections.categories', 'Разделы каталога'))}</h2><a href="${u('catalog/')}">${esc(t('home.sections.showAll', 'Смотреть все'))} ${icon('arrow')}</a></div>
  ${catTiles()}
</section>
<section class="gift-banner wrap">
  <div>${icon('gift', 'ic-lg')}<div><h2>${esc(t('home.giftBanner.title', 'Игрушка JOYSER в подарок к каждому заказу корма'))}</h2><p>${esc(t('home.giftBanner.text', 'Подарок добавится в корзину автоматически.'))}</p></div></div>
</section>
${row(t('home.sections.forCats', 'Корм для кошек'), 'catalog/korm-dlja-koshek/', feeds.filter(f => f.species === 'cat' && f.inStock))}
<section class="sec wrap" id="quiz">
  <div class="quiz" data-quiz data-result-title="${esc(t('home.chooseQuiz.result.title', 'Вам подойдёт'))}" data-result-help="${esc(t('home.chooseQuiz.result.help', ''))}">
    <h2>${esc(t('home.chooseQuiz.title', 'Подберём корм за три вопроса'))}</h2>
    <div class="quiz-step" data-step="1"><p>${esc(t('home.chooseQuiz.steps.species.question', 'Для кого выбираете корм?'))}</p><div class="chips"><button type="button" data-v="cat">${esc(t('home.chooseQuiz.steps.species.options.cat', 'Для кошки'))}</button><button type="button" data-v="dog">${esc(t('home.chooseQuiz.steps.species.options.dog', 'Для собаки'))}</button></div></div>
    <div class="quiz-step" data-step="2" hidden><p>${esc(t('home.chooseQuiz.steps.weight.question', 'Кошке нужно следить за весом?'))}</p><div class="chips"><button type="button" data-v="diet">${esc(t('home.chooseQuiz.steps.weight.options.yes', 'Да'))}</button><button type="button" data-v="any">${esc(t('home.chooseQuiz.steps.weight.options.no', 'Нет'))}</button></div><p class="hint">${esc(t('home.chooseQuiz.steps.weight.hint', ''))}</p></div>
    <div class="quiz-step" data-step="3" hidden><p>${esc(t('home.chooseQuiz.steps.taste.question', 'Что питомец любит больше?'))}</p><div class="chips"><button type="button" data-v="salmon" data-only="">${esc(t('home.chooseQuiz.steps.taste.options.salmon', 'Лосось'))}</button><button type="button" data-v="chicken" data-only="cat">${esc(t('home.chooseQuiz.steps.taste.options.chicken', 'Курицу'))}</button><button type="button" data-v="lamb" data-only="dog">${esc(t('home.chooseQuiz.steps.taste.options.lamb', 'Ягнёнка'))}</button><button type="button" data-v="">${esc(t('home.chooseQuiz.steps.taste.options.any', 'Не знаю'))}</button></div></div>
    <div class="quiz-result" data-result hidden></div>
  </div>
</section>
${row(t('home.sections.forDogs', 'Корм для собак'), 'catalog/korm-dlja-sobak/', feeds.filter(f => f.species === 'dog' && f.inStock))}
${row('Игрушки для кошек', 'catalog/igrushki-dlja-koshek/', inCat('igrushki-dlja-koshek'))}
${row('Шлейки и поводки', 'catalog/amunicija-dlja-sobak/', inCat('amunicija-dlja-sobak'))}
${row('Миски', 'catalog/miski/', inCat('miski'))}
<section class="sec wrap trust">
  <h2>${esc(t('home.sections.trust', 'Почему нам доверяют'))}</h2>
  <ul class="trust-list">${(C.product?.trustBadges || []).map(x => typeof x === 'string' ? `<li>${icon('check')}<span>${esc(fill(x))}</span></li>` : `<li>${icon('check')}<span><b>${esc(fill(x.title))}</b> ${esc(fill(x.text))}</span></li>`).join('')}</ul>
  <div class="trust-cta"><a class="btn btn-light" href="${u('delivery/')}">${icon('truck')}${esc(t('pages.delivery.title', 'Доставка и оплата'))}</a><a class="btn btn-light" href="${u('contacts/')}">${icon('pin')}${esc(t('home.pickup', 'Самовывоз в Москве'))}</a></div>
</section>
<section class="sec wrap faq-mini">
  <div class="sec-h"><h2>${esc(t('nav.faq', 'Вопросы и ответы'))}</h2><a href="${u('faq/')}">${esc(t('home.sections.showAll', 'Смотреть все'))} ${icon('arrow')}</a></div>
  ${(C.pages?.faq || []).slice(0, 4).map(f => `<details><summary>${esc(fill(f.q))}</summary><p>${esc(fill(f.a))}</p></details>`).join('')}
</section>`;
  page('', layout({ path: '', title: t('meta.defaultTitle', 'ДОМОКУП — корма Pure Nature и товары для животных'), description: t('meta.defaultDescription', 'Интернет-магазин кормов Pure Nature и товаров для кошек и собак. Доставка СДЭК по России, самовывоз в Москве.'), body, jsonld: [ORG_LD], active: 'home' }));
}

// 카탈로그 — 전체 1쪽 + 분류 11쪽. 필터는 그 쪽에 있는 값만 보여 준다.
function catalogPage({ path, title, h1, intro = '', items, crumbsList, showCats = false }) {
  const allFeed = items.every(i => i.kind === 'feed');
  const flavors = allFeed ? [...new Set(items.map(i => i.flavor).filter(Boolean))] : [];
  const weights = allFeed ? [...new Set(items.map(i => i.kg).filter(Boolean))].sort((a, b) => a - b) : [];
  const species = [...new Set(items.map(i => i.species))];
  const hasBoth = species.includes('cat') || species.includes('both') ? species.includes('dog') || species.includes('both') : false;
  const cats = showCats ? CATS.filter(c => items.some(i => i.cat === c.key)) : [];
  const chip = (f, v, label, on) => `<button type="button" data-f="${f}" data-v="${v}" aria-pressed="${on}">${esc(label)}</button>`;
  const cr = crumbs(crumbsList);
  const joyBrand = JOYSER.brand && /^(igrushki|amunicija)/.test(path.split('/')[1] || '') ? `<div class="brand-note"><img src="${u('assets/img/logo-joyser.webp')}" alt="JOYSER" width="160" height="48" loading="lazy"><p>${esc(JOYSER.brand.aboutRu)}</p></div>` : '';
  const body = `${cr.html}
<section class="wrap cat-head"><h1>${esc(h1)}</h1>${joyBrand}${intro ? `<p class="muted">${esc(intro)}</p>` : ''}<p class="muted">${esc(t('catalog.resultsLabel', 'Товаров'))}: <span data-count>${items.length}</span></p></section>
<section class="wrap filters" data-filters>
  ${cats.length ? `<div class="chips" role="group" aria-label="${esc(t('catalog.filters.title', 'Раздел'))}">${chip('cat', '', t('catalog.filters.all', 'Все'), true)}${cats.map(c => chip('cat', c.key, c.name, false)).join('')}</div>` : ''}
  ${hasBoth ? `<div class="chips" role="group" aria-label="${esc(t('catalog.filters.species', 'Для кого'))}">${chip('species', '', t('catalog.filters.all', 'Все'), true)}${chip('species', 'cat', t('catalog.filters.speciesCat', 'Кошки'), false)}${chip('species', 'dog', t('catalog.filters.speciesDog', 'Собаки'), false)}</div>` : ''}
  ${flavors.length > 1 ? `<div class="chips" role="group" aria-label="${esc(t('catalog.filters.taste', 'Вкус'))}">${chip('flavor', '', t('catalog.filters.anyFlavor', 'Любой вкус'), true)}${flavors.map(f => chip('flavor', f, FLAVOR_RU[f], false)).join('')}</div>` : ''}
  ${weights.length > 1 ? `<div class="chips" role="group" aria-label="${esc(t('catalog.filters.packSize', 'Вес упаковки'))}">${chip('kg', '', t('catalog.filters.anyWeight', 'Любой вес'), true)}${weights.map(w => chip('kg', String(w), `${w} кг`, false)).join('')}</div>` : ''}
  <div class="filter-row">
    <label class="check"><input type="checkbox" data-stock-only>${esc(t('catalog.filters.inStockOnly', 'Только в наличии'))}</label>
    <label class="sort"><span>${esc(t('catalog.sort.label', 'Сортировка'))}</span><select data-sort><option value="pop">${esc(t('catalog.sort.popular', 'По популярности'))}</option><option value="asc">${esc(t('catalog.sort.priceAsc', 'Сначала дешевле'))}</option><option value="desc">${esc(t('catalog.sort.priceDesc', 'Сначала дороже'))}</option>${weights.length ? `<option value="kg">${esc(t('catalog.sort.perKg', 'Цена за кг'))}</option>` : ''}</select></label>
  </div>
</section>
<section class="wrap"><ul class="grid" data-grid>${items.map(card).join('')}</ul><p class="empty" data-empty hidden>${esc(t('catalog.empty.text', 'Ничего не нашлось. Попробуйте изменить фильтры.'))}</p></section>`;
  page(path, layout({ path, title, description: `${h1} — ${items.length} товаров в интернет-магазине ДОМОКУП. Доставка СДЭК по России, самовывоз в Москве.`, body, jsonld: [cr.ld], active: 'catalog' }));
}
const HOME = t('nav.bottomTabs.home', 'Главная');
const CATALOG = t('nav.bottomTabs.catalog', 'Каталог');
catalogPage({ path: 'catalog/', title: `${CATALOG} — ДОМОКУП`, h1: CATALOG, items: ALL, showCats: true, crumbsList: [[HOME, ''], [CATALOG, 'catalog/']] });
for (const c of CATS) {
  const items = ALL.filter(i => i.cat === c.key);
  if (!items.length) continue;
  catalogPage({ path: `catalog/${c.key}/`, title: `${c.name} — ДОМОКУП`, h1: c.name, items, crumbsList: [[HOME, ''], [CATALOG, 'catalog/'], [c.name, `catalog/${c.key}/`]] });
}

// 상품 상세
for (const it of ALL) {
  const isFeed = it.kind === 'feed';
  const ct = it.content || {};
  const siblings = isFeed ? feeds.filter(f => f.group === it.group) : [];
  const section = [it.catName, `catalog/${it.cat}/`];
  const cr = crumbs([[HOME, ''], [CATALOG, 'catalog/'], section, [it.displayName, it.url]]);
  const tabs = [];
  const desc = isFeed ? (ct.description || []).map(p => `<p>${esc(fill(p))}</p>`).join('') : (it.desc || []).map(p => `<p>${esc(p)}</p>`).join('');
  tabs.push(['description', t('product.tabs.description', 'Описание'), (desc || `<p>${esc(it.name)}</p>`) + (isFeed ? `<p class="muted">${esc(t('product.healthDisclaimer', ''))}</p>` : '')]);
  // 칼슘 표기: 제조사 사이트 글자칸은 「칼륨」이지만 공식몰 이미지(원재료·영양표)는 「칼슘」 — 글자칸 오타로 판정(11/21 조사팀). 최종은 러시아어 라벨로 확정
  const compRows = ct.composition || [];
  if (isFeed) tabs.push(['composition', t('product.tabs.composition', 'Состав'), (compRows.length ? `<table class="spec"><tbody>${compRows.map(r => `<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.value)}</td></tr>`).join('')}</tbody></table><p class="muted">${esc(t('product.compositionPending', ''))}</p>` : `<p>${esc(t('product.compositionPending', ''))}</p>`)]);
  if (isFeed) tabs.push(['feeding', t('product.tabs.feeding', 'Кормление'), ct.feeding?.rows ? `<div class="tbl"><table class="feed"><thead><tr>${ct.feeding.columns.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${ct.feeding.rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table></div><ul class="notes">${(ct.feeding.notes || []).map(n => `<li>${esc(fill(n))}</li>`).join('')}</ul><p class="muted">${esc(t('product.feedingDisclaimer', ''))}</p>` : `<p>${esc(t('product.feedingPending', 'Норма кормления указана на упаковке.'))}</p>`]);
  tabs.push(['delivery', t('product.tabs.delivery', 'Доставка'), `<p>${esc(t('pages.delivery.intro', 'Доставка СДЭК по всей России, самовывоз в Москве.'))}</p><p><a href="${u('delivery/')}">${esc(t('pages.delivery.title', 'Доставка и оплата'))} ${icon('arrow')}</a></p>`]);
  tabs.push(['reviews', `${t('product.tabs.reviews', 'Отзывы')} (${it.reviews || 0})`, `<p class="muted">${esc(t('product.reviewsEmpty', 'Отзывов пока нет.'))}</p>`]);

  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: it.name, sku: it.sku, image: `https://domokup.ru/${it.url}`, ...(isFeed ? { brand: { '@type': 'Brand', name: 'Pure Nature' } } : /joyser/i.test(it.name) ? { brand: { '@type': 'Brand', name: 'JOYSER' } } : {}), offers: { '@type': 'Offer', price: it.price, priceCurrency: 'RUB', availability: it.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: `https://domokup.ru/${it.url}` } };
  const related = isFeed ? feeds.filter(f => f.species === it.species && f.group !== it.group && f.inStock) : ALL.filter(i => i.cat === it.cat && i.id !== it.id && i.inStock).slice(0, 8);
  const body = `${cr.html}
<article class="wrap pdp" data-product data-sku="${esc(it.sku)}">
  <div class="pdp-media">${img(it, 'full', { lazy: false })}${isFeed ? `<span class="badge badge-gift">${icon('gift')}${esc(t('product.giftBadgeShort', 'Подарок'))}</span><span class="badge badge-kg">${esc(it.pack)}</span>` : ''}</div>
  <div class="pdp-info">
    <p class="eyebrow">${isFeed ? `Pure Nature · ${esc(SPECIES_RU[it.species])}` : esc(it.catName)}</p>
    <h1>${esc(it.displayName)}</h1>
    ${ct.shortTagline ? `<p class="lead">${esc(fill(ct.shortTagline))}</p>` : it.short ? `<p class="lead">${esc(it.short)}</p>` : ''}
    <p class="muted">${esc(t('product.sku', 'Артикул'))}: ${esc(it.sku)}</p>
    ${siblings.length > 1 ? `<div class="weights" role="group" aria-label="${esc(t('product.weight', 'Вес'))}"><span>${esc(t('product.otherWeights', 'Вес упаковки'))}</span>${siblings.map(s => `<a${s.id === it.id ? ' aria-current="true" class="w-on"' : ''} href="${u(s.url)}">${esc(s.pack)}<small>${rub(Math.round(s.price / s.kg))}/кг${s.inStock ? '' : ' · нет'}</small></a>`).join('')}</div>` : ''}
    <div class="pdp-price"><b>${rub(it.price)}</b>${isFeed ? `<span class="perkg">${rub(Math.round(it.price / it.kg))} / кг</span>` : ''}</div>
    <p class="stock ${it.inStock ? 'ok' : 'no'}">${icon(it.inStock ? 'check' : 'close')}${esc(it.inStock ? t('product.inStock', 'В наличии') : t('product.outOfStock', 'Нет в наличии'))}</p>
    ${isFeed ? `<p class="gift-note">${icon('gift')}<span>${esc(t('product.giftNote', 'Игрушка JOYSER в подарок к каждому заказу корма'))}</span></p>` : it.joyser ? `<p class="gift-note">${icon('gift')}<span>${esc(t('home.giftBanner.note', 'Каждый месяц — промокод на скидку 7 % на игрушки и шлейки JOYSER.'))}</span></p>` : ''}
    <div class="pdp-buy">
      ${it.inStock ? `<div class="qty" data-qty><button type="button" data-step="-1" aria-label="Меньше">${icon('minus')}</button><input type="number" min="1" max="20" value="1" inputmode="numeric" aria-label="${esc(t('product.quantity', 'Количество'))}"><button type="button" data-step="1" aria-label="Больше">${icon('plus')}</button></div><button class="btn btn-primary btn-wide" type="button" data-add="${esc(it.sku)}" data-with-qty>${icon('cart')}${esc(t('product.addToCart', 'В корзину'))}</button>` : `<a class="btn btn-primary btn-wide" href="https://t.me/domopet_kor" target="_blank" rel="noopener">${icon('bell')}${esc(t('product.notifyMe', 'Сообщить о поступлении'))}</a>`}
    </div>
    <ul class="pdp-facts">
      <li>${icon('truck')}<span>${esc(t('product.deliveryEstimate', 'Срок и стоимость доставки рассчитаем при оформлении заказа.'))}</span></li>
      <li>${icon('pin')}<span>${esc(t('product.pickupNote', 'Самовывоз в Москве: ул. Производственная, д. 11, стр. 1'))}</span></li>
      ${isFeed ? `<li>${icon('shield')}<span>${esc(t('maker.short', ''))}</span></li>` : ''}
      ${isFeed ? `<li>${icon('shield')}<span>${esc(t('product.importNote', 'Официальный импорт: данные импортёра на русской этикетке'))}</span></li>` : ''}
    </ul>
    ${(ct.bullets || it.bullets || []).length ? `<ul class="bullets">${(ct.bullets || it.bullets).map(b => `<li>${icon('check')}<span>${esc(fill(b))}</span></li>`).join('')}</ul>` : ''}
  </div>
  <div class="pdp-tabs" data-tabs>
    <div class="tablist" role="tablist">${tabs.map(([id, label], i) => `<button type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(label)}</button>`).join('')}</div>
    ${tabs.map(([id, , html], i) => `<section role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}"${i === 0 ? '' : ' hidden'}>${html}</section>`).join('')}
  </div>
</article>
${related.length ? `<section class="sec wrap"><div class="sec-h"><h2>${esc(t('product.relatedTitle', 'Вам может пригодиться'))}</h2></div><ul class="grid grid-scroll">${related.map(card).join('')}</ul></section>` : ''}
<div class="buybar" data-buybar><div><b>${rub(it.price)}</b><small>${esc(it.displayName)}</small></div>${it.inStock ? `<button class="btn btn-primary" type="button" data-add="${esc(it.sku)}">${esc(t('product.addToCart', 'В корзину'))}</button>` : `<a class="btn btn-primary" href="https://t.me/domopet_kor" target="_blank" rel="noopener">${esc(t('product.notifyShort', 'Сообщить'))}</a>`}</div>`;
  const descMeta = (fill(ct.shortTagline) || it.short || (it.desc || [])[0] || it.name).slice(0, 155);
  page(it.url, layout({ path: it.url, title: `${it.displayName} — ДОМОКУП`, description: descMeta, body, jsonld: [ld, cr.ld], active: 'catalog' }));
}

// 장바구니·결제(데모)·검색
page('cart/', layout({ path: 'cart/', title: `${t('nav.bottomTabs.cart', 'Корзина')} — ДОМОКУП`, description: "Корзина интернет-магазина ДОМОКУП: товары, подарок к заказу корма и промокод.", active: 'cart', body: `
<section class="wrap cart" data-cart-page>
  <h1>${esc(t('nav.bottomTabs.cart', 'Корзина'))}</h1>
  <div data-cart-empty class="empty-state">${icon('cart', 'ic-lg')}<p>${esc(t('cart.empty.title', 'Корзина пока пуста'))}</p><a class="btn btn-primary" href="${u('catalog/')}">${esc(t('cart.empty.cta', 'Перейти в каталог'))}</a></div>
  <div data-cart-full hidden>
    <ul class="cart-lines" data-cart-lines></ul>
    <form class="coupon" data-coupon><label for="coupon">${esc(t('cart.coupon.label', 'Промокод'))}</label><div><input id="coupon" type="text" autocomplete="off" placeholder="JOY7-NOV26"><button class="btn btn-light" type="submit">${esc(t('cart.coupon.apply', 'Применить'))}</button></div><p class="coupon-msg" data-coupon-msg></p></form>
    <dl class="totals" data-totals></dl>
    <a class="btn btn-primary btn-wide" href="${u('checkout/')}">${esc(t('cart.checkout', 'Перейти к оформлению'))}</a>
  </div>
</section>` }));

// 결제 흐름(데모) — 운영과 같은 순서를 그대로 보여 준다:
// 주문서(WooCommerce) → 「Перейти к оплате」 → PayKeeper 결제 화면(카드·СБП) → 성공 / 실패 화면.
// 🔴 데모: 입력칸은 잠겨 있고 어떤 정보도 보내지 않는다. 실제 운영에서는 WooCommerce 기본 결제 화면 + PayKeeper 모듈을 그대로 쓴다(테마는 모양만 바꾼다).
const DEMO = 'Демонстрация: так будет выглядеть этот шаг. Платёж не выполняется, данные не передаются.';
page('checkout/', layout({ path: 'checkout/', title: `${t('checkout.title', 'Оформление заказа')} — ДОМОКУП`, description: 'Оформление заказа в интернет-магазине ДОМОКУП: доставка СДЭК, самовывоз в Москве, оплата картой или через СБП.', active: 'cart', body: `
<section class="wrap checkout">
  <h1>${esc(t('checkout.title', 'Оформление заказа'))}</h1>
  <p class="demo-note" role="note">${esc(t('checkout.demoNotice', DEMO))}</p>
  <ol class="steps"><li aria-current="step">${esc(t('checkout.steps.contacts', 'Контакты'))}</li><li>${esc(t('checkout.steps.delivery', 'Доставка'))}</li><li>${esc(t('checkout.steps.payment', 'Оплата'))}</li></ol>
  <form data-checkout novalidate autocomplete="off">
    <fieldset><legend>${esc(t('checkout.steps.contacts', 'Контакты'))}</legend>
      <label>${esc(t('checkout.fields.name', 'Имя и фамилия'))}<input name="n" type="text" disabled placeholder="Иван Иванов"></label>
      <label>${esc(t('checkout.fields.phone', 'Телефон'))}<input name="p" type="tel" disabled placeholder="+7"></label>
      <label>${esc(t('checkout.fields.email', 'Электронная почта'))}<input name="e" type="email" disabled placeholder="для чека и статуса заказа"></label>
    </fieldset>
    <fieldset><legend>${esc(t('checkout.deliveryMethods.title', 'Способ доставки'))}</legend>
      <label class="radio"><input type="radio" name="d" checked><span>${esc(t('checkout.deliveryMethods.cdekPickupPoint', 'СДЭК — пункт выдачи'))}<small>${esc(t('checkout.deliveryMethods.cdekPickupPointHint', 'Выберите удобный пункт на карте'))}</small></span></label>
      <label class="radio"><input type="radio" name="d"><span>${esc(t('checkout.deliveryMethods.courier', 'Курьерская доставка'))}<small>${esc(t('checkout.deliveryMethods.courierHint', 'Привезём по указанному адресу'))}</small></span></label>
      <label class="radio"><input type="radio" name="d"><span>${esc(t('checkout.deliveryMethods.selfPickup', 'Самовывоз в Москве'))}<small>${esc(fill(t('checkout.deliveryMethods.selfPickupHint', 'ул. Производственная, д. 11, стр. 1')))}</small></span></label>
    </fieldset>
    <fieldset><legend>${esc(t('checkout.paymentMethods.title', 'Способ оплаты'))}</legend>
      <label class="radio"><input type="radio" name="pay" checked><span>${esc('Онлайн: банковская карта или СБП')}<small>${esc(t('checkout.paymentMethods.provider', 'Платёж проходит через защищённый сервис PayKeeper. Данные карты мы не видим и не храним.'))}</small></span></label>
    </fieldset>
    <dl class="totals" data-totals></dl>
    <label class="check"><input type="checkbox" data-consent required><span>${esc(t('checkout.consents.personalData', 'Я даю согласие на обработку персональных данных'))}</span></label>
    <label class="check"><input type="checkbox"><span>${esc(t('checkout.consents.marketing', 'Хочу получать новости и персональные предложения'))}</span></label>
    <p class="coupon-msg" data-consent-msg hidden>${esc(t('checkout.consents.personalDataRequired', 'Без этого согласия мы не сможем оформить заказ.'))}</p>
    <button class="btn btn-primary btn-wide" type="submit">${esc('Перейти к оплате')}</button>
    <p class="muted">${esc('После нажатия откроется защищённая страница оплаты PayKeeper. После оплаты Вы вернётесь на сайт и увидите номер заказа.')}</p>
  </form>
</section>` }));

page('checkout/pay/', layout({ path: 'checkout/pay/', title: 'Оплата заказа — ДОМОКУП', description: 'Шаг оплаты: защищённая страница PayKeeper, банковская карта или СБП.', active: 'cart', body: `
<section class="wrap checkout">
  <p class="demo-note" role="note">${esc('Демонстрация страницы оплаты PayKeeper. В рабочей версии здесь откроется сервис оплаты банка; на сайте данные карты не вводятся.')}</p>
  <div class="paybox">
    <p class="eyebrow">PayKeeper · АО «Альфа-Банк»</p>
    <h1>${esc('Оплата заказа')}</h1>
    <dl class="totals" data-totals></dl>
    <div class="pay-methods"><span class="pm">Банковская карта</span><span class="pm">СБП</span></div>
    <div class="pay-actions">
      <a class="btn btn-primary btn-wide" href="${u('checkout/order-received/')}" data-pay-ok>${esc('Показать: оплата прошла')}</a>
      <a class="btn btn-light btn-wide" href="${u('checkout/payment-failed/')}">${esc('Показать: оплата не прошла')}</a>
    </div>
  </div>
</section>` }));

page('checkout/order-received/', layout({ path: 'checkout/order-received/', title: 'Заказ оплачен — ДОМОКУП', description: 'Заказ оплачен. Чек придёт на электронную почту.', active: 'cart', body: `
<section class="wrap empty-state">
  ${icon('check', 'ic-lg')}
  <h1>${esc('Спасибо! Заказ оплачен')}</h1>
  <p>${esc('Номер заказа: № 0000 (демо). Электронный чек придёт на почту, статус заказа — в сообщении.')}</p>
  <p class="demo-note" role="note">${esc('Демонстрация. В рабочей версии номер заказа и чек формирует магазин после подтверждения оплаты банком.')}</p>
  <a class="btn btn-primary" href="${u('catalog/')}">${esc(t('cart.continueShopping', 'Продолжить покупки'))}</a>
</section>` }));

page('checkout/payment-failed/', layout({ path: 'checkout/payment-failed/', title: 'Оплата не прошла — ДОМОКУП', description: 'Оплата не прошла. Заказ сохранён, можно оплатить ещё раз.', active: 'cart', body: `
<section class="wrap empty-state">
  ${icon('close', 'ic-lg')}
  <h1>${esc('Оплата не прошла')}</h1>
  <p>${esc('Деньги не списаны. Заказ сохранён — можно попробовать ещё раз или выбрать другой способ: карта или СБП.')}</p>
  <a class="btn btn-primary" href="${u('checkout/pay/')}">${esc('Оплатить ещё раз')}</a>
  <a class="btn btn-light" href="https://t.me/domopet_kor" target="_blank" rel="noopener">${icon('tg')}${esc('Написать нам')}</a>
</section>` }));

page('search/', layout({ path: 'search/', title: `${t('nav.bottomTabs.search', 'Поиск')} — ДОМОКУП`, description: "Поиск по каталогу ДОМОКУП: корма Pure Nature, игрушки, шлейки, миски и товары для ухода.", active: 'search', body: `
<section class="wrap search-page">
  <h1>${esc(t('nav.bottomTabs.search', 'Поиск'))}</h1>
  <form role="search" data-search-form><label class="sr" for="q">${esc(t('nav.searchLabel', 'Поиск'))}</label><input id="q" name="q" type="search" autocomplete="off" placeholder="${esc(t('nav.searchPlaceholder', 'Например: пюр натур лосось'))}"><button class="btn btn-primary" type="submit">${esc(t('nav.searchSubmit', 'Найти'))}</button></form>
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
<li>${icon('chat')}<div><b>${esc(t('pages.contacts.phoneLabel', 'Телефон'))}</b><a href="tel:+79147219286">${PHONE}</a></div></li>
<li>${icon('pin')}<div><b>${esc(t('pages.contacts.pickup', 'Самовывоз'))}</b><span>${esc(fill(t('pages.contacts.pickupText', 'г. Москва, ул. Производственная, д. 11, стр. 1 · {{PICKUP_HOURS}}')))}</span></div></li>
</ul>
<p class="req">${esc(t('footer.requisites', 'ИП Цхай Наталья Генадьевна · ИНН 250908672910 · ОГРНИП 319253600007389'))}</p>`);

page('404.html', layout({ path: '404.html', title: 'Страница не найдена — ДОМОКУП', description: "Такой страницы нет. Перейдите в каталог интернет-магазина ДОМОКУП.", body: `<section class="wrap empty-state">${icon('paw', 'ic-lg')}<h1>${esc(t('pages.notFound.title', 'Страница не найдена'))}</h1><a class="btn btn-primary" href="${u('catalog/')}">${esc(t('cart.empty.cta', 'Перейти в каталог'))}</a></section>` }));
page('offline/', layout({ path: 'offline/', title: 'Нет соединения — ДОМОКУП', description: "Нет подключения к интернету. Корзина сохранится.", body: `<section class="wrap empty-state">${icon('paw', 'ic-lg')}<h1>${esc(t('pages.offline', 'Нет подключения к интернету'))}</h1><p>${esc(t('pages.offlineText', 'Корзина сохранится. Проверьте соединение и обновите страницу.'))}</p></section>` }));

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
const clientData = ALL.map(i => ({ s: i.sku, n: i.displayName, f: i.name, p: i.price, k: i.kind, sp: i.species, fl: i.flavor || '', kg: i.kg || 0, u: i.url, t: i.thumb, c: i.cat, j: i.joyser ? 1 : 0, st: i.inStock ? 1 : 0 }));
writeFileSync(join(DIST, 'data.json'), JSON.stringify({ v: BUILD_DATE, gift: { ...(C.gift || {}), line: t('cart.giftLine', C.gift?.line) }, coupons: [{ code: 'JOY7-NOV26', pct: 7, scope: 'joyser', until: '2026-11-30', single: true }], items: clientData }));

writeFileSync(join(DIST, 'manifest.webmanifest'), toRel(JSON.stringify({
  name: 'ДОМОКУП — корма Pure Nature', short_name: 'ДОМОКУП', lang: 'ru', start_url: './', scope: './', display: 'standalone',
  background_color: '#ffffff', theme_color: '#0B6B4A',
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
console.log(`페이지 ${pages.length}개 · 사료 ${feeds.length} · 용품 ${accessories.length} · 전체 ${(total / 1024).toFixed(0)}KB`);
if (big.length) console.log('⚠ 200KB 넘는 이미지:', big.join(', '));
