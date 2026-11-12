// Thread — мост для других расширений: window.Thread. Порт канала window.__STORYLINE из Storyline.
//   Thread.summary()      → { v, genre, chapter, date, rep, rels[], skills[], marks[], promises[], facts{}, ach[] } | null
//   Thread.promptText()   → короткая сводка по-английски — вставить в свой промпт
//   Thread.check(skill, 'easy'|'mid'|'hard'|'epic', { arm }) → бросок d20 (arm: false — только узнать исход)
//   Thread.report({ source, text }) → «у меня в сюжете случилось» — судья учтёт при следующей оценке
//   событие окна 'thread:update' — после каждого сохранения отметок (детали — через summary()).

import { getState, saveState, modOn, repNow, repLevel, relLevel } from './store.js';
import { skillList, skillVal, relVal, signed, activeFlags, openQuests, achTitle } from './judge.js';
import { genreOf } from './genres.js';
import { rollCheck } from './dice.js';

const MAX_REPORTS = 10;

function summary() {
    const st = getState();
    if (!st) return null;
    const facts = {};
    if (modOn('facts')) {
        for (const [n, list] of Object.entries(st.facts || {})) facts[n] = (list || []).map((f) => ({ text: f.t, secret: Boolean(f.s) }));
    }
    const chapters = Array.isArray(st.chapters) && st.chapters.length ? st.chapters : [{ title: '' }];
    return {
        v: 1,
        genre: genreOf(st),
        chapter: { number: chapters.length, title: chapters[chapters.length - 1].title || '' },
        date: st.sdate?.text || '',
        rep: modOn('rep') && st.rep != null ? { value: repNow(st), level: repLevel(repNow(st)) } : null,
        rels: modOn('rels') ? Object.keys(st.rels).sort((a, b) => relVal(st, b) - relVal(st, a))
            .map((n) => ({ name: n, value: relVal(st, n), level: relLevel(relVal(st, n)) })) : [],
        skills: modOn('skills') ? skillList(st).map((e) => ({ name: e.name, value: skillVal(st, e.name.toLowerCase()) })) : [],
        marks: modOn('flags') ? activeFlags(st).map((x) => x.f.name || x.key) : [],
        promises: modOn('flags') ? openQuests(st).map((q) => q.name) : [],
        facts,
        ach: modOn('ach') ? Object.values(st.ach).filter(Boolean).map((a) => ({ title: achTitle(a), rarity: a.rarity })) : [],
    };
}

function promptText() {
    const s = summary();
    if (!s) return '';
    const L = [];
    if (s.rels.length) L.push(`How characters feel about the player: ${s.rels.slice(0, 8).map((r) => `${r.name} ${signed(r.value)}`).join('; ')}`);
    if (s.rep) L.push(`Player reputation: ${s.rep.value}/100`);
    if (s.marks.length) L.push(`Lasting story marks: ${s.marks.slice(0, 6).join('; ')}`);
    if (s.promises.length) L.push(`Open promises: ${s.promises.slice(0, 4).join('; ')}`);
    return L.join('\n');
}

async function check(skill, dcKey = 'mid', opts = {}) {
    const st = getState();
    if (!st || !modOn('skills')) return null;
    const name = skillList(st).find((e) => e.name.toLowerCase() === String(skill || '').toLowerCase())?.name || String(skill || '').trim();
    if (!name) return null;
    return rollCheck(name, dcKey, { arm: opts.arm !== false });
}

async function report(event) {
    const st = getState();
    const text = String(event?.text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!st || !text) return false;
    const source = String(event?.source || 'другое расширение').slice(0, 40);
    st.reports = (Array.isArray(st.reports) ? st.reports : []).concat([{ source, text, at: Date.now() }]).slice(-MAX_REPORTS);
    await saveState();
    return true;
}

/** Строки для запроса судье: события от других расширений с прошлой оценки. */
export function reportLines(st) {
    return (Array.isArray(st?.reports) ? st.reports : []).map((r) => `${r.text} (from ${r.source})`);
}

export function clearReports(st) {
    if (st) st.reports = [];
}

export function installBridge() {
    window.Thread = Object.freeze({ summary, promptText, check, report, version: 1 });
}
