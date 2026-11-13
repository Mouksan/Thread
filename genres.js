// Thread — жанры истории и управление набором навыков. Порт из Storyline (GENRES, reconcile, suggestSkills).
// Жанр — на чат (st.genre): свои базовые навыки, «фокус» судьи и пара жанровых ачивок.
// Прокачанные навыки при смене жанра не пропадают.

import { ctx, getState, saveState } from './store.js';
import { skillList, skillVal, MAX_SKILLS, goodSkillName } from './judge.js';
import { background, transcript } from './context.js';
import { requestJudge } from './connection.js';

const NEW_SKILL = 0;
const BASE_SKILLS = ['Дипломатия', 'Храбрость', 'Рассудительность'];

export const GENRES = {
    romance: {
        icon: 'fa-heart', label: 'Романтика', skills: ['Обаяние', 'Флирт', 'Эмпатия', 'Терпение', 'Откровенность'],
        focus: 'romance: pay special attention to romantic tension, jealousy, confessions, trust and small gestures of care',
        ach: { 'slow-burn': 'feelings finally admitted after a long build-up', 'love-triangle': 'a love triangle became obvious' },
    },
    fantasy: {
        icon: 'fa-dragon', label: 'Фэнтези', skills: ['Магия', 'Владение мечом', 'Знание древних', 'Выживание', 'Дипломатия'],
        focus: 'fantasy: quests, magic, battles, ancient secrets, oaths and factions',
        ach: { 'first-spell': 'the player cast their first real spell', 'legendary-artifact': 'a legendary artifact was found or claimed' },
    },
    detective: {
        icon: 'fa-magnifying-glass', label: 'Детектив', skills: ['Наблюдательность', 'Логика', 'Допрос', 'Скрытность', 'Интуиция'],
        focus: 'detective: clues, suspects, alibis, lies and revelations; key evidence is worth a MARK',
        ach: { 'key-clue': 'a key clue was found', 'case-closed': 'the case was solved' },
    },
    school: {
        icon: 'fa-school', label: 'Школа', skills: ['Учёба', 'Популярность', 'Спорт', 'Дружба', 'Дерзость'],
        focus: 'school life: classmates, crushes, rivalries, teachers, gossip, exams and school events',
        ach: { detention: 'got caught and stayed after class', prom: 'went to the prom or a school dance with someone' },
    },
    crime: {
        icon: 'fa-user-secret', label: 'Криминал', skills: ['Хладнокровие', 'Хитрость', 'Сила', 'Связи', 'Торг'],
        focus: 'crime: loyalty, debts, betrayals, territory, deals and trouble with the law',
        ach: { 'made-member': 'the player was accepted into the family or gang', 'double-cross': 'someone played a double game' },
    },
    horror: {
        icon: 'fa-ghost', label: 'Хоррор', skills: ['Храбрость', 'Внимательность', 'Выживание', 'Самообладание', 'Оккультизм'],
        focus: "horror: dread, threats, keeping one's nerve, who can be trusted and the unknown",
        ach: { 'survived-night': 'survived a terrible night', 'face-the-horror': 'faced the horror directly' },
    },
};

export function genreOf(st) {
    return st?.genre && GENRES[st.genre] ? st.genre : '';
}

/** Строки для системного промпта судьи: фокус жанра и его ачивки. */
export function genrePromptLines(st, achOn) {
    const g = genreOf(st);
    if (!g) return [];
    const lines = ['', `Story genre — ${GENRES[g].focus}.`];
    if (achOn) {
        lines.push(`Extra built-in achievements for this genre (exact slug): ${Object.entries(GENRES[g].ach).map(([slug, d]) => `${slug} (${d})`).join(', ')}.`);
    }
    return lines;
}

export function baseSkillNames(st) {
    const g = genreOf(st);
    return g ? GENRES[g].skills.slice() : BASE_SKILLS.slice();
}

function removedSet(st) {
    return new Set(Array.isArray(st.skillsOff) ? st.skillsOff : []);
}

/**
 * Догнать набор навыков до базового (жанра или общего): добавить недостающие,
 * убрать пустые базовые прошлого жанра. Навыки, убранные вручную, не возвращаются.
 */
