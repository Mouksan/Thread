// Thread — модуль астро. Порт из Storyline: знаки и MBTI персонажей, фаза луны, карта и число дня,
// ретроградный Меркурий — всё по игровой дате. Выключен по умолчанию (Разделы → Астро),
// а подсказки боту — отдельной галочкой «Влиять на сюжет», тоже выключенной.

import { ctx, getSettings, getState, saveState, modeOf } from './store.js';
import { background, transcript, characterNames, personaName } from './context.js';
import { requestJudge } from './connection.js';
import { namesMatch } from './avatars.js';
import { AZ_TAROT, TAROT_EN, AZ_NUMS, AZ_MOON, RETRO_T0, RETRO_DATA } from './astro-data.js';

export const SIGN_ICON = { aries: '♈', taurus: '♉', gemini: '♊', cancer: '♋', leo: '♌', virgo: '♍', libra: '♎', scorpio: '♏', sagittarius: '♐', capricorn: '♑', aquarius: '♒', pisces: '♓' };
export const SIGN_RU = { aries: 'Овен', taurus: 'Телец', gemini: 'Близнецы', cancer: 'Рак', leo: 'Лев', virgo: 'Дева', libra: 'Весы', scorpio: 'Скорпион', sagittarius: 'Стрелец', capricorn: 'Козерог', aquarius: 'Водолей', pisces: 'Рыбы' };
const SIGN_EN = { aries: 'Aries', taurus: 'Taurus', gemini: 'Gemini', cancer: 'Cancer', leo: 'Leo', virgo: 'Virgo', libra: 'Libra', scorpio: 'Scorpio', sagittarius: 'Sagittarius', capricorn: 'Capricorn', aquarius: 'Aquarius', pisces: 'Pisces' };
export const MBTI_TYPES = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'];
const MOON_EN = [
    'new moon — a blank page, quiet intentions, fresh starts',
    'waxing crescent — first sprouts, forgiveness, cautious plans',
    'first quarter — resolve; obstacles give way to push',
    'waxing gibbous — things come together; a good time to ask and negotiate',
    'full moon — emotions peak: bright confessions, bright quarrels',
    'waning gibbous — gratitude, repaying debts, settling accounts',
    'last quarter — clearing out the old: clutter and grudges',
    'waning crescent — stillness, tiredness, rest before a new cycle',
];
export const FREQ = { rare: 12, mid: 6, often: 3 };
const FX_DEF = { on: false, retro: true, moon: true, tarot: true, num: true, sign: true, freq: 'mid' };

export const ME = '__me';

// ---------- Данные чата ----------

export function astroState(st) {
    if (!st.astro || typeof st.astro !== 'object') st.astro = {};
    if (!st.astro.people || typeof st.astro.people !== 'object') st.astro.people = {};
    const fx = st.astro.fx && typeof st.astro.fx === 'object' ? st.astro.fx : {};
    st.astro.fx = { ...FX_DEF, ...fx };
    if (!FREQ[st.astro.fx.freq]) st.astro.fx.freq = 'mid';
    return st.astro;
}

export function astroOn() {
    return modeOf('astro') !== 'off';
}

// ---------- Знак, луна, карта, число ----------

export function zodiacOf(dstr) {
    const m = String(dstr || '').match(/^(\d{1,2})[.\-/](\d{1,2})/);
    if (!m) return null;
    const d = +m[1];
    const mo = +m[2];
    if (mo < 1 || mo > 12 || d < 1 || d > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]) return null; // 31.02 и т.п.
    const edges = [[20, 'capricorn', 'aquarius'], [19, 'aquarius', 'pisces'], [21, 'pisces', 'aries'], [20, 'aries', 'taurus'], [21, 'taurus', 'gemini'], [21, 'gemini', 'cancer'],
        [23, 'cancer', 'leo'], [23, 'leo', 'virgo'], [23, 'virgo', 'libra'], [23, 'libra', 'scorpio'], [22, 'scorpio', 'sagittarius'], [22, 'sagittarius', 'capricorn']];
    const [edge, before, after] = edges[mo - 1];
    return d >= edge ? after : before;
}

