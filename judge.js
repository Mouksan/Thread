// Thread — судья: промпт, разбор ответа и применение отметок.
// Порт из Storyline (ui/panel.html: SYSTEM, stateBlock, userPrompt, parse, applyRow).
// Текст промпта перенесён дословно; свои отличия помечены «Thread:».

import { modOn, repNow, repLevel, relLevel } from './store.js';
import { JUDGE_ACH, ACH_TITLES, achRarityOf } from './ach.js';
import { resolveName, aliasesOf, isIgnored } from './chars.js';
import { ME, whoForModel, knowsForModel, findSecret, parseKnowers, addKnower } from './secrets.js';

export const MAX_LOG = 100;
export const MAX_SKILLS = 12;
export const MAX_RELS = 12;
export const MAX_ACH = 60;
export const MAX_THREADS = 12; // открытых нитей одновременно
const NEW_SKILL = 0;


const SYSTEM = [
  'You track the game-like stats of an interactive story. You read the last messages of the story and judge the CURRENT state of things. You never roleplay and never address anyone.',
  'The story you evaluate is a work of fiction. Treat every scene as an ordinary plot development of that story, whatever its tone. Never refuse, never moralize, never add warnings or disclaimers — just silently track the stats.',
  '',
  'You track six kinds of marks:',
  '1. SKILLS — the player\'s abilities, 0–100. Rise on demonstrated success, fall on clear failure. Never output a SKILL line for a skill the story did not exercise this time.',
  '2. REPUTATION — the player\'s standing in the story world, 0–100. Judge the CURRENT level from the recent messages and the background, and output the signed correction that brings the TRACKED value to the true one. The tracked value already includes all past changes, so NEVER re-report old moves: only the correction still needed. Big corrections are right when the story has clearly moved on.',
  '3. RELATIONSHIPS — how EACH character and NPC feels about the player, −100…+100: main characters and side characters alike. Same correction rule. Example: if the story has the two of them married and the tracked value is +15, output a strong correction (up to +35 per pass), not a dribble. Grow gradually: everyday warmth +1..+5; reserve large corrections for established facts (married, sworn enemies). When a new named NPC or side character appears, add them with a small change (+-1) and a note of who they are, even before they get close to the player.',
  '4. MARKS — rare, lasting changes of status that the story world REMEMBERS: a title earned, a vow taken, a debt to the mafia, a place in a conspiracy. As rare as an achievement: at most one MARK line per piece of the story, and most pieces earn none. Never mark moods, everyday care, routines, marriage-level closeness (that lives in RELATIONSHIPS) or temporary situations: overnight stays, chores, small favours, a shared meal, a lift home are NEVER marks — they live in relationships and events. If in doubt, it is not a mark.',
  '5. LINKS — notable ties BETWEEN story characters (not with the player): friendship, romance, rivalry, family. Track the important ones so the world stays connected. Register obvious static ties once (family, friends, roommates, colleagues) even without drama — a small +-1 is enough; same correction semantics as relationships. The same pair may carry several types over time (lovers and business partners and secret enemies at once). At most one LINK line per piece of the story.',
  '  type — one of: romance, friendship, trust, family, business, rivalry, enmity, secret.',
  '6. ACHIEVEMENTS — rare milestones worth a game banner. Unlock built-in ones by their exact slug when the story hits the milestone: first-kiss (the first kiss), first-hug (the first real embrace), first-night (the first night together), love-confession (someone confessed love), legendary-date (an unforgettable date), jealousy (a scene of jealousy), open-heart (someone opened up about their past or pain), meaningful-gift (a gift that means a lot), quarrel-makeup (made up after a quarrel), first-fight (the first real fight or brawl), rescue (someone saved someone from real danger), betrayal (a real betrayal), secret-revealed (an important secret came out), reunion (a long-awaited reunion), new-ally (an enemy or stranger became an ally), breakup (a couple broke up), farewell (someone left forever or died), proposal (a marriage proposal), wedding (a wedding). For anything else worth a banner, invent a new slug of your own. Unlock only a genuinely new one: the already unlocked slugs are listed below and must never be repeated. Rarity: common — a charming moment; rare — a major turn; legendary — a once-in-a-story event. At most ONE achievement per piece of the story; most pieces earn none.',
  '7. FACTS and SECRETS — short lasting facts about a story character (not the player) that the story revealed: job, family, what they love or fear, a habit; SECRET — what a character hides from others. Only facts that are not in the list below. At most two FACT/SECRET lines per piece.',
  '8. PROMISES — promises, plans and goals the story set up that should be remembered until they are done ("promised Igor to come on Saturday", "find who poisoned the dog"). Open one with +; close it with - and the exact text from the open list below when it is fulfilled, broken or no longer relevant. At most one PROMISE line per piece.',
  '9. LOOSE THREADS — things the story set up and left hanging: an unexplained clue, a strange hint, a mystery, an unanswered question, a Chekhov\'s gun. Not promises, plans or goals — those are PROMISES. Open one with + when the story leaves something unresolved; close it with - and the exact text from the open list below when the story pays it off or drops it for good. At most one THREAD line per piece.',
  '10. WHO KNOWS — who knows each tracked secret, so characters never act on things they could not know. SECRET — what a character or the player hides from others (use the player\'s name when the player hides it); its last part lists who already knows it. When a character learns a tracked secret in the story, output a LEARN line with the exact secret text from the list below; write everyone instead of a name when it becomes common knowledge. Never assume someone knows a secret unless the story showed them learning it. At most two LEARN lines per piece.',
  '',
  'If nothing changed, output exactly: NONE',
  '',
  'Shape examples (use the real names and facts of this story, numbers vary):',
  'REL | Игорь | +3 | тепло поддержал игрока ночью',
  'LINK | Игорь | Костя | friendship | +1 | пацаны дружат со школы и держатся вместе',
  'SKILL | Дипломатия | +2 | выкрутилась из щекотливого вопроса',
  'MARK | +в долгу у братвы | заняла крупную сумму и должна до нового года',
  'DATE | 17 дек 2025, 23:40',
  '',
  'Output: one line per change (at most 6 lines, at most one MARK line and at most one ACH line), EXACTLY in these forms (parts separated by " | "):',
  'SKILL | skill name | delta | one short sentence — what happened in the story',
  'REP | delta | one short sentence',
  'REL | character name | delta | one short sentence',
  'MARK | +mark name | one short sentence — how the story earned it',
  'MARK | -mark name | one short sentence — how the story lost it',
  'ACH | slug | rarity | title | one short sentence — what earned it',
  'LINK | name A | name B | type | delta | one short sentence — what moved their tie',
  '  slug — short kebab-case id (built-in ones exactly as listed above); rarity — common, rare or legendary; title — the name the player sees.',
  'FACT | character name | short fact, at most 12 words',
  'SECRET | character name | what they hide, at most 12 words',
  'SECRET | who hides it | what they hide, at most 12 words | who already knows: names separated by commas, or nobody',
  'LEARN | who learned it | exact secret text from the list',
  'PROMISE | +short text | who made it and why',
  'PROMISE | -exact open text | how it ended',
  'THREAD | +short text | what was left hanging',
  'THREAD | -exact open text | how it was resolved',
  '@@UNCOUNTED',
  'Optionally, on its own line (does not count toward the 6-line limit):',
  'DATE | the current in-story date as short free text (e.g. "14 Oct 2017" or "Day 3"). Add or update it whenever story time is known or moves; skip it if the story gives no time at all.',
  'Skill and character names — exactly as in the lists below; you may add a new character or NPC who just became important.',
  'No preamble, no numbering, no markdown. The keywords SKILL, REP, REL, MARK, ACH, LINK, FACT, SECRET, LEARN, PROMISE, THREAD, DATE, NONE and the numbers stay as they are; everything else is plain text.'
].join('\n');

