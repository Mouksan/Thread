// Thread — «Кто что знает»: тайны персонажей и твоей персоны и список тех, кто о них знает.
// Тайны живут там же, где досье (st.facts[имя] = [{ t, s: true, … }]); здесь к ним добавлены
// k — кто знает (имена; '__me' — ты) и pub — тайна стала общеизвестной.
// Тайны твоей персоны лежат под ключом '__me', чтобы не зависеть от имени персоны.

import { modOn } from './store.js';
import { personaName, personaDisplayName } from './context.js';

export const ME = '__me';
export const MAX_NOTE_SECRETS = 5;

const low = (s) => String(s || '').toLowerCase().trim();
const norm = (s) => low(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Имя для показа в окне: '__me' → «своё» имя персоны. */
export function whoLabel(name) {
    return name === ME ? (personaDisplayName() || 'Ты') : name;
}

/** Имя для модели: '__me' → имя персоны в таверне. */
export function whoForModel(name) {
    return name === ME ? (personaName() || 'the player') : name;
}

/** Все тайны: [{ holder, f }], свежие первыми. */
export function secretList(st, { withPublic = true } = {}) {
    const out = [];
    for (const holder of Object.keys(st?.facts || {})) {
        for (const f of st.facts[holder] || []) {
            if (f && f.s && (withPublic || !f.pub)) out.push({ holder, f });
        }
    }
    return out.sort((a, b) => (b.f.at || 0) - (a.f.at || 0));
}

/** Тайна по тексту от судьи: точное совпадение, потом «одна строка содержит другую». */
export function findSecret(st, text) {
    const q = norm(text);
    if (!q) return null;
    const all = secretList(st);
    return all.find((x) => norm(x.f.t) === q)
        || all.find((x) => { const t = norm(x.f.t); return t.includes(q) || q.includes(t); })
        || null;
}

/** «Знают: …» для модели. */
export function knowsForModel(f) {
    if (f.pub) return 'known to everyone';
    const k = (f.k || []).map(whoForModel);
    return k.length ? `known to: ${k.join(', ')}` : 'nobody else knows';
}

/** Список «кто знает» из строки судьи: «Дэмиан, Ренцо» / «nobody». */
export function parseKnowers(text) {
    const s = String(text || '').replace(/^\s*(who already knows|already known to|known to|knows|знают|знает)\s*:?\s*/i, '').trim();
    if (!s || /^(nobody|no one|none|noone|никто|никого)\b/i.test(s)) return [];
    return s.split(/\s*(?:,|;|\band\b|\bи\b)\s*/i).map((x) => x.replace(/[*_`«»"]/g, '').trim()).filter((x) => x && x.length <= 40).slice(0, 8);
}

/** Добавить знающего. true — список изменился. */
export function addKnower(f, who) {
    if (!who) return false;
    f.k = Array.isArray(f.k) ? f.k : [];
    if (f.k.some((x) => low(x) === low(who))) return false;
    f.k.push(who);
    return true;
}

/** Строка для записки боту (пусто — нечего сказать). */
export function secretsNote(st) {
    if (!modOn('knows')) return '';
    const list = secretList(st, { withPublic: false }).slice(0, MAX_NOTE_SECRETS);
    if (!list.length) return '';
    const items = list.map(({ holder, f }) => `${whoForModel(holder)}${holder === ME ? ' (the player)' : ''} hides that ${f.t} (${knowsForModel(f)})`);
    return `secrets and who knows them — characters act only on what they know; anyone not listed does not know it, must not act on it, hint at it or suddenly guess it without a scene where they find out: ${items.join('; ')}`;
}