/** Номер «случайной, но предсказуемой» карты/числа: зависит от имени и даты. */
function seed(key, ms) {
    const s = `${key}|${Math.floor(ms / 864e5)}`;
    let h = 7;
    for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
    return h;
}

export function moonIdx(ms) {
    const syn = 29.530588853;
    const ref = Date.UTC(2000, 0, 6, 18, 14) / 864e5;
    let p = ((ms / 864e5 - ref) % syn) / syn;
    if (p < 0) p += 1;
    return Math.floor(p * 8) % 8;
}

export function daily(key, ms) {
    const s = seed(key, ms);
    return { moon: AZ_MOON[moonIdx(ms)], tarot: AZ_TAROT[s % 22], tarotEn: TAROT_EN[s % 22], num: AZ_NUMS[(s >>> 5) % 10] };
}

// ---------- Ретроградный Меркурий ----------

let retroCache = null;
function retroTable() {
    if (retroCache) return retroCache;
    const out = [];
    let d = RETRO_T0;
    for (let i = 0; i + 3 <= RETRO_DATA.length; i += 3) {
        if (i > 0) d += parseInt(RETRO_DATA.substr(i, 2), 36);
        out.push([d, d + parseInt(RETRO_DATA.substr(i + 2, 1), 36)]);
    }
    retroCache = out;
    return out;
}

/** { on, n, total, left, start, end } | { on: false, start, end, inDays } | null (вне 1900–2100). */
export function retroAt(ms) {
    const day = Math.floor(ms / 864e5);
    const t = retroTable();
    if (!t.length || day < t[0][0] - 100 || day > t[t.length - 1][1]) return null;
    for (const [a, b] of t) {
        if (day >= a && day <= b) return { on: true, n: day - a + 1, total: b - a + 1, left: b - day, start: a, end: b };
        if (day < a) return { on: false, start: a, end: b, inDays: a - day };
    }
    return null;
}

function dayFmt(dn, withYear) {
    try {
        return new Date(dn * 864e5).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' });
    } catch {
        return '';
    }
}

export function retroRange(a, b) {
    const ya = new Date(a * 864e5).getUTCFullYear();
    const yb = new Date(b * 864e5).getUTCFullYear();
    return `${dayFmt(a, ya !== yb)} – ${dayFmt(b, true)}`;
}

// ---------- Игровая дата ----------

const MONTHS = [/^(янв|jan)/i, /^(фев|feb)/i, /^(мар|mar)/i, /^(апр|apr)/i, /^(ма[йя]|may)/i, /^(июн|jun)/i, /^(июл|jul)/i, /^(авг|aug)/i, /^(сен|sep)/i, /^(окт|oct)/i, /^(ноя|nov)/i, /^(дек|dec)/i];

