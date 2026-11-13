// Thread — карта связей во вкладке «Отношения».
// Раскладка, цвета, толщина и пунктир линий, дуги между персонажами, перетаскивание, зум и легенда —
// по Storyline (mapSvg / legendHtml / обработчики карты). Своё — плашка-досье по клику на персонажа.

import { getSettings, saveSettings, escapeHtml, relLevel, modeOf, getState, saveState } from './store.js';
import { relVal, signed, LINK_LABELS } from './judge.js';
import { avatarFor, personaThumb } from './avatars.js';
import { personaDisplayName } from './context.js';

// Поле карты в единицах SVG. У Storyline 300×232 и радиус 80 — у нас до 12 человек, круг пошире.
const W = 340;
const H = 300;
const CX = 170;
const CY = 140;
const R = 110;
const MAX_NODES = 12;
const ZMIN = 0.5;
const ZMAX = 3;

// Палитра Storyline, чуть плотнее — чтобы не тонула на тёмной теме
const C_WARM = '#e8869d';
const C_FRIEND = '#dcae5c';
const C_NEUTRAL = '#a39dad';
const C_COLD = '#c04a64';
const TYPE_COLOR = {
    romance: C_WARM, friendship: C_FRIEND, trust: C_FRIEND, family: '#7fb47e',
    business: '#6f9cc6', rivalry: '#d88848', enmity: C_COLD, secret: '#a987cc',
};

/**
 * Мини-окошко на карте: { kind: 'pair' | 'person', key, x, y } | null — x, y: место тапа внутри карты (px).
 * flash — к какой карточке прокрутить в списке.
 */
export const mapUi = { pop: null, flash: '' };

const low = (s) => String(s || '').toLowerCase();

function youColor(v) {
    return v >= 40 ? C_WARM : v >= 10 ? C_FRIEND : v > -10 ? C_NEUTRAL : C_COLD;
}

function pairColor(p) {
    let best = '';
    let bv = 0;
    for (const [k, val] of Object.entries(p?.types || {})) {
        const a = Math.abs(parseInt(val, 10) || 0);
        if (a > bv) { bv = a; best = k; }
    }
    return TYPE_COLOR[best] || youColor(p?.v || 0);
}

// ---------- Вид: режим, зум, сдвиг ----------

export function relView() {
    return getSettings().relView === 'list' ? 'list' : 'map';
}

function zoom() {
    const z = parseFloat(getSettings().mapZoom);
    return z >= ZMIN && z <= ZMAX ? z : 1;
}

function pan() {
    const p = getSettings().mapPan || {};
    const x = parseFloat(p.x);
    const y = parseFloat(p.y);
    return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

function viewTransform(p = pan(), z = zoom()) {
    return `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) translate(${CX} ${CY}) scale(${z}) translate(${-CX} ${-CY})`;
}

// ---------- Раскладка ----------

/** Кто попадает на карту: до 12 с самыми сильными отношениями, по кругу — от тёплых к холодным. */
function shownNames(st) {
    const all = Object.keys(st.rels || {});
    const top = all.slice().sort((a, b) => Math.abs(relVal(st, b)) - Math.abs(relVal(st, a))).slice(0, MAX_NODES);
    return { names: top.sort((a, b) => relVal(st, b) - relVal(st, a)), more: Math.max(0, all.length - top.length) };
}

function layout(st, names) {
    const n = names.length;
    const pos = {};
    names.forEach((name, i) => {
        // при двух узлах второй сдвигаем с диаметра — получается треугольник с центром, линии не сливаются
        const a = (n === 2 && i === 1) ? Math.PI / 6 : -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const own = st.mapPos?.[low(name)];
        pos[low(name)] = own && Number.isFinite(own.x) && Number.isFinite(own.y)
            ? { x: own.x, y: own.y }
            : { x: Math.round(CX + R * Math.cos(a)), y: Math.round(CY + R * Math.sin(a)) };
    });
    return pos;
}

/** Дуга между двумя точками — как у Storyline: изгиб в сторону, чтобы не сливалась с линиями к центру. */
function arcPath(a, b) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const ln = Math.sqrt(dx * dx + dy * dy) || 1;
    const off = Math.max(20, Math.min(38, ln * 0.24));
    const qx = (mx - (dy / ln) * off).toFixed(1);
    const qy = (my + (dx / ln) * off).toFixed(1);
    return `M${a.x} ${a.y} Q${qx} ${qy} ${b.x} ${b.y}`;
}

function relHistCount(st, name) {
    return (st.log || []).filter((e) => e && e.kind === 'REL' && low(e.target) === low(name)).length;
}

