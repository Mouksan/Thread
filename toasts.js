// Thread — сноски поверх чата. Порт из Storyline (showMarks / showAch).

import { getSettings, escapeHtml } from './store.js';
import { signed, achTitle } from './judge.js';
import { achIcon, RARITY_LABELS } from './ach.js';

function host() {
    let box = document.getElementById('thr-toasts');
    if (!box) {
        box = document.createElement('div');
        box.id = 'thr-toasts';
        document.body.appendChild(box);
    }
    return box;
}

function drop(banner) {
    banner.classList.add('thr-out');
    setTimeout(() => banner.remove(), 350);
}

export function markIcon(r) {
    if (r.kind === 'REL') return r.delta > 0 ? '❤' : '💔';
    if (r.kind === 'SKILL') return r.delta > 0 ? '⚡' : '💫';
    if (r.kind === 'REP') return '🏛';
    if (r.kind === 'ACH') return achIcon(r.rarity);
    if (r.kind === 'LINK') return '🔗';
    if (r.kind === 'PROMISE') return r.on ? '📜' : '✔️';
    if (r.kind === 'CHECK') return '🎲';
    return r.on ? '🚩' : '🌘';
}

/** Одна строка отметки — общая для сносок и ленты событий. */
export function markLineHtml(r) {
    const note = r.note ? ` <span class="thr-mnote">— ${escapeHtml(r.note)}</span>` : '';
    const delta = r.delta ? ` <span class="${r.delta > 0 ? 'thr-up' : 'thr-down'}">${signed(r.delta)}</span>` : '';
    const name = r.kind === 'REP' ? 'Репутация' : (r.kind === 'ACH' ? (r.title || r.target) : r.target);
    return `<div class="thr-mline"><span class="thr-mico">${markIcon(r)}</span><span><b>${escapeHtml(name)}</b>${delta}${note}</span></div>`;
}

function show(html, className, ms) {
    const box = host();
    while (box.children.length >= 2) box.firstChild.remove();
    const banner = document.createElement('div');
    banner.className = `thr-banner ${className || ''}`;
    banner.innerHTML = html;
    banner.title = 'Клик — скрыть';
    banner.addEventListener('click', () => drop(banner));
    box.appendChild(banner);
    setTimeout(() => drop(banner), ms);
}

export function showMarks(rows) {
    if (!getSettings().toasts || !rows?.length) return;
    const top = rows.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 4);
    show(`<div class="thr-btitle">Thread</div>${top.map(markLineHtml).join('')}`, '', 9000);
}

export function showAch(rows) {
    if (!getSettings().toasts || !rows?.length) return;
    for (const r of rows.slice(0, 2)) {
        const rarity = r.rarity || 'common';
        show(
            `<div class="thr-btitle">${achIcon(rarity)} Достижение разблокировано · ${RARITY_LABELS[rarity]}</div>
             <div class="thr-mline"><span><b>${escapeHtml(achTitle(r) || r.title)}</b>${r.note ? ` <span class="thr-mnote">— ${escapeHtml(r.note)}</span>` : ''}</span></div>`,
            `thr-ach thr-${rarity}`,
            11000,
        );
    }
}
