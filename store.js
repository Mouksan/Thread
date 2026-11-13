// Thread — настройки, данные чата и мелкие помощники.
// Устройство хранилища — как в Junket; состав данных чата — как у Storyline (Svetlyachok).

export const MODULE = 'thread';      // ключ в extension_settings
export const META_KEY = 'thread';    // ключ в метаданных чата
export const TOAST_TITLE = 'Thread';

// Разделы и их режимы: 'on' — работает и видно, 'hide' — вкладка спрятана, данные собираются,
// 'off' — не собирается и не тратит токены. Переключатели появятся на этапе 6.
export const DEFAULT_MODES = Object.freeze({
    rels: 'on',      // отношения и связи между персонажами
    facts: 'off',    // досье: факты и секреты
    skills: 'on',
    rep: 'on',
    flags: 'on',     // метки и обещания
    ach: 'on',
    astro: 'off',
});

export const DEFAULT_SETTINGS = Object.freeze({
    version: 1,
    profileId: '',       // профиль подключения для судьи; пусто — текущее подключение таверны
    auto: true,          // судья следит сам
    everyN: 3,           // раз в N сообщений
    histDepth: 10,       // сколько последних сообщений читает судья: 10 | 20 | 40 | 80
    influence: true,     // записка боту
    toasts: true,        // сноски поверх чата
    toastMode: 'click',  // когда сноска уходит: 'click' | '5' | '15' (секунды)
    repStart: 50,        // с чего начинается репутация
    memChat: false,      // память судьи: лорбук, привязанный к чату
    scanSize: 50,        // скан истории: сообщений в пачке (30–80)
    lifeweaver: true,    // учитывать Lifeweaver (только чтение; работает, только если он стоит)
    meNames: {},
    relView: 'map',      // «Отношения»: карта или список (запоминается последний выбор)
    mapZoom: 1,          // зум карты связей
    mapPan: { x: 0, y: 0 }, // сдвиг карты связей
    mapLegend: false,    // легенда карты развёрнута         // своё имя персоны для показа в Thread: ключ персоны → имя
    modes: DEFAULT_MODES,
});

export const HIST_DEPTHS = [10, 20, 40, 80];

export function ctx() {
    // Всегда берём свежий контекст: после смены чата объекты внутри меняются
    return SillyTavern.getContext();
}

export function getSettings() {
    const c = ctx();
    if (!c.extensionSettings[MODULE] || typeof c.extensionSettings[MODULE] !== 'object') {
        c.extensionSettings[MODULE] = structuredClone(DEFAULT_SETTINGS);
    }
    const s = c.extensionSettings[MODULE];
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (s[key] === undefined) s[key] = structuredClone(value);
    }
    if (!s.modes || typeof s.modes !== 'object') s.modes = structuredClone(DEFAULT_MODES);
    for (const [key, value] of Object.entries(DEFAULT_MODES)) {
        if (!['on', 'hide', 'off'].includes(s.modes[key])) s.modes[key] = value;
    }
    return s;
}

export function saveSettings() {
    ctx().saveSettingsDebounced();
}

export function modeOf(section) {
    return getSettings().modes[section] || 'on';
}

/** Раздел собирается (режимы «вкл» и «скрыть»). */
export function modOn(section) {
    return modeOf(section) !== 'off';
}

// ---------- Помощники ----------

export function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

// ---------- Данные чата ----------

export function currentChatId() {
    return ctx().getCurrentChatId?.() || null;
}

export function emptyState() {
    return {
        v: 1,
        touched: false,   // судья хоть раз смотрел эту историю
        count: 0,         // до какого сообщения оценено
        rep: null,        // null до первой оценки — показываем стартовую из настроек
        repHist: [],      // [номер сообщения, значение] для графика
        skills: {},
        rels: {},
        relHist: {},
        pairs: {},        // связи между персонажами
        facts: {},        // досье
        flags: {},        // метки
        quests: {},       // обещания и цели
        ach: {},
        log: [],          // лента событий
        sdate: null,      // игровая дата
        genre: '',
        astro: {},
        snaps: [],        // снимки для отката
        redo: [],         // отменённые оценки — вдруг их вариант ответа вернётся
        rerollWait: null,
        check: null,      // заряженный бросок 🎲
        skillsOff: [],    // навыки, убранные вручную (базовые сами не возвращаются)
        chapters: [{ start: 0, title: '' }], // границы глав (номер сообщения, с которого глава начинается)
        avatars: {},      // ручные аватарки: имя → путь к картинке | 'none'
        mapPos: {},       // карта связей: имя (строчными) → { x, y }, расставлено вручную; в снимки не входит
        aliases: {},      // прежнее имя (строчными) → нынешнее: переименования в «Отношениях»
        reports: [],      // события от других расширений через window.Thread.report — до следующей оценки
        ignored: [],      // убранные персонажи (строчными) — судья их больше не записывает
        inj: { last: '', cnt: 0, sentFor: null }, // что и когда уходило боту в записке // после отката ждём нового сообщения, а не оцениваем каждый свайп
    };
}

/** Хранилище Thread в метаданных текущего чата. null — чат не открыт. */
export function getState() {
    if (!currentChatId()) return null;
    const meta = ctx().chatMetadata;
    if (!meta) return null;
    if (!meta[META_KEY] || typeof meta[META_KEY] !== 'object') meta[META_KEY] = emptyState();
    const st = meta[META_KEY];
    // Догоняем старые данные до текущего состава полей
    for (const [key, value] of Object.entries(emptyState())) {
        if (st[key] === undefined) st[key] = value;
    }
    return st;
}

let updateTimer = null;
/** Другим расширениям: отметки изменились (детали — window.Thread.summary()). */
function notifyUpdate() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
        try { window.dispatchEvent(new CustomEvent('thread:update')); } catch { /* не страшно */ }
    }, 150);
}

export async function saveState() {
    await ctx().saveMetadata();
    notifyUpdate();
}

export function saveStateDebounced() {
    const c = ctx();
    if (typeof c.saveMetadataDebounced === 'function') c.saveMetadataDebounced();
    else c.saveMetadata();
}

/** Текущая репутация: до первой оценки — стартовая из настроек. */
export function repNow(st) {
    if (st && st.rep != null) return clampInt(st.rep, 0, 100, 50);
    return clampInt(getSettings().repStart, 0, 100, 50);
}

// Уровни — границы и названия как у Storyline
const REP_EDGES = [15, 30, 45, 60, 75, 90, 101];
const REP_NAMES = ['изгой', 'не доверяют', 'косятся', 'сдержанно', 'уважают', 'ценят', 'любят'];
export function repLevel(value) {
    for (let i = 0; i < REP_EDGES.length; i++) if (value < REP_EDGES[i]) return REP_NAMES[i];
    return REP_NAMES[REP_NAMES.length - 1];
}

const REL_EDGES = [-60, -20, 20, 60];
const REL_NAMES = ['враждебность', 'холод', 'равнодушие', 'симпатия', 'привязанность'];
export function relLevel(value) {
    for (let i = 0; i < REL_EDGES.length; i++) if (value < REL_EDGES[i]) return REL_NAMES[i];
    return REL_NAMES[REL_NAMES.length - 1];
}