export function reconcileSkills(st) {
    const base = baseSkillNames(st);
    const baseKeys = new Set(base.map((n) => n.toLowerCase()));
    const off = removedSet(st);
    let changed = false;
    for (const [key, entry] of Object.entries(st.skills)) {
        if (!entry || entry.src !== 'preset' || baseKeys.has(key)) continue;
        if (skillVal(st, key) > 0) entry.src = 'found'; // прокачанный навык при смене жанра не теряем
        else {
            delete st.skills[key];
            st.log = st.log.filter((l) => !(l.kind === 'SKILL' && String(l.target).toLowerCase() === key));
        }
        changed = true;
    }
    for (const name of base) {
        const key = name.toLowerCase();
        if (st.skills[key] || off.has(key) || Object.keys(st.skills).length >= MAX_SKILLS) continue;
        st.skills[key] = { name, v: NEW_SKILL, src: 'preset' };
        changed = true;
    }
    return changed;
}

export function setGenre(st, id) {
    st.genre = GENRES[id] ? id : '';
    reconcileSkills(st);
}

/** «Вернуть базовые»: снять ручные удаления и добавить недостающие базовые навыки. */
export function restoreBaseSkills(st) {
    const baseKeys = new Set(baseSkillNames(st).map((n) => n.toLowerCase()));
    st.skillsOff = (Array.isArray(st.skillsOff) ? st.skillsOff : []).filter((k) => !baseKeys.has(k));
    return reconcileSkills(st);
}

export function addSkill(st, name) {
    const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!clean || !goodSkillName(clean)) return false;
    const key = clean.toLowerCase();
    st.skillsOff = (Array.isArray(st.skillsOff) ? st.skillsOff : []).filter((k) => k !== key);
    if (st.skills[key] || skillList(st).length >= MAX_SKILLS) return false;
    st.skills[key] = { name: clean, v: NEW_SKILL, src: 'custom' };
    return true;
}

/** Убрать навык — вместе с его историей. Базовый больше сам не вернётся (до «Вернуть базовые»). */
export function removeSkill(st, key) {
    if (!st.skills[key]) return false;
    delete st.skills[key];
    st.log = st.log.filter((l) => !(l.kind === 'SKILL' && String(l.target).toLowerCase() === key));
    st.skillsOff = [...removedSet(st).add(key)];
    return true;
}

// ---------- Навыки из сюжета ----------

const SUGGEST_SYSTEM = [
    "You name abilities for tracking the player's capabilities in a choice-driven story game, based on its world and genre. You never roleplay and never address anyone.",
    'Output 3–5 skill names, one per line: just the name, 1–3 words each. Nothing else — no numbering, no explanations, no markdown.',
    'Examples of the shape: Diplomacy, Swordplay, Streetwise, Court Etiquette, Alchemy',
    '',
    'OUTPUT LANGUAGE: write the skill names strictly in Russian.',
].join('\n');

/** Модель предлагает навыки по последним 16 сообщениям. Возвращает новые имена (без уже имеющихся). */
export async function suggestSkills() {
    const st = getState();
    if (!st) return [];
    const bg = background();
    const tx = transcript(16);
    const user = `${bg ? `=== Story background ===\n${bg}\n\n` : ''}=== The story so far (excerpt) ===\n${tx || '(nothing)'}`;
    const raw = await requestJudge({ system: SUGGEST_SYSTEM, user });
    const have = new Set(skillList(st).map((e) => e.name.toLowerCase()));
    const seen = new Set();
    return String(raw || '').split(/\r?\n/)
        .map((x) => x.replace(/^[-*+\d.\s«"“„]+/, '').replace(/[»"”]+$/, '').replace(/[*_`]/g, '').trim().slice(0, 24))
        .filter((x) => x && goodSkillName(x) && !/^(skill|name|навык)$/i.test(x))
        .filter((x) => {
            const k = x.toLowerCase();
            if (seen.has(k) || have.has(k)) return false;
            seen.add(k);
            return true;
        })
        .slice(0, 5);
}

export async function saveAfter(fn) {
    const st = getState();
    if (!st) return false;
    const changed = fn(st);
    if (changed) await saveState();
    return changed;
}

export { ctx };
