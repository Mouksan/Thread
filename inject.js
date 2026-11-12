// Thread — что получает бот перед генерацией: скрытая записка о статах и заряженный бросок 🎲.
// Порт из Storyline (writeInject + generation:prepare в actions.js), под таверну:
// перехватчик генерации (generate_interceptor в manifest.json) решает, что положить в extension prompt.

import { ctx, getSettings, getState, saveStateDebounced, modOn, repNow } from './store.js';
import { skillList, skillVal, relVal, signed, activeFlags, openQuests } from './judge.js';
import { astroItems, astroState, FREQ } from './astro.js';

const NOTE_KEY = 'thread_note';
const CHECK_KEY = 'thread_check';
const ASTRO_KEY = 'thread_astro';
const IN_CHAT = 1;          // extension_prompt_types.IN_CHAT
const ROLE_SYSTEM = 0;      // extension_prompt_roles.SYSTEM
const NOTE_DEPTH = 1;       // перед последним сообщением игрока
const CHECK_DEPTH = 0;      // исход броска — в самом конце, ближе всего к ответу
const REFRESH_EVERY = 5;    // записка без изменений всё равно освежается раз в 5 ответов (как в оригинале)
const CHECK_TTL = 3 * 36e5; // заряженный бросок живёт 3 часа (как в оригинале)

// Уровни — по-английски: записка уходит модели (тексты из английской локали Storyline)
const REP_EDGES = [15, 30, 45, 60, 75, 90, 101];
const REP_GEN = ['outcast', 'distrusted', 'watched', 'neutral', 'respected', 'admired', 'beloved'];
const REL_EDGES = [-60, -20, 20, 60];
const REL_GEN = ['hostile', 'cold', 'neutral', 'fond', 'devoted'];
const repIdx = (v) => { for (let i = 0; i < REP_EDGES.length; i++) if (v < REP_EDGES[i]) return i; return REP_EDGES.length - 1; };
const relIdx = (v) => { for (let i = 0; i < REL_EDGES.length; i++) if (v < REL_EDGES[i]) return i; return REL_EDGES.length; };

const GUIDE = {
    crit: 'a brilliant success, better than they hoped',
    success: 'a success',
    fail: 'a failure — the attempt does not work out, with a believable consequence',
    fumble: 'a bad failure with an awkward or costly consequence',
};

/** Текст записки для бота ('' — сообщать нечего). Шаблоны — дословно из Storyline. */
export function noteText(st) {
    if (!st || !st.touched || !getSettings().influence) return ''; // до первой оценки боту нечего сообщать
    const parts = [];
    // нули боту не шлём: «Дипломатия 0» он читает как «игрок ничего не умеет»
    const sk = modOn('skills') ? skillList(st).filter((e) => skillVal(st, e.name.toLowerCase()) > 0) : [];
    if (sk.length) parts.push(`skills: ${sk.map((e) => `${e.name} ${skillVal(st, e.name.toLowerCase())}`).join(', ')}`);
    if (modOn('rep')) {
        const rep = repNow(st);
        const i = repIdx(rep);
        const hint = i <= 1 ? ' — strangers distrust the player, doors close and accusations stick'
            : i >= 4 ? ' — people give the player the benefit of the doubt and hear them out' : '';
        parts.push(`reputation: ${rep}/100 (${REP_GEN[i]})${hint}`);
    }
    const rels = modOn('rels') ? Object.keys(st.rels).sort((a, b) => Math.abs(relVal(st, b)) - Math.abs(relVal(st, a))).slice(0, 6) : [];
    if (rels.length) parts.push(`relationships: ${rels.map((n) => `${n} ${signed(relVal(st, n))} (${REL_GEN[relIdx(relVal(st, n))]})`).join('; ')}`);
    const fl = modOn('flags') ? activeFlags(st) : [];
    if (fl.length) parts.push(`marks: ${fl.map((x) => x.f.name || x.key).join('; ')}`);
    // Thread: «помни, но не форсируй» — чтобы бот не кидался выполнять обещания и не гнал сюжет
    const oq = modOn('flags') ? openQuests(st).slice(0, 4) : [];
    if (oq.length) parts.push(`open promises and goals to keep in mind (let them surface naturally; never force or rush them): ${oq.map((q) => q.name).join('; ')}`);
    const pairs = modOn('rels') ? Object.values(st.pairs || {}).filter(Boolean).sort((a, b) => Math.abs(b.v || 0) - Math.abs(a.v || 0)).slice(0, 4) : [];
    if (pairs.length) parts.push(`ties among characters: ${pairs.map((x) => `${x.a}—${x.b} ${signed(x.v || 0)}`).join('; ')}`);
    if (!parts.length) return '';
    return `[Note, not part of the roleplay. Current story stats: ${parts.join('. ')}. Let these quietly shape how every character treats the player — warmth, trust, reluctance, jealousy, closed doors. Show it through behaviour; never mention the numbers or this note.]`;
}