function shortName(name) {
    return name.length > 10 ? `${name.slice(0, 9)}…` : name;
}

function initial(name) {
    return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

// ---------- SVG ----------

function svgHtml(st, names) {
    const pos = layout(st, names);
    const out = [];
    // линии от тебя
    for (const name of names) {
        const p = pos[low(name)];
        const v = relVal(st, name);
        const w = 2 + Math.min(3, Math.round(Math.abs(v) / 25));
        out.push(`<line data-rl="${escapeHtml(low(name))}" x1="${CX}" y1="${CY}" x2="${p.x}" y2="${p.y}" stroke="${youColor(v)}" stroke-width="${w}" opacity="0.75"${relHistCount(st, name) < 2 ? ' stroke-dasharray="4 4"' : ''} />`);
    }
    // дуги между персонажами
    for (const [key, pe] of Object.entries(st.pairs || {})) {
        if (!pe) continue;
        const a = pos[low(pe.a)];
        const b = pos[low(pe.b)];
        if (!a || !b || a === b) continue;
        const v = Math.abs(pe.v || 0);
        const w = 1.5 + Math.min(2.5, v / 30);
        const dash = v <= 5 || Boolean(pe.types?.secret);
        const d = arcPath(a, b);
        out.push(`<g class="thr-map-pair" data-pair="${escapeHtml(key)}" data-a="${escapeHtml(low(pe.a))}" data-b="${escapeHtml(low(pe.b))}">
            <path d="${d}" fill="none" stroke="transparent" stroke-width="14" />
            <path d="${d}" fill="none" stroke="${pairColor(pe)}" stroke-width="${w.toFixed(1)}" opacity="0.9"${dash ? ' stroke-dasharray="4 4"' : ''} />
        </g>`);
    }
    // ты в центре
    const me = personaThumb();
    const meName = personaDisplayName() || 'Ты';
    out.push(`<g class="thr-map-me">
        <circle class="thr-map-me-ring" cx="${CX}" cy="${CY}" r="22" />
        ${me
            ? `<clipPath id="thr-mcp-me"><circle cx="${CX}" cy="${CY}" r="20" /></clipPath><image href="${escapeHtml(me)}" x="${CX - 20}" y="${CY - 20}" width="40" height="40" preserveAspectRatio="xMidYMid slice" clip-path="url(#thr-mcp-me)" />`
            : `<text class="thr-map-ini" x="${CX}" y="${CY + 5}">${escapeHtml(initial(meName))}</text>`}
        <text class="thr-map-label thr-map-label-me" x="${CX}" y="${CY + 36}">${escapeHtml(shortName(meName))}</text>
    </g>`);
    // персонажи
    names.forEach((name, i) => {
        const p = pos[low(name)];
        const v = relVal(st, name);
        const url = avatarFor(st, name);
        const sel = mapUi.pop?.kind === 'person' && mapUi.pop.key === name;
        out.push(`<g class="thr-map-node${sel ? ' thr-sel' : ''}" data-person="${escapeHtml(name)}" data-k="${escapeHtml(low(name))}">
            <circle class="thr-map-dot" cx="${p.x}" cy="${p.y}" r="18" stroke="${youColor(v)}" />
            ${url
                ? `<clipPath id="thr-mcp-${i}"><circle cx="${p.x}" cy="${p.y}" r="16" /></clipPath><image href="${escapeHtml(url)}" x="${p.x - 16}" y="${p.y - 16}" width="32" height="32" preserveAspectRatio="xMidYMid slice" clip-path="url(#thr-mcp-${i})" />`
                : `<text class="thr-map-ini" x="${p.x}" y="${p.y + 5}">${escapeHtml(initial(name))}</text>`}
            <text class="thr-map-label" x="${p.x}" y="${p.y + 31}">${escapeHtml(shortName(name))}</text>
        </g>`);
    });
    return `<svg class="thr-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Карта связей">
        <g class="thr-map-view" transform="${viewTransform()}">${out.join('')}</g>
    </svg>`;
}

// ---------- Плашки под картой ----------

function pairText(pe) {
    const types = Object.entries(pe.types || {}).filter(([, v]) => v != null)
        .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
        .map(([k, v]) => `${LINK_LABELS[k] || k} ${signed(parseInt(v, 10) || 0)}`);
    return types.length ? types.join(' · ') : signed(pe.v || 0);
}

function popHtml(st) {
    const pop = mapUi.pop;
    if (!pop) return '';
    const at = `style="left:${Math.round(pop.x || 0)}px;top:${Math.round(pop.y || 0)}px" data-x="${Math.round(pop.x || 0)}" data-y="${Math.round(pop.y || 0)}"`;
    if (pop.kind === 'pair') {
        const pe = st.pairs?.[pop.key];
        if (!pe) { mapUi.pop = null; return ''; }
        return `<div class="thr-card thr-map-pop" ${at}>
            <div><b>${escapeHtml(pe.a)} ⟷ ${escapeHtml(pe.b)}</b> · ${escapeHtml(pairText(pe))}</div>
            ${pe.note ? `<div class="thr-note">${escapeHtml(pe.note)}</div>` : ''}
        </div>`;
    }
    const name = pop.key;
    if (st.rels?.[name] == null) { mapUi.pop = null; return ''; }
    const v = relVal(st, name);
    const url = avatarFor(st, name);
    const facts = modeOf('facts') === 'on' ? (st.facts?.[name] || []).length : null;
    const links = Object.values(st.pairs || {}).filter((p) => p && (low(p.a) === low(name) || low(p.b) === low(name))).length;
    const counts = [facts != null ? `Фактов: ${facts}` : '', `Связей: ${links}`].filter(Boolean).join(' · ');
    return `<div class="thr-card thr-map-pop" ${at}>
        <div class="thr-map-pop-head">
            <span class="thr-map-pop-who">
                ${url ? `<img class="thr-ava thr-ava-sm" src="${escapeHtml(url)}" alt="" loading="lazy" />` : `<span class="thr-ava thr-ava-sm thr-ava-empty">${escapeHtml(initial(name))}</span>`}
                <span><b>${escapeHtml(name)}</b><br><span class="${v > 0 ? 'thr-up' : v < 0 ? 'thr-down' : ''}">${escapeHtml(relLevel(v))} ${signed(v)}</span></span>
            </span>
        </div>
        <div class="thr-note">${escapeHtml(counts)}</div>
        <button class="menu_button thr-wide-btn" type="button" data-act="maptocard" data-name="${escapeHtml(name)}"><i class="fa-solid fa-id-card"></i><span>К карточке</span></button>
    </div>`;
}

function legendHtml() {
    const row = (items) => `<div class="thr-map-legend">${items.map(([c, t]) => `<span><i style="background:${c}"></i>${escapeHtml(t)}</span>`).join('')}</div>`;
    return `
        <details class="thr-genre thr-map-legsec" ${getSettings().mapLegend ? 'open' : ''}>
            <summary><b>Легенда</b></summary>
            <div class="thr-sec">Линии к тебе — как к тебе относятся</div>
            ${row([[C_WARM, 'тепло: +40 и выше'], [C_FRIEND, 'симпатия: +10…+39'], [C_NEUTRAL, 'нейтрально: +9…−9'], [C_COLD, 'холодно: −10 и ниже']])}
            <div class="thr-sec">Между персонажами — тип связи</div>
            ${row([[TYPE_COLOR.romance, 'романтика'], [TYPE_COLOR.friendship, 'дружба/доверие'], [TYPE_COLOR.family, 'семья'], [TYPE_COLOR.business, 'деловые'], [TYPE_COLOR.rivalry, 'соперничество'], [TYPE_COLOR.enmity, 'вражда'], [TYPE_COLOR.secret, 'тайна']])}
            <div class="thr-note">толще — сильнее · пунктир — тайная или хрупкая связь</div>
        </details>`;
}

/** Переключатель «Карта · Список». */
export function viewSwitchHtml() {
    const v = relView();
    return `<div class="thr-seg thr-seg-2">
        <button type="button" data-act="relview" data-v="map" class="${v === 'map' ? 'thr-on' : ''}"><i class="fa-solid fa-diagram-project"></i> Карта</button>
        <button type="button" data-act="relview" data-v="list" class="${v === 'list' ? 'thr-on' : ''}"><i class="fa-solid fa-list"></i> Список</button>
    </div>`;
}

export function mapHtml(st) {
    const { names, more } = shownNames(st);
    const zoomRow = `<div class="thr-map-zoom">
        <button class="menu_button" type="button" data-act="mapzout" title="Отдалить" aria-label="Отдалить"><i class="fa-solid fa-minus"></i></button>
        <button class="menu_button" type="button" data-act="mapzin" title="Приблизить" aria-label="Приблизить"><i class="fa-solid fa-plus"></i></button>
        <button class="menu_button" type="button" data-act="mapzreset" title="Сбросить вид и расстановку" aria-label="Сбросить вид и расстановку"><i class="fa-solid fa-rotate-left"></i></button>
    </div>`;
    return `
        ${zoomRow}
        <div class="thr-map-wrap">${svgHtml(st, names)}${popHtml(st)}</div>
        <div class="thr-note">Персонажей можно перетаскивать — расстановка запомнится в этом чате</div>
        ${more ? `<div class="thr-note">Ещё ${more} — в списке</div>` : ''}
        ${legendHtml()}`;
}

// ---------- Кнопки ----------

/** 'render' — перерисовать, true — данные чата изменились, false — не наше. */
export function handleMapAction(st, btn) {
    const act = btn.dataset.act;
    const s = getSettings();
    if (act === 'relview') {
        s.relView = btn.dataset.v === 'list' ? 'list' : 'map';
        mapUi.pop = null;
        saveSettings();
        return 'render';
    }
    if (act === 'mapzin' || act === 'mapzout') {
        mapUi.pop = null;
        const z = zoom() * (act === 'mapzin' ? 1.25 : 0.8);
        s.mapZoom = Math.round(Math.max(ZMIN, Math.min(ZMAX, z)) * 100) / 100;
        saveSettings();
        return 'render';
    }
    if (act === 'mapzreset') {
        mapUi.pop = null;
        s.mapZoom = 1;
        s.mapPan = { x: 0, y: 0 };
        saveSettings();
        const had = st.mapPos && Object.keys(st.mapPos).length;
        st.mapPos = {};
        return had ? true : 'render';
    }
    if (act === 'mappopx') {
        mapUi.pop = null;
        return 'render';
    }
    if (act === 'maptocard') {
        s.relView = 'list';
        saveSettings();
        mapUi.pop = null;
        mapUi.flash = btn.dataset.name || '';
        return 'render';
    }
    return false;
}

/** После отрисовки вкладки: мини-окошко — в границы карты; карточка, открытая с карты, — прокрутить и подсветить. */
export function afterRelsRender(pane) {
    if (!pane) return;
    placePop(pane);
    flashCard(pane);
}

/** Окошко у места тапа; не влезает справа или снизу — встаёт с другой стороны, но не за край карты. */
function placePop(pane) {
    const pop = pane.querySelector('.thr-map-pop');
    const wrap = pop?.closest('.thr-map-wrap');
    if (!pop || !wrap) return;
    const ww = wrap.clientWidth;
    const wh = wrap.clientHeight;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const x = parseFloat(pop.dataset.x) || 0;
    const y = parseFloat(pop.dataset.y) || 0;
    const GAP = 12;
    const PAD = 6;
    let left = x + GAP + pw <= ww - PAD ? x + GAP : x - GAP - pw;
    let top = y + GAP + ph <= wh - PAD ? y + GAP : y - GAP - ph;
    left = Math.max(PAD, Math.min(ww - pw - PAD, left));
    top = Math.max(PAD, Math.min(wh - ph - PAD, top));
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
    pop.classList.add('thr-placed');
}

/** Закрыть мини-окошко без перерисовки всей вкладки. */
function dropPop() {
    if (!mapUi.pop) return false;
    mapUi.pop = null;
    document.querySelectorAll('.thr-map-pop').forEach((el) => el.remove());
    return true;
}

/** Клик или тап мимо мини-окошка закрывает его. Нажатия по самой карте разбирает mapPointerDown. */
export function onOutsidePointer(e) {
    if (!mapUi.pop) return;
    const t = e.target;
    if (t?.closest?.('.thr-map-pop') || t?.closest?.('svg.thr-map')) return;
    dropPop();
}

/** Esc закрывает мини-окошко. true — было что закрывать. */
export function closePopOnEsc() {
    return dropPop();
}

function flashCard(pane) {
    if (!mapUi.flash) return;
    const name = mapUi.flash;
    mapUi.flash = '';
    const card = [...pane.querySelectorAll('[data-card]')].find((el) => el.dataset.card === name);
    if (!card) return;
    // Крутим только содержимое окна: scrollIntoView крутил бы и страницу таверны под ним,
    // а в мобильном Firefox окно уезжает вместе с ней (тот же баг, что чинили в Junket)
    const body = card.closest('.thr-body');
    if (body) {
        const delta = card.getBoundingClientRect().top - body.getBoundingClientRect().top;
        const top = body.scrollTop + delta - Math.max(0, (body.clientHeight - card.offsetHeight) / 2);
        body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    card.classList.remove('thr-flash');
    void card.offsetWidth; // перезапуск анимации
    card.classList.add('thr-flash');
}

/** Свёрнута/развёрнута легенда — запоминаем. */
export function onLegendToggle(el) {
    if (!el.classList?.contains('thr-map-legsec')) return false;
    getSettings().mapLegend = el.open;
    saveSettings();
    return true;
}

// ---------- Перетаскивание и сдвиг ----------

let drag = null;

/** Экранные пиксели → единицы SVG (без учёта зума). */
function unitsPerPx(svg) {
    const r = svg.getBoundingClientRect();
    return r.width ? W / r.width : 1;
}

/**
 * Нажатие на карте: тянем персонажа или сдвигаем вид. Короткий клик без движения —
 * открыть плашку персонажа или связи. rerender — перерисовать окно.
 */
export function mapPointerDown(e, rerender) {
    const svg = e.target.closest?.('svg.thr-map');
    if (!svg || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const st = getState();
    if (!st) return;
    const node = e.target.closest('[data-person]');
    const pair = e.target.closest('[data-pair]');
    const view = svg.querySelector('.thr-map-view');
    const { names } = shownNames(st);
    const prevPop = mapUi.pop;
    dropPop();
    const wr = svg.closest('.thr-map-wrap')?.getBoundingClientRect();
    drag = {
        svg, view, node, pair, rerender, prevPop,
        at: wr ? { x: e.clientX - wr.left, y: e.clientY - wr.top } : { x: 0, y: 0 },
        id: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
        k: unitsPerPx(svg),
        z: zoom(),
        pan0: pan(),
        pos: layout(st, names),
        key: node ? node.dataset.k : '',
    };
    try { svg.setPointerCapture(e.pointerId); } catch { /* не страшно */ }
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onCancel);
    if (node) e.preventDefault();
}

function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dxPx = e.clientX - drag.sx;
    const dyPx = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dxPx, dyPx) < 4) return;
    drag.moved = true;
    const dx = dxPx * drag.k;
    const dy = dyPx * drag.k;
    if (drag.node) {
        // тянем персонажа: сдвиг в координатах карты с поправкой на зум
        const mx = dx / drag.z;
        const my = dy / drag.z;
        drag.node.setAttribute('transform', `translate(${mx.toFixed(1)} ${my.toFixed(1)})`);
        const base = drag.pos[drag.key];
        const now = { x: base.x + mx, y: base.y + my };
        drag.now = now;
        const line = [...drag.svg.querySelectorAll('line[data-rl]')].find((l) => l.dataset.rl === drag.key);
        line?.setAttribute('x2', now.x.toFixed(1));
        line?.setAttribute('y2', now.y.toFixed(1));
        drag.svg.querySelectorAll('[data-pair]').forEach((g) => {
            if (g.dataset.a !== drag.key && g.dataset.b !== drag.key) return;
            const a = g.dataset.a === drag.key ? now : drag.pos[g.dataset.a];
            const b = g.dataset.b === drag.key ? now : drag.pos[g.dataset.b];
            if (!a || !b) return;
            const d = arcPath(a, b);
            g.querySelectorAll('path').forEach((p) => p.setAttribute('d', d));
        });
    } else {
        drag.panNow = { x: drag.pan0.x + dx, y: drag.pan0.y + dy };
        drag.view.setAttribute('transform', viewTransform(drag.panNow, drag.z));
    }
}