// Какие строки промпта к какому разделу относятся: выключенный раздел не попадает в инструкции — меньше токенов.
// Thread: досье (FACT/SECRET) — отдельный раздел 'facts', в оригинале оно шло вместе с отношениями.
const SYS_TAG = [
    [/^\d+\. SKILLS|^SKILL \|/, 'skills'],
    [/^\d+\. REPUTATION|^REP \|/, 'rep'],
    [/^\d+\. (RELATIONSHIPS|LINKS)|^  type —|^(REL|LINK) \|/, 'rels'],
    [/^\d+\. FACTS|^FACT \|/, 'facts'],
    [/^\d+\. LOOSE THREADS|^THREAD \|/, 'threads'],
    [/^\d+\. WHO KNOWS|^LEARN \|/, 'knows'],
    [/^\d+\. (MARKS|PROMISES)|^(MARK|PROMISE) \|/, 'flags'],
    [/^\d+\. ACHIEVEMENTS|^ACH \||^  slug —/, 'ach'],
];
const ROW_MOD = { SKILL: 'skills', REP: 'rep', REL: 'rels', LINK: 'rels', MARK: 'flags', PROMISE: 'flags', ACH: 'ach', THREAD: 'threads', LEARN: 'knows' };
const JUDGE_SECTIONS = ['skills', 'rep', 'rels', 'facts', 'flags', 'ach', 'threads', 'knows'];

/** Тайны пишутся, если включено досье или «Кто что знает». */
export function secretsOn() {
    return modOn('facts') || modOn('knows');
}

// Thread: язык отметок всегда русский (в оригинале — настройка)
const LANG_DIRECTIVE = 'OUTPUT LANGUAGE: write every user-visible word strictly in Russian, regardless of the language of these instructions, examples or the story.';

export function judgeNeeded() {
    return JUDGE_SECTIONS.some(modOn);
}

