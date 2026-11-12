// Thread — ачивки-счётчики: открываются по уже собранным числам, без запроса к модели.
// Порт из Storyline (checkMilestones). Проверяются на каждом сообщении и после каждой оценки.

import { ctx, modOn, repNow } from './store.js';
import { skillList, skillVal, relVal, signed, pushLog } from './judge.js';
import { ACH_TITLES, COUNTER_ACH } from './ach.js';
import { MAX_ACH } from './judge.js';

const DAY = 864e5;

function unlock(st, slug, note, total) {
    if (st.ach[slug] || Object.keys(st.ach).length >= MAX_ACH) return null;
    const a = { slug, title: ACH_TITLES[slug], rarity: COUNTER_ACH[slug], note: note || '', sd: st.sdate?.text || '', at: Date.now() };
    st.ach[slug] = a;
    pushLog(st, { kind: 'ACH', target: a.title, rarity: a.rarity, delta: 0, note: a.note, sd: a.sd, count: total, at: a.at });
    return a;
}

/** Возвращает список только что открытых ачивок (сохранение и сноска — на вызывающем). */
export function checkMilestones(st) {
    if (!st || !st.touched || !modOn('ach')) return [];
    const total = Array.isArray(ctx().chat) ? ctx().chat.length : 0;
    if (!st.firstAt) st.firstAt = Date.now();
    const age = Date.now() - st.firstAt;
    const todo = [];
    const nowCount = `сейчас в чате: ${total} сообщ.`;
    if (total >= 100) todo.push(['century', nowCount]);
    if (total >= 500) todo.push(['msg-500', nowCount]);
    if (total >= 1000) todo.push(['marathon', nowCount]);
    if (age >= 7 * DAY) todo.push(['week']);
    if (age >= 30 * DAY) todo.push(['month']);

    if (modOn('rels')) {
        const names = Object.keys(st.rels || {});
        let best = null;
        let worst = null;
        for (const n of names) {
            if (best === null || relVal(st, n) > relVal(st, best)) best = n;
            if (worst === null || relVal(st, n) < relVal(st, worst)) worst = n;
        }
        if (best !== null && relVal(st, best) >= 60) todo.push(['close-one', `${best} · ${signed(relVal(st, best))}`]);
        if (best !== null && relVal(st, best) >= 90) todo.push(['soulmate', `${best} · ${signed(relVal(st, best))}`]);
        if (worst !== null && relVal(st, worst) <= -60) todo.push(['nemesis', `${worst} · ${signed(relVal(st, worst))}`]);
        if (names.length >= 8) todo.push(['crowd', String(names.length)]);
        if (Object.keys(st.pairs || {}).length >= 5) todo.push(['tangled']);
    }
    if (modOn('skills')) {
        let top = null;
        for (const e of skillList(st)) if (!top || skillVal(st, e.name.toLowerCase()) > skillVal(st, top.name.toLowerCase())) top = e;
        const tv = top ? skillVal(st, top.name.toLowerCase()) : 0;
        if (top && tv >= 75) todo.push(['master', `${top.name} · ${tv}`]);
        if (top && tv >= 95) todo.push(['virtuoso', `${top.name} · ${tv}`]);
    }
    if (modOn('rep') && st.rep != null) {
        const rep = repNow(st);
        if (rep >= 90) todo.push(['famous', `${rep}/100`]);
        if (rep <= 10) todo.push(['outcast', `${rep}/100`]);
    }

    const unlocked = [];
    for (const [slug, note] of todo) {
        const a = unlock(st, slug, note, total);
        if (a) unlocked.push(a);
    }
    if (Object.keys(st.ach).length >= 10) {
        const a = unlock(st, 'collector', String(Object.keys(st.ach).length), total);
        if (a) unlocked.push(a);
    }
    return unlocked;
}