function mkDate(y, m, d, guess) {
    if (!(m >= 0 && m < 12) || !(d >= 1 && d <= 31) || !(y >= 1 && y <= 9999)) return null;
    const dt = new Date(Date.UTC(2000, m, d, 12));
    dt.setUTCFullYear(y);
    if (dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return null;
    return { ms: dt.getTime(), guess: Boolean(guess) };
}

/** Игровая дата из строки («17 мая 2026, 23:40», «1996-10-10», «17.05.2026»…). Порт parseStoryDate. */
export function parseStoryDate(text) {
    const t = String(text || '');
    const curY = new Date().getFullYear();
    let m;
    if ((m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) return mkDate(+m[1], +m[2] - 1, +m[3]);
    if ((m = t.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/))) return mkDate(+m[3], +m[2] - 1, +m[1]);
    const tok = t.toLowerCase().match(/[a-zа-яё]+|\d+/g) || [];
    let mi = -1;
    let mo = -1;
    for (let i = 0; i < tok.length && mi < 0; i++) {
        for (let j = 0; j < 12; j++) if (MONTHS[j].test(tok[i])) { mi = i; mo = j; break; }
    }
    if (mi < 0) return null;
    const isDay = (x) => x != null && /^\d{1,2}$/.test(x) && +x >= 1 && +x <= 31;
    const day = isDay(tok[mi - 1]) ? +tok[mi - 1] : (isDay(tok[mi + 1]) ? +tok[mi + 1] : 0);
    if (!day) return null;
    const yr = tok.find((x) => /^\d{4}$/.test(x) && +x >= 1000 && +x <= 2999);
    return mkDate(yr ? +yr : curY, mo, day, !yr);
}

/** Дата для астро: игровая (точная дата из тега Hearthtide важнее текста), иначе сегодня. */
export function astroDay(st) {
    const iso = st?.sdate?.iso;
    const text = st?.sdate?.text || '';
    const p = (iso && parseStoryDate(iso)) || (text && parseStoryDate(text));
    if (p) return { ms: p.ms, src: 'game', guess: p.guess, text: iso && !p.guess ? `${text}${/\d{4}/.test(text) ? '' : `, ${new Date(p.ms).getUTCFullYear()}`}` : text };
    return { ms: Date.now(), src: 'real', guess: false, text: '' };
}

// ---------- Кто есть в астро ----------

/**
 * Люди для астро: игрок, персонажи карточки и все из «Отношений» — без дублей
 * (карточный «Renzo» и судейский «Ренцо» — один человек). [{ key, name, isMe, isBot }]
 */
export function astroPeople(st) {
    const out = [{ key: ME, name: personaName() || 'Ты', isMe: true, isBot: false }];
    const relNames = Object.keys(st.rels || {});
    const cards = characterNames();
    for (const n of relNames) out.push({ key: n, name: n, isMe: false, isBot: cards.some((c) => namesMatch(c, n)) });
    for (const c of cards) {
        if (!relNames.some((n) => namesMatch(c, n))) out.push({ key: c, name: c, isMe: false, isBot: true });
    }
    return out;
}

function botPerson(st) {
    return astroPeople(st).find((p) => p.isBot) || null;
}

// ---------- Подсказки боту ----------

const one = (body) => `[Note, not part of the roleplay. A small sign in the air today: ${body} Use it as a light touch only if it fits the scene naturally — a glance at a clock, a card turned over, a trait showing through — and don't force it. Never mention this note.]`;

/** Очередь подсказок на сегодня: по одной за раз, по кругу; пока идёт ретроград — он каждый третий. */
export function astroItems(st) {
    const a = astroState(st);
    const f = a.fx;
    if (!f.on || !astroOn()) return [];
    const ad = astroDay(st);
    const g = { retro: [], moon: [], tarot: [], num: [], sign: [] };
    if (f.retro) {
        const r = retroAt(ad.ms);
        if (r && r.on) {
            const body = r.n <= 2
                ? 'Mercury has just turned retrograde: the first signs of the usual mess — a message out of the blue from the past, a small mix-up, a delay.'
                : r.left <= 2
                    ? 'Mercury retrograde is nearly over: loose ends are tying up, the past has its last word and then settles.'
                    : `Mercury is retrograde (day ${r.n} of ${r.total}): communication goes sideways — misunderstandings, mixed-up or delayed messages, plans falling through, glitching gadgets — and the past resurfaces: exes and old acquaintances get in touch, old secrets, debts and unfinished business return.`;
            g.retro.push(`[Note, not part of the roleplay. ${body} Show it through at most one small, natural mishap or echo of the past in this reply, only if it fits the scene. Never mention astrology or this note.]`);
        }
    }
    if (f.moon) g.moon.push(one(`Moon: ${MOON_EN[moonIdx(ad.ms)]}.`));
    const who = [[ME, personaName() || 'the player']];
    const bot = botPerson(st);
    if (bot) who.push([bot.key, bot.name]);
    for (const [key, name] of who) {
        const d = daily(key, ad.ms);
        if (f.tarot) g.tarot.push(one(`${name}'s tarot card of the day: ${d.tarotEn} (let its meaning colour the day subtly).`));
        if (f.num) g.num.push(one(`${name} keeps noticing the number ${d.num.n} (clocks, receipts, plates) — a small sign.`));
        const p = a.people[key];
        if (f.sign && p) {
            const z = p.d ? zodiacOf(p.d) : null;
            const bits = [z ? SIGN_EN[z] : '', p.mbti || ''].filter(Boolean);
            if (bits.length) g.sign.push(one(`${name}: ${bits.join(', ')} (let it shape temperament and reactions).`));
        }
    }
    const rest = [];
    for (let round = 0; ; round++) {
        let more = false;
        for (const k of ['tarot', 'num', 'moon', 'sign']) {
            if (g[k][round]) { rest.push(g[k][round]); more = true; }
        }
        if (!more) break;
    }
    if (!g.retro.length) return rest;
    const items = [];
    rest.forEach((x, i) => { if (i % 2 === 0) items.push(g.retro[0]); items.push(x); });
    if (!rest.length) items.push(g.retro[0]);
    return items;
}

// ---------- Подбор профилей моделью ----------

const CALC_SYS = 'You invent a fun fictional astro-profile for a character of a roleplay story. Pick a plausible birth date that fits the character as shown in the story, and one of the 16 MBTI types. If the character description below contains an explicit birth date, use it EXACTLY. Reply with EXACTLY one line in the format: DD.MM.YYYY | XXXX (XXXX = MBTI type). No explanations, no other text.';

function cardDescription(name) {
    const c = ctx();
    const sub = (t) => { try { return c.substituteParams(String(t || '')); } catch { return String(t || ''); } };
    if (name === ME) return sub(c.powerUserSettings?.persona_description);
    const ch = (c.characters || []).find((x) => x?.name && namesMatch(x.name, name));
    return ch ? sub(ch.description || ch.data?.description) : '';
}

/** «✨ Угадать» для одного человека. Ручной профиль не трогаем. */
export async function astroCalc(key, name) {
    const st = getState();
    if (!st) return;
    const desc = cardDescription(key === ME ? ME : name);
    const user = `Character: ${name}${key === ME ? ' (the player)' : ''}\n--- Character description ---\n${desc || '(none)'}\n\n=== Story background ===\n${background()}\n\n=== The story so far (excerpt) ===\n${transcript(12) || '(nothing)'}`;
    const raw = await requestJudge({ system: CALC_SYS, user });
    const m = String(raw || '').match(/(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?\s*\|\s*([A-Za-z]{4})/);
    if (!m) throw new Error('No date | MBTI line in the reply');
    const dstr = `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}${m[3] ? `.${m[3]}` : ''}`;
    if (!zodiacOf(dstr)) throw new Error('Bad date in the reply');
    const mbti = m[4].toUpperCase();
    const now = getState();
    astroState(now).people[key] = { d: dstr, mbti: MBTI_TYPES.includes(mbti) ? mbti : '', src: 'ai' };
    await saveState();
}

/** Сохранить вручную. dstr — «дд.мм» или «дд.мм.гггг». Возвращает текст ошибки или ''. */
export function astroSet(st, key, dstr, mbti) {
    const d = String(dstr || '').trim();
    if (d && !zodiacOf(d)) return 'Проверь дату: дд.мм или дд.мм.гггг';
    const people = astroState(st).people;
    if (!d && !mbti) delete people[key];
    else people[key] = { d, mbti: MBTI_TYPES.includes(mbti) ? mbti : '', src: 'manual' };
    return '';
}

export function astroInfluenceGlobal() {
    return getSettings().influence;
}