function detach() {
    if (!drag) return;
    drag.svg.removeEventListener('pointermove', onMove);
    drag.svg.removeEventListener('pointerup', onUp);
    drag.svg.removeEventListener('pointercancel', onCancel);
    try { drag.svg.releasePointerCapture(drag.id); } catch { /* уже отпущен */ }
}

function onCancel() {
    const d = drag;
    detach();
    drag = null;
    d?.rerender();
}


async function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    detach();
    drag = null;
    if (!d.moved) {
        // клик: плашка персонажа или связи (повторный клик по тому же — закрыть)
        const next = d.node ? { kind: 'person', key: d.node.dataset.person } : d.pair ? { kind: 'pair', key: d.pair.dataset.pair } : null;
        if (next) {
            const same = d.prevPop && d.prevPop.kind === next.kind && d.prevPop.key === next.key;
            mapUi.pop = same ? null : { ...next, ...d.at };
            d.rerender();
        }
        return;
    }
    if (d.node && d.now) {
        const st = getState();
        if (!st) return;
        if (!st.mapPos || typeof st.mapPos !== 'object') st.mapPos = {};
        // не даём утащить совсем за край поля
        st.mapPos[d.key] = {
            x: Math.round(Math.max(-W / 2, Math.min(W * 1.5, d.now.x))),
            y: Math.round(Math.max(-H / 2, Math.min(H * 1.5, d.now.y))),
        };
        await saveState();
        d.rerender();
        return;
    }
    if (d.panNow) {
        getSettings().mapPan = { x: Math.round(d.panNow.x), y: Math.round(d.panNow.y) };
        saveSettings();
    }
}
