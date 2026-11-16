// Thread — мост к Memento: «В альбом Memento» у открытой ачивки.
// Memento (с версии 1.2.0) даёт window.Memento.develop({ from, to, hint }) — проявляет сцену как карточку.
// Если Memento не установлен, Thread ничего не показывает.

import { ctx, escapeHtml, getState } from './store.js';
import { achTitle } from './judge.js';

/** Сколько сообщений берём в сцену — заканчивая тем, на котором выпала ачивка. */
const SCENE_LEN = 6;

export function mementoReady() {
    return typeof window.Memento?.develop === 'function';
}

/** На каком сообщении выпала ачивка: у новых — записано, у старых — ищем запись в ленте. */
function achCount(st, a) {
    if (Number.isInteger(a?.count)) return a.count;
    const title = achTitle(a);
    const e = (st.log || []).slice().reverse().find((x) => x && x.kind === 'ACH' && (x.target === title || x.target === a.title));
    return Number.isInteger(e?.count) ? e.count : null;
}

/** Диапазон сцены { from, to } (индексы сообщений) или null. */
export function achScene(st, a) {
    const count = achCount(st, a);
    const len = Array.isArray(ctx().chat) ? ctx().chat.length : 0;
    if (!count || !len) return null;
    const to = Math.min(count, len) - 1;
    if (to < 0) return null;
    return { from: Math.max(0, to - SCENE_LEN + 1), to };
}

/** Кнопка-фотоаппарат; пусто, если Memento нет или сцену не найти. */
export function mementoButtonHtml(st, key, a, cls = 'thr-x') {
    if (!mementoReady() || !achScene(st, a)) return '';
    return `<button class="${cls} thr-memento-btn" type="button" data-act="memento" data-key="${escapeHtml(key)}" title="В альбом Memento" aria-label="В альбом Memento"><i class="fa-solid fa-camera"></i></button>`;
}

/** Отправить ачивку в Memento. true — Memento взялся проявлять. */
export function sendToMemento(key, st = getState()) {
    const a = st?.ach?.[key];
    if (!a || !mementoReady()) return false;
    const scene = achScene(st, a);
    if (!scene) return false;
    const hint = `Achievement "${achTitle(a)}"${a.note ? ` — ${a.note}` : ''}`;
    try {
        return window.Memento.develop({ ...scene, hint }) !== false;
    } catch (err) {
        console.warn('[Thread] Memento:', err);
        return false;
    }
}
