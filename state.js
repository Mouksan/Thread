// Thread — снимки и откат. Порт из Storyline (snapTake / snapRestore / rollbackCheck), под события таверны.
// Перед каждой оценкой — снимок того, что судья меняет, и «якорь»: на каком сообщении он остановился.
// Удалили сообщения, свайпнули или перегенерировали оценённый ответ — возвращаем снимок.

import { ctx } from './store.js';
import { COUNTER_ACH } from './ach.js';

// Thread: в оригинале хранилось 4 снимка; здесь 30 — ветки и удаления уходят далеко назад.
const SNAP_MAX = 30;
const SNAP_KEYS = ['skills', 'rep', 'rels', 'flags', 'ach', 'pairs', 'facts', 'quests', 'relHist', 'repHist', 'sdate'];

/**
 * «Личность» сообщения: номер свайпа и время создания. Меняется при свайпе и перегенерации,
 * а при правке текста — нет. Thread: оригинал сравнивал куски текста и откатывал даже из-за правленой опечатки.
 */
export function messageIdentity(index) {
    const m = ctx().chat?.[index];
    if (!m) return null;
    return `${m.swipe_id ?? 0}|${m.send_date ?? ''}`;
}

/** Снимок перед оценкой. prevCount — докуда было оценено раньше, anchorCount — сколько сообщений прочитал судья. */
export function snapTake(st, prevCount, anchorCount, evId) {
    const data = {};
    for (const key of SNAP_KEYS) data[key] = st[key];
    const snap = { id: evId, prev: prevCount, anchor: anchorCount, ident: messageIdentity(anchorCount - 1), at: Date.now(), data: structuredClone(data) };
    st.snaps = (Array.isArray(st.snaps) ? st.snaps : []).concat([snap]).slice(-SNAP_MAX);
}

function snapRestore(st, snap, total) {
    // Ачивки-счётчики (100 сообщений и т.п.) откат не трогает
    const keep = {};
    for (const key of Object.keys(st.ach || {})) if (COUNTER_ACH[key]) keep[key] = st.ach[key];
    const data = structuredClone(snap.data);
    for (const key of SNAP_KEYS) if (key !== 'ach') st[key] = data[key];
    st.ach = { ...(data.ach || {}), ...keep };
    st.log = st.log.filter((e) => e.ev !== snap.id);
    st.count = Math.min(snap.prev, total);
}

/**
 * Проверить, цел ли текст, по которому ставились отметки, и вернуть снимки, если нет.
 * Возвращает { undone — сколько оценок отменено, why — 'del' | 'reroll' | '' }. Сохранение — на вызывающем.
 */
export function rollbackCheck(st) {
    const result = { undone: 0, why: '' };
    if (!st || !Array.isArray(st.snaps) || !st.snaps.length) return result;
    const total = Array.isArray(ctx().chat) ? ctx().chat.length : 0;
    while (st.snaps.length) {
        const snap = st.snaps[st.snaps.length - 1];
        let bad = '';
        if (total < snap.anchor) bad = 'del';
        else if (snap.ident && messageIdentity(snap.anchor - 1) !== snap.ident) bad = 'reroll';
        if (!bad) break;
        snapRestore(st, snap, total);
        st.snaps.pop();
        result.undone++;
        result.why = result.why || bad;
    }
    if (result.undone) {
        st.rerollWait = total; // новую версию оценим вместе со следующим сообщением — свайпы подряд не тратят токены
    }
    return result;
}