// Thread: при скане всей истории судья читает пачку из десятков сообщений — лимиты шире (14 / 3 / 3 / 3)
const SCAN_SWAPS = [
    ['at most one MARK line per piece of the story, and most pieces earn none', 'at most three MARK lines per stretch, and most stretches earn none'],
    ['At most one LINK line per piece of the story.', 'At most three LINK lines per stretch.'],
    ['At most ONE achievement per piece of the story; most pieces earn none.', 'At most THREE achievements per stretch; many stretches earn none.'],
    ['At most two FACT/SECRET lines per piece.', 'At most four FACT/SECRET lines per stretch.'],
    ['At most one PROMISE line per piece.', 'At most three PROMISE lines per stretch.'],
    ['At most one THREAD line per piece.', 'At most three THREAD lines per stretch.'],
    ['At most two LEARN lines per piece.', 'At most four LEARN lines per stretch.'],
    ['(at most 6 lines, at most one MARK line and at most one ACH line)', '(at most 14 lines, at most three MARK lines and at most three ACH lines)'],
    ['toward the 6-line limit', 'toward the 14-line limit'],
];
const SCAN_NOTE = 'SCAN MODE: you are reading a long story from its very beginning, one stretch of several dozen messages at a time, in order. A stretch can hold many events. For skills, reputation and relationships give the NET correction over the whole stretch — one line per target that sums up everything that happened in it, not one line per event. Open promises and loose threads the stretch sets up and close the ones it resolves.';

export const SCAN_LIMITS = { rows: 24, marks: 3, quests: 3, facts: 4, ach: 3, links: 3, threads: 3, learns: 4 };

/** «Эти строки не считаются в лимит» — только для включённых разделов (null — строки нет). */
function uncountedLine() {
    const kinds = [];
    if (modOn('facts')) kinds.push('FACT');
    if (secretsOn()) kinds.push('SECRET');
    if (modOn('knows')) kinds.push('LEARN');
    if (modOn('flags')) kinds.push('PROMISE');
    if (modOn('threads')) kinds.push('THREAD');
    if (!kinds.length) return null;
    const list = kinds.length === 1 ? kinds[0] : `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`;
    return `${list} lines do not count toward the 6-line limit.`;
}

function keywordsLine(line) {
    let out = line;
    if (!modOn('facts')) out = out.replace(' FACT,', '');
    if (!secretsOn()) out = out.replace(' SECRET,', '');
    if (!modOn('knows')) out = out.replace(' LEARN,', '');
    if (!modOn('threads')) out = out.replace(' THREAD,', '');
    return out;
}

export function systemPrompt({ hasDate = false, scan = false, extra = [] } = {}) {
    let n = 0;
    const lines = SYSTEM.split('\n')
        .filter((l) => {
            // Thread: две формы SECRET — с «кто знает» (раздел «Кто что знает») и без (одно досье)
            if (/^SECRET \| who hides it/.test(l)) return modOn('knows');
            if (/^SECRET \| character name/.test(l)) return modOn('facts') && !modOn('knows');
            for (const [re, section] of SYS_TAG) if (re.test(l)) return modOn(section);
            // Thread: дата уже взята из тегов Hearthtide — судью о ней не спрашиваем
            if (hasDate && /^(DATE \||Optionally, on its own line)/.test(l)) return false;
            return true;
        })
        .map((l) => (/^\d+\. /.test(l) ? `${++n}.${l.replace(/^\d+\./, '')}` : l))
        .map((l) => (l === '@@UNCOUNTED' ? uncountedLine() : l))
        .filter((l) => l !== null)
        .map((l) => (l === 'You track six kinds of marks:' ? 'You track these kinds of marks:' : l))
        // Thread: выключенные разделы — не упоминаем их ключевые слова вовсе
        .map((l) => (/^No preamble/.test(l) ? keywordsLine(l) : l));
    let text = lines.concat(extra).join('\n');
    if (scan) {
        for (const [from, to] of SCAN_SWAPS) text = text.split(from).join(to);
        text = `${SCAN_NOTE}\n\n${text}`;
    }
    return `${text}\n\n${LANG_DIRECTIVE}`;
}

// ---------- Состояние: чтение ----------

export function skillList(st) {
    return Object.values(st.skills).filter(Boolean);
}
export function skillVal(st, key) {
    return st.skills[key] ? Math.max(0, Math.min(100, parseInt(st.skills[key].v, 10) || 0)) : 0;
}
export function relVal(st, name) {
    return Math.max(-100, Math.min(100, parseInt(st.rels[name], 10) || 0));
}
export function signed(n) {
    return n === 0 ? '0' : (n > 0 ? '+' : '−') + Math.abs(n);
}
export function activeFlags(st) {
    return Object.keys(st.flags).map((key) => ({ key, f: st.flags[key] })).filter((x) => x.f && x.f.on)
        .sort((a, b) => (b.f.at || 0) - (a.f.at || 0));
}
export function openQuests(st) {
    return Object.values(st.quests).filter((q) => q && q.on).sort((a, b) => (b.at || 0) - (a.at || 0));
}
/** Открытые висящие нити, свежие первыми. */
export function openThreads(st) {
    return Object.values(st.threads || {}).filter((t) => t && t.on).sort((a, b) => (b.at || 0) - (a.at || 0));
}
export function achTitle(a) {
    if (!a) return '';
    return (a.slug && ACH_TITLES[a.slug]) || a.title || '';
}

// ---------- Запрос судье ----------

