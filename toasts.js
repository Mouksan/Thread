// Thread — сноски поверх чата.
// Обычные отметки — стопкой в правом верхнем углу (в духе Lifeweaver),
// ачивки — карточкой сверху по центру с цветом редкости (в духе Hearthtide).
// По умолчанию висят до клика; «через 5 / 15 сек» — в настройках.

import { getSettings, escapeHtml } from './store.js';
import { signed, achTitle } from './judge.js';
import { achIcon, RARITY_LABELS } from './ach.js';

const MAX_CORNER = 4;   // больше карточек в углу экран не переживает — старые уходят
const MAX_ACH = 2;

function timeout() {
    const mode = getSettings().toastMode;
    return mode === '5' ? 5000 : mode === '15' ? 15000 : null; // null — до клика
}

function host(id) {
    let box = document.getElementById(id);
    if (!box) {
        box = document.createElement('div');
        box.id = id;
        document.body.appendChild(box);
    }
    return box;
}

function mount(box, card, max) {
    const cards = box.querySelectorAll('.thr-toast, .thr-ach-card');
    for (let i = 0; i <= cards.length - max; i++) cards[i].remove();
    box.appendChild(card);
    requestAnimationFrame(() => card.classList.add('thr-in'));
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        card.classList.remove('thr-in');
        card.classList.add('thr-out');
        setTimeout(() => card.remove(), 320);
    };
    card.addEventListener('click', close);
    const ms = timeout();
    if (ms) setTimeout(close, ms);
}

const fa = (name) => `<i class="fa-solid ${name} fa-fw" aria-hidden="true"></i>`;

/** Значок отметки. Ачивки — своим эмодзи редкости (это содержимое), остальное — иконки темы. */
export function markIcon(r) {
    if (r.kind === 'REL') return fa(r.delta > 0 ? 'fa-heart' : 'fa-heart-crack');
    if (r.kind === 'SKILL') return fa(r.delta > 0 ? 'fa-bolt' : 'fa-arrow-trend-down');
    if (r.kind === 'REP') return fa('fa-landmark');
    if (r.kind === 'ACH') return achIcon(r.rarity);
    if (r.kind === 'LINK') return fa('fa-link');
    if (r.kind === 'PROMISE') return fa(r.on ? 'fa-scroll' : 'fa-check');
    if (r.kind === 'CHECK') return fa('fa-dice-d20');
    return fa(r.on ? 'fa-flag' : 'fa-moon');
}

/** Одна строка отметки — общая для сносок и ленты событий. */
export function markLineHtml(r) {
    const note = r.note ? ` <span class="thr-mnote">— ${escapeHtml(r.note)}</span>` : '';
    const delta = r.delta ? ` <span class="${r.delta > 0 ? 'thr-up' : 'thr-down'}">${signed(r.delta)}</span>` : '';
    const name = r.kind === 'REP' ? 'Репутация' : (r.kind === 'ACH' ? (r.title || r.target) : r.target);
    return `<div class="thr-mline"><span class="thr-mico">${markIcon(r)}</span><span><b>${escapeHtml(name)}</b>${delta}${note}</span></div>`;
}

/** Карточка в углу. type: 'up' | 'down' | 'mixed' | 'info' — цвет полоски слева. */
function cornerCard(html, type) {
    const card = document.createElement('div');
    card.className = `thr-toast thr-toast-${type}`;
    card.title = 'Нажми, чтобы закрыть';
    card.innerHTML = `<span class="thr-toast-close" aria-hidden="true"><i class="fa-solid fa-xmark"></i></span>${html}`;
    mount(host('thr-toasts'), card, MAX_CORNER);
}

/** Отметки судьи. Возвращает true, если сноска показана (для «Последнего ответа судьи»). */
export function showMarks(rows) {
    if (!getSettings().toasts || !rows?.length) return false;
    const top = rows.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
    const ups = top.filter((r) => r.delta > 0 || r.on === true).length;
    const downs = top.filter((r) => r.delta < 0 || r.on === false).length;
    const type = ups && !downs ? 'up' : downs && !ups ? 'down' : 'mixed';
    const more = rows.length > top.length ? `<div class="thr-toast-more">и ещё ${rows.length - top.length} — во вкладках Thread</div>` : '';
    cornerCard(`<div class="thr-toast-title"><i class="fa-solid fa-diagram-project"></i> Thread</div>${top.map(markLineHtml).join('')}${more}`, type);
    return true;
}

/** Служебная заметка Thread (откат, «судья молчит» и т.п.) — в том же углу. */
export function showNote(text, { force = false } = {}) {
    if (!force && !getSettings().toasts) return;
    cornerCard(`<div class="thr-toast-title"><i class="fa-solid fa-diagram-project"></i> Thread</div><div class="thr-toast-text">${escapeHtml(text)}</div>`, 'info');
}

/** Ачивки — по центру сверху. */
export function showAch(rows) {
    if (!getSettings().toasts || !rows?.length) return false;
    for (const r of rows.slice(0, MAX_ACH)) {
        const rarity = r.rarity || 'common';
        const card = document.createElement('div');
        card.className = `thr-ach-card thr-rar-${rarity}`;
        card.title = 'Нажми, чтобы закрыть';
        card.innerHTML = `
            <div class="thr-ach-icon">${achIcon(rarity)}</div>
            <div class="thr-ach-text">
                <em>Достижение разблокировано · ${escapeHtml(RARITY_LABELS[rarity] || '')}</em>
                <b>${escapeHtml(achTitle(r) || r.title)}</b>
                ${r.note ? `<span>${escapeHtml(r.note)}</span>` : ''}
            </div>`;
        mount(host('thr-ach-toasts'), card, MAX_ACH);
    }
    return true;
}