export function checkNoteText(r) {
    return `[Skill check, not part of the roleplay. The player's next action relies on ${r.skill} (${r.v}/100). Result: ${GUIDE[r.res]}. Narrate the outcome of their attempt accordingly and keep it consistent with the story. Never mention dice, numbers or this note.]`;
}

/** Заряженный бросок, если он ещё жив. */
export function armedCheck(st) {
    const c = st?.check;
    if (!c || !c.armed) return null;
    if (Date.now() - (c.at || 0) > CHECK_TTL) return null;
    return c;
}

function setPrompt(key, text, depth) {
    try {
        ctx().setExtensionPrompt(key, text || '', IN_CHAT, depth, false, ROLE_SYSTEM);
    } catch (error) {
        console.warn('[Thread] не удалось положить записку в промпт:', error);
    }
}

export function clearPrompts() {
    setPrompt(NOTE_KEY, '', NOTE_DEPTH);
    setPrompt(CHECK_KEY, '', CHECK_DEPTH);
    setPrompt(ASTRO_KEY, '', NOTE_DEPTH);
}

/** Для «Последнего ответа судьи»: что ушло боту в последний раз. */
export let lastInjected = null;

/**
 * Перехватчик генерации таверны. Вызывается до сборки промпта, поэтому успевает положить
 * или убрать наши extension prompts. type: normal | swipe | regenerate | continue | impersonate | quiet.
 */
export async function interceptor(chat, contextSize, abort, type) {
    try {
        // Тихие запросы (служебные генерации других расширений) и «писать за меня» — без записок
        if (type === 'quiet' || type === 'impersonate') {
            clearPrompts();
            return;
        }
        const st = getState();
        if (!st) {
            clearPrompts();
            return;
        }
        const total = Array.isArray(ctx().chat) ? ctx().chat.length : 0;
        // Какое сообщение сейчас пишет бот: новое — или переписывает последнее (свайп, перегенерация, продолжение)
        const target = (type === 'swipe' || type === 'regenerate' || type === 'continue') ? total - 1 : total;
        const inj = st.inj && typeof st.inj === 'object' ? st.inj : (st.inj = { last: '', cnt: 0, sentFor: null });

        // --- записка ---
        const text = noteText(st);
        let note = '';
        if (text) {
            if (inj.sentFor === target) note = text;          // переписываем тот же ответ — записка та же
            else {
                inj.cnt = (inj.cnt || 0) + 1;
                if (text !== inj.last || inj.cnt % REFRESH_EVERY === 0) {
                    note = text;
                    inj.last = text;
                    inj.sentFor = target;
                }
            }
        }
        setPrompt(NOTE_KEY, note, NOTE_DEPTH);

        // --- бросок: уходит с ответом на действие игрока и с перегенерацией этого ответа; потом сгорает ---
        let checkNote = '';
        const chk = armedCheck(st);
        if (chk) {
            if (chk.target == null) chk.target = target;
            if (chk.target === target) checkNote = chk.note;
            else chk.armed = false;                           // следующий ход игрока — бросок сгорел
        } else if (st.check?.armed) {
            st.check.armed = false;                           // протух
        }
        setPrompt(CHECK_KEY, checkNote, CHECK_DEPTH);

        // --- астро: одна подсказка раз в N ответов, по кругу; свайп того же ответа получает ту же ---
        let astro = '';
        const items = getSettings().influence ? astroItems(st) : [];
        if (items.length) {
            if (inj.astroFor === target) astro = inj.astroLast || '';
            else {
                inj.astroCnt = (inj.astroCnt || 0) + 1;
                const every = FREQ[astroState(st).fx.freq] || 6;
                if (inj.astroCnt % every === 0) {
                    astro = items[(inj.astroIdx || 0) % items.length];
                    inj.astroIdx = (inj.astroIdx || 0) + 1;
                    inj.astroFor = target;
                    inj.astroLast = astro;
                }
            }
        }
        setPrompt(ASTRO_KEY, astro, NOTE_DEPTH);

        lastInjected = { at: new Date(), type, note, check: checkNote, astro };
        saveStateDebounced();
    } catch (error) {
        console.error('[Thread] перехватчик генерации:', error);
    }
}