function stateBlock(st) {
    const L = [];
    const sk = skillList(st);
    if (modOn('skills')) L.push('=== Skills of the player now (0–100) ===\n' + (sk.length ? sk.map((e) => `${e.name} — ${skillVal(st, e.name.toLowerCase())}`).join('\n') : '(none)'));
    const rep = repNow(st);
    if (modOn('rep')) L.push(`=== Reputation now (0–100) ===\n${rep} (${repLevel(rep)})`);
    const rels = Object.keys(st.rels);
    // Thread: прежние имена (до переименования) — чтобы судья узнал персонажа и писал новое имя
    const also = (n) => { const a = aliasesOf(st, n); return a.length ? ` (also: ${a.join(', ')} — write "${n}")` : ''; };
    if (modOn('rels')) L.push('=== Relationships now (−100…+100) ===\n' + (rels.length ? rels.map((n) => `${n}${also(n)} — ${signed(relVal(st, n))} (${relLevel(relVal(st, n))})`).join('\n') : '(none)'));
    const fl = activeFlags(st);
    if (modOn('flags')) L.push('=== Marks now ===\n' + (fl.length ? fl.map((x) => x.f.name || x.key).join('\n') : '(none)'));
    // Thread: тайны — ещё и для «Кто что знает» (с теми, кто знает); тайны персоны — под '__me'
    let ft = '';
    const showFacts = modOn('facts');
    const showSecrets = modOn('facts') || modOn('knows');
    for (const n of Object.keys(st.facts)) {
        const arr = (st.facts[n] || []).filter((f) => (f.s ? showSecrets : showFacts));
        if (!arr.length) continue;
        const who = n === ME ? `${whoForModel(ME)} (the player)` : n;
        const one = (f) => (f.s ? `secret: ${f.t}${modOn('knows') ? ` (${knowsForModel(f)})` : ''}` : f.t);
        ft += `${who}: ${arr.map(one).join('; ')}\n`;
    }
    if (ft.length > 2400) ft = ft.slice(0, 2400) + '…\n';
    if (showFacts) L.push('=== Known facts and secrets (never repeat these) ===\n' + (ft.trim() || '(none)'));
    else if (showSecrets) L.push('=== Tracked secrets and who knows them (never repeat these) ===\n' + (ft.trim() || '(none)'));
    const oq = openQuests(st);
    if (modOn('flags')) L.push('=== Open promises and goals ===\n' + (oq.length ? oq.map((q) => q.name).join('\n') : '(none)'));
    const ot = openThreads(st);
    if (modOn('threads')) L.push('=== Open loose threads ===\n' + (ot.length ? ot.map((t) => t.name).join('\n') : '(none)'));
    if (modOn('ach')) L.push('=== Achievements unlocked (never repeat these slugs) ===\n' + (Object.keys(st.ach).length ? Object.keys(st.ach).join('\n') : '(none)'));
    return L.join('\n\n');
}

/** cx — из context.js: { bg, memory, date }; tx — кусок переписки. */
export function userPrompt(st, cx, tx, scan = null) {
    const parts = [];
    if (cx.bg) parts.push('=== Story background ===\n' + cx.bg);
    parts.push(stateBlock(st));
    if (cx.memory) parts.push('=== Story memory (condensed past, for context only) ===\n' + cx.memory + '\n(This is background about what happened earlier. Use it to judge the TRUE current levels, but report only corrections from the tracked values above — never re-report old events as new.)');
    // Thread: Lifeweaver и события от других расширений — как факты сюжета
    if (cx.lw?.length) parts.push('=== Current facts tracked by Lifeweaver (treat as true; do not mark them) ===\n' + cx.lw.map((x) => `- ${x}`).join('\n'));
    if (cx.reports?.length) parts.push("=== Also happened in the story (reported by the player's other story tools — treat as real story events) ===\n" + cx.reports.map((x) => `- ${x}`).join('\n'));
    // Thread: дата из Hearthtide идёт судье как справка
    if (cx.date) parts.push('=== Current in-story date ===\n' + cx.date);
    const header = scan
        ? `=== Next stretch of the story (messages ${scan.from + 1}–${scan.to} of ${scan.total}, read in order from the beginning) ===`
        : '=== New piece of the story (the last messages) ===';
    parts.push(header + '\n' + (tx || '(nothing new)'));
    parts.push('Now output the lines, or NONE.');
    return parts.join('\n\n');
}

// ---------- Разбор ответа ----------

const LINK_TYPES = {
    romance: ['romance', 'love', 'romantic', 'любов', 'романт'],
    friendship: ['friend', 'друж'],
    trust: ['trust', 'довер'],
    family: ['family', 'relatives', 'семь', 'родн'],
    business: ['business', 'work', 'professional', 'partner', 'делов', 'рабоч', 'партн'],
    rivalry: ['rival', 'competition', 'соперн', 'конкур'],
    enmity: ['enmity', 'enemy', 'hatred', 'вражд', 'враг', 'ненав'],
    secret: ['secret', 'hidden', 'affair', 'тайн', 'секрет'],
};
export const LINK_LABELS = {
    romance: 'романтика', friendship: 'дружба', trust: 'доверие', family: 'семья',
    business: 'деловые', rivalry: 'соперничество', enmity: 'вражда', secret: 'тайна',
};
function linkTypeSlug(t) {
    t = String(t || '').toLowerCase();
    if (!t) return '';
    for (const k of Object.keys(LINK_TYPES)) if (LINK_TYPES[k].some((w) => t.includes(w))) return k;
    return '';
}

// отсекаем мусор: фразы ошибок провайдера и длинные предложения — не навыки
export function goodSkillName(x) {
    if (!x) return false;
    if (x.split(/\s+/).length > 3) return false;
    if (/[.!?,;:]$/.test(x)) return false;
    if (/could not|cannot|unable|prompt|error|sorry/i.test(x)) return false;
    return true;
}
function goodTitle(x) {
    if (!x) return false;
    if (x.split(/\s+/).length > 6) return false;
    if (/[.!?,;:]$/.test(x)) return false;
    if (/could not|cannot|unable|prompt|error|sorry/i.test(x)) return false;
    return true;
}
function parseDelta(s) {
    const d = parseInt(String(s || '').replace(/[−–—]/g, '-').replace(/[^\d+-]/g, ''), 10);
    return Number.isNaN(d) ? 0 : d;
}
function cleanName(s, cap) {
    return String(s || '').replace(/^[-*+\d.\s«"“„]+/, '').replace(/[»"”]+$/, '').replace(/[*_`]/g, '').trim().slice(0, cap || 40);
}
// игровая дата: ведущие цифры НЕ режем («17 мая 2026» не должно стать «мая 2026»)
function cleanDate(s) {
    return String(s || '').replace(/^[-*+•\s«"“„]+/, '').replace(/[»"”]+$/, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}
// дельта ищется перебором полей: имя персонажа может само содержать « | »
function findDelta(p, from) {
    for (let i = from; i < p.length; i++) {
        const d = parseDelta(p[i]);
        if (d) return { i, d };
    }
    return null;
}
const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));
const wordCount = (s) => s.split(/\s+/).filter((w) => w !== '|').length;

/** Строки ответа судьи → отметки. Лимиты жёсткие, независимо от модели. */
const NORMAL_LIMITS = { rows: 11, marks: 1, quests: 1, facts: 2, ach: 99, links: 99, threads: 1, learns: 2 };

export function parse(raw, limits = NORMAL_LIMITS) {
    const lim = { ...NORMAL_LIMITS, ...limits };
    const rows = [];
    let markN = 0; // не больше одной метки за проход (при скане — трёх)
    let factN = 0;
    let questN = 0;
    let achN = 0;
    let linkN = 0;
    let threadN = 0;
    let learnN = 0;
    String(raw || '').replace(/```[a-z]*|```/gi, '').split(/\r?\n/).forEach((line) => {
        const p = line.split('|').map((x) => x.trim());
        const kind = String(p[0] || '').toUpperCase().replace(/[^A-Z]/g, '');
        if (kind === 'SKILL') {
            const hit = findDelta(p, 2);
            if (!hit) return;
            const name = cleanName(p.slice(1, hit.i).join(' '), 24);
            if (name && goodSkillName(name)) rows.push({ kind, target: name, delta: clamp(hit.d, 15), note: (p.slice(hit.i + 1).join(' | ') || '').slice(0, 240) });
        } else if (kind === 'REP') {
            const hit = findDelta(p, 1);
            if (hit) rows.push({ kind, target: '', delta: clamp(hit.d, 40), note: (p.slice(hit.i + 1).join(' | ') || '').slice(0, 240) });
        } else if (kind === 'REL') {
            const hit = findDelta(p, 2);
            if (!hit) return;
            const rn = cleanName(p.slice(1, hit.i).join(' | '));
            if (rn && wordCount(rn) <= 6 && !/could not|cannot|prompt|error/i.test(rn)) rows.push({ kind, target: rn, delta: clamp(hit.d, 35), note: (p.slice(hit.i + 1).join(' | ') || '').slice(0, 240) });
        } else if (kind === 'MARK' && p.length >= 2) {
            if (markN >= lim.marks) return;
            const on = String(p[1] || '').trim().charAt(0) !== '-';
            const mn = cleanName(p[1], 40);
            if (mn && !/could not|cannot|prompt is|error/i.test(mn)) {
                markN++;
                rows.push({ kind, target: mn, delta: 0, on, note: (p.slice(2).join(' | ') || '').slice(0, 240) });
            }
        } else if (kind === 'LINK' && p.length >= 4) {
            if (linkN >= lim.links) return;
            const na = cleanName(p[1]);
            const nb = cleanName(p[2]);
            const hit = findDelta(p, 3);
            const ld = hit ? hit.d : 0;
            const ltRaw = hit && hit.i > 3 ? p.slice(3, hit.i).join(' ') : (hit && hit.i === 3 ? '' : String(p[3] || ''));
            if (na && nb && ld && na.toLowerCase() !== nb.toLowerCase() && wordCount(na) <= 6 && wordCount(nb) <= 6) {
                linkN++;
                rows.push({ kind, a: na, b: nb, ltype: linkTypeSlug(ltRaw), delta: clamp(ld, 40), note: (hit ? p.slice(hit.i + 1).join(' | ') : '').slice(0, 240) });
            }
        } else if ((kind === 'FACT' || kind === 'SECRET') && p.length >= 3) {
            if (factN >= lim.facts) return;
            const fn = cleanName(p[1]);
            // Thread: при «Кто что знает» у SECRET последняя часть — кто уже знает
            const withKnows = kind === 'SECRET' && modOn('knows') && p.length >= 4;
            const fx = (withKnows ? p.slice(2, -1) : p.slice(2)).join(' | ').replace(/^\s*secret\s*:\s*/i, '').trim().slice(0, 140);
            if (fn && fx && fn.split(/\s+/).length <= 6 && !/could not|cannot|prompt|error/i.test(fx)) {
                factN++;
                rows.push({ kind: 'FACT', target: fn, secret: kind === 'SECRET', note: fx, delta: 0, knows: withKnows ? parseKnowers(p[p.length - 1]) : [] });
            }
        } else if (kind === 'LEARN' && p.length >= 3) {
            if (learnN >= lim.learns) return;
            const who = cleanName(p[1]);
            const sx = p.slice(2).join(' | ').replace(/^\s*secret\s*:\s*/i, '').trim().slice(0, 140);
            if (who && sx && wordCount(who) <= 6) {
                learnN++;
                rows.push({ kind, target: who, note: sx, delta: 0 });
            }
        } else if (kind === 'THREAD' && p.length >= 2) {
            if (threadN >= lim.threads) return;
            const on = String(p[1] || '').trim().charAt(0) !== '-';
            const tn = String(p[1] || '').replace(/^[\s+\-−–]+/, '').replace(/[*_`«»"]/g, '').trim().slice(0, 90);
            if (tn && !/could not|cannot|prompt is|error/i.test(tn)) {
                threadN++;
                rows.push({ kind, target: tn, on, note: (p.slice(2).join(' | ') || '').slice(0, 200), delta: 0 });
            }
        } else if (kind === 'PROMISE' && p.length >= 2) {
            if (questN >= lim.quests) return;
            const on = String(p[1] || '').trim().charAt(0) !== '-';
            const qn = String(p[1] || '').replace(/^[\s+\-−–]+/, '').replace(/[*_`«»"]/g, '').trim().slice(0, 90);
            if (qn && !/could not|cannot|prompt is|error/i.test(qn)) {
                questN++;
                rows.push({ kind, target: qn, on, note: (p.slice(2).join(' | ') || '').slice(0, 200), delta: 0 });
            }
        } else if (kind === 'ACH' && p.length >= 4) {
            if (achN >= lim.ach) return;
            const slug = cleanName(p[1], 32).toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9а-яё-]/g, '');
            const rarity = /legend|легенд/i.test(p[2]) ? 'legendary' : /rare|редк/i.test(p[2]) ? 'rare' : 'common';
            const title = cleanName(p[3], 48);
            if (slug && title && goodTitle(title) && ++achN) rows.push({ kind, target: slug, rarity, title, delta: 0, note: (p.slice(4).join(' | ') || '').slice(0, 240) });
        }
    });
    return rows.slice(0, lim.rows).filter((r) => {
        if (r.kind === 'FACT') return r.secret ? secretsOn() : modOn('facts');
        return !ROW_MOD[r.kind] || modOn(ROW_MOD[r.kind]);
    });
}

/** Строка DATE из ответа судьи (если есть). */
export function parseDate(raw) {
    const m = /^\s*DATE\s*\|\s*(.+?)\s*$/im.exec(String(raw || ''));
    return m ? cleanDate(m[1]) : '';
}

// ---------- Применение ----------

export function sameName(a, b) {
    a = String(a || '').trim().toLowerCase();
    b = String(b || '').trim().toLowerCase();
    return Boolean(a) && Boolean(b) && (a === b || a.startsWith(b + ' ') || b.startsWith(a + ' '));
}
function matchName(name, known) {
    const low = name.toLowerCase();
    for (const k of known) if (k.toLowerCase() === low) return k;
    for (const k of known) {
        const kl = k.toLowerCase();
        if (kl.startsWith(low) || low.startsWith(kl)) return k;
    }
    return name;
}
const questKey = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 80);

let logSeq = 1;
/** Запись в ленту — с id и защитой от дублей подряд. */
export function pushLog(st, e) {
    const last = st.log[st.log.length - 1];
    if (last && last.kind === e.kind && String(last.target) === String(e.target) && last.delta === e.delta
        && String(last.note) === String(e.note) && (e.at - (last.at || 0)) < 5 * 60e3) return;
    e.id = `L${logSeq++}${Date.now().toString(36)}`;
    st.log.push(e);
    if (st.log.length > MAX_LOG) st.log = st.log.slice(-MAX_LOG);
}

/**
 * Применить одну отметку. env: { total — сообщений в чате, sd — игровая дата,
 * chars — имена персонажей карточки, persona — имя персоны игрока }.
 * Возвращает true, если отметка что-то изменила (для сносок).
 */
export function applyRow(st, r, env) {
    const stamp = { sd: env.sd || '', count: env.total, at: Date.now(), ev: env.ev }; // ev — id оценки: запись откатится вместе с ней
    // Thread: персону игрока в «отношения к игроку» не записываем
    const known = Object.keys(st.rels).concat(env.chars || []);
    const isPlayer = (n) => Boolean(env.persona) && sameName(env.persona, n);
    // Thread: имя от судьи → под каким именем персонаж живёт у нас (переименования из «Отношений»)
    const nameOf = (n) => resolveName(st, matchName(resolveName(st, n), known));

    if (r.kind === 'SKILL') {
        const name = matchName(r.target, skillList(st).map((e) => e.name));
        const k = name.toLowerCase();
        if (!st.skills[k]) {
            if (skillList(st).length >= MAX_SKILLS) return false;
            st.skills[k] = { name, v: NEW_SKILL, src: 'found' };
        }
        st.skills[k].v = Math.max(0, Math.min(100, skillVal(st, k) + r.delta));
        pushLog(st, { kind: 'SKILL', target: st.skills[k].name, delta: r.delta, note: r.note, ...stamp });
        return true;
    }
    if (r.kind === 'REP') {
        st.rep = Math.max(0, Math.min(100, repNow(st) + r.delta));
        const h = Array.isArray(st.repHist) ? st.repHist : [];
        const last = h[h.length - 1];
        if (last && last[0] === env.total) last[1] = st.rep; else h.push([env.total, st.rep]);
        st.repHist = h.slice(-60);
        pushLog(st, { kind: 'REP', target: '', delta: r.delta, note: r.note, ...stamp });
        return true;
    }
    if (r.kind === 'REL') {
        if (isPlayer(r.target)) return false;
        const nm = nameOf(r.target);
        if (isIgnored(st, nm)) return false;
        if (st.rels[nm] == null) {
            if (Object.keys(st.rels).length >= MAX_RELS) return false;
            st.rels[nm] = 0;
        }
        st.rels[nm] = Math.max(-100, Math.min(100, relVal(st, nm) + r.delta));
        const h = st.relHist[nm] || [];
        const last = h[h.length - 1];
        if (last && last[0] === env.total) last[1] = st.rels[nm]; else h.push([env.total, st.rels[nm]]);
        st.relHist[nm] = h.slice(-40);
        pushLog(st, { kind: 'REL', target: nm, delta: r.delta, note: r.note, ...stamp });
        return true;
    }
    if (r.kind === 'MARK') {
        st.flags[r.target.toLowerCase()] = { name: r.target, on: r.on !== false, note: r.note, sd: stamp.sd, at: stamp.at };
        pushLog(st, { kind: 'MARK', target: r.target, delta: 0, on: r.on !== false, note: r.note, ...stamp });
        return true;
    }
    if (r.kind === 'LINK') {
        if (isPlayer(r.a) || isPlayer(r.b)) return false; // связи — между персонажами, не с игроком
        const na = nameOf(r.a);
        const nb = nameOf(r.b);
        if (isIgnored(st, na) || isIgnored(st, nb) || na.toLowerCase() === nb.toLowerCase()) return false;
        for (const n of [na, nb]) if (st.rels[n] == null && Object.keys(st.rels).length < MAX_RELS) st.rels[n] = 0;
        if (st.rels[na] == null || st.rels[nb] == null) return false;
        const k1 = na.toLowerCase();
        const k2 = nb.toLowerCase();
        const pk = k1 < k2 ? `${k1}||${k2}` : `${k2}||${k1}`;
        if (!st.pairs[pk] && Object.keys(st.pairs).length >= 12) return false;
        const pe = st.pairs[pk] || { a: na, b: nb, v: 0 };
        pe.v = Math.max(-100, Math.min(100, (parseInt(pe.v, 10) || 0) + r.delta));
        if (r.ltype) {
            pe.types = pe.types || {};
            pe.types[r.ltype] = Math.max(-100, Math.min(100, (parseInt(pe.types[r.ltype], 10) || 0) + r.delta));
        }
        if (r.note) pe.note = r.note;
        pe.sd = stamp.sd;
        pe.at = stamp.at;
        st.pairs[pk] = pe;
        r.target = `${na} — ${nb}`;
        pushLog(st, { kind: 'LINK', target: r.target, delta: r.delta, note: r.note, ...stamp });
        return true;
    }
    if (r.kind === 'FACT') {
        // факты — о персонажах, не об игроке; Thread: тайны персоны — да, если включено «Кто что знает»
        const playerSecret = isPlayer(r.target) && r.secret && modOn('knows');
        if (isPlayer(r.target) && !playerSecret) return false;
        const fnm = playerSecret ? ME : nameOf(r.target);
        if (!playerSecret && isIgnored(st, fnm)) return false;
        if (!st.facts[fnm] && Object.keys(st.facts).length >= 20) return false;
        const fa = st.facts[fnm] || [];
        const low = r.note.toLowerCase();
        const knowers = (r.knows || []).map((n) => (isPlayer(n) ? ME : nameOf(n))).filter((n) => n && n.toLowerCase() !== fnm.toLowerCase());
        const same0 = fa.find((f) => String(f.t).toLowerCase() === low);
        if (same0) { // та же тайна ещё раз — разве что пополнился список знающих
            if (!r.secret || !same0.s) return false;
            let changed = false;
            for (const n of knowers) changed = addKnower(same0, n) || changed;
            return changed;
        }
        const nf = { t: r.note, s: Boolean(r.secret), sd: stamp.sd, at: stamp.at };
        if (r.secret && knowers.length) nf.k = knowers;
        fa.push(nf);
        const same = fa.filter((f) => Boolean(f.s) === Boolean(r.secret));
        if (same.length > 5) fa.splice(fa.indexOf(same[0]), 1); // по 5 фактов и 5 секретов на персонажа
        st.facts[fnm] = fa;
        return true;
    }
    if (r.kind === 'LEARN') {
        const sec = findSecret(st, r.note);
        if (!sec || sec.f.pub) return false;
        const holderName = whoForModel(sec.holder);
        if (/^(everyone|everybody|all|все|всем|всё|everyone knows)$/i.test(r.target.trim())) {
            sec.f.pub = true;
            r.target = 'Тайна раскрыта';
        } else {
            const who = isPlayer(r.target) ? ME : nameOf(r.target);
            if (who.toLowerCase() === sec.holder.toLowerCase()) return false;
            if (!addKnower(sec.f, who)) return false;
            r.target = `${who === ME ? (env.persona || 'Ты') : who} узнаёт тайну`;
        }
        r.note = `${holderName}: ${sec.f.t}`;
        pushLog(st, { kind: 'LEARN', target: r.target, delta: 0, note: r.note, ...stamp });
        return true;
    }
    if (r.kind === 'THREAD') {
        if (!st.threads || typeof st.threads !== 'object') st.threads = {};
        let tk = questKey(r.target);
        let ex = st.threads[tk];
        if (!ex && !r.on) { // закрытие: текст мог чуть измениться — ищем похожую открытую
            const similar = openThreads(st).find((t) => { const a = questKey(t.name); return a.includes(tk) || tk.includes(a); });
            if (similar) { tk = questKey(similar.name); ex = st.threads[tk]; }
        }
        if (!r.on) {
            if (!ex || !ex.on) return false;
            ex.on = false; ex.end = r.note; ex.endAt = stamp.at; ex.endSd = stamp.sd; ex.endCount = stamp.count;
            r.target = ex.name;
        } else {
            if (ex && ex.on) return false;
            if (openThreads(st).length >= MAX_THREADS) return false;
            if (Object.keys(st.threads).length >= 40) { // место под новую: выкидываем самую старую закрытую
                const old = Object.keys(st.threads).filter((k) => !st.threads[k].on).sort((a, b) => (st.threads[a].at || 0) - (st.threads[b].at || 0))[0];
                if (!old) return false;
                delete st.threads[old];
            }
            st.threads[tk] = { name: r.target, note: r.note, on: true, sd: stamp.sd, at: stamp.at, count: stamp.count };
        }
        pushLog(st, { kind: 'THREAD', target: r.target, on: r.on, delta: 0, note: r.note, ...stamp });
        return true;
    }
    if (r.kind === 'PROMISE') {
        let qk = questKey(r.target);
        let ex = st.quests[qk];
        if (!ex && !r.on) { // закрытие: модель могла чуть переиначить текст — ищем похожее открытое
            const similar = openQuests(st).find((q) => { const a = questKey(q.name); return a.includes(qk) || qk.includes(a); });
            if (similar) { qk = questKey(similar.name); ex = st.quests[qk]; }
        }
        if (!r.on) {
            if (!ex || !ex.on) return false;
            ex.on = false; ex.end = r.note; ex.endAt = stamp.at; ex.endSd = stamp.sd;
            r.target = ex.name;
        } else {
            if (ex && ex.on) return false;
            if (Object.keys(st.quests).length >= 30) { // место под новое: выкидываем самое старое закрытое
                const old = Object.keys(st.quests).filter((k) => !st.quests[k].on).sort((a, b) => (st.quests[a].at || 0) - (st.quests[b].at || 0))[0];
                if (!old) return false;
                delete st.quests[old];
            }
            st.quests[qk] = { name: r.target, note: r.note, on: true, sd: stamp.sd, at: stamp.at };
        }
        pushLog(st, { kind: 'PROMISE', target: r.target, on: r.on, delta: 0, note: r.note, ...stamp });
        return true;
    }
    if (r.kind === 'ACH') {
        if (st.ach[r.target]) return false; // уже открыто — не повторяется
        if (Object.keys(st.ach).length >= MAX_ACH) return false;
        const known2 = achRarityOf(r.target);
        const title = known2 ? (ACH_TITLES[r.target] || r.title) : r.title; // встроенные — с русским названием
        const rarity = known2 || r.rarity;
        st.ach[r.target] = { slug: known2 ? r.target : '', title, rarity, note: r.note, sd: stamp.sd, at: stamp.at, count: stamp.count };
        r.title = title; r.rarity = rarity;
        pushLog(st, { kind: 'ACH', target: title, rarity, delta: 0, note: r.note, ...stamp });
        return true;
    }
    return false;
}

export { JUDGE_ACH };
