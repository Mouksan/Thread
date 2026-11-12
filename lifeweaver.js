// Thread — связь с Lifeweaver, только на чтение. Lifeweaver ни в чём не меняется.
// Состояние берём из его хранилища: extension_settings['third-party/lifeweaver'].chatData[id чата].
// Id чата ищется теми же формами, что у самого Lifeweaver (state.js: computeChatIdForms).
// Скрытая беременность (персонаж ещё не знает) остаётся скрытой: ни судье, ни в окно, ни боту.

import { ctx, getSettings } from './store.js';

const LW_KEY = 'third-party/lifeweaver';

function chatIdForms() {
    const c = ctx();
    const meta = c.chatMetadata || c.chat_metadata;
    const forms = [];
    const fname = meta?.file_name || meta?.fileName;
    if (typeof fname === 'string' && fname) forms.push(`file:${fname.replace(/\.jsonl$/i, '')}`);
    const directId = c.chatId ?? c.getCurrentChatId?.();
    if ((typeof directId === 'string' && directId.trim()) || typeof directId === 'number') {
        let s = String(directId).trim();
        s = s.replace(/\s-\s(\d{4}-\d{2}-\d{2}@\d{2}h\d{2}m\d{2}s)\d*ms$/, ' - $1');
        s = s.replace(/\s@(\d{4}-\d{2}-\d{2}@\d{2}h\d{2}m\d{2}s)\d*ms$/, ' @$1');
        forms.push(c.groupId ? `group:${c.groupId}/${s}` : s);
    }
    if (meta?.integrity) forms.push(`uuid:${String(meta.integrity)}`);
    const hash = meta?.chat_id_hash ?? meta?.chatIdHash;
    if (hash !== undefined && hash !== null && hash !== '') forms.push(`hash:${String(hash)}`);
    return forms;
}

/** { settings, chat } Lifeweaver для текущего чата или null (нет расширения, выключено, нет данных, связь выключена). */
function lwData() {
    if (!getSettings().lifeweaver) return null;
    const lw = ctx().extensionSettings?.[LW_KEY];
    if (!lw || typeof lw !== 'object' || lw.isEnabled === false || !lw.chatData) return null;
    for (const id of chatIdForms()) {
        if (lw.chatData[id]) return { settings: lw, chat: lw.chatData[id] };
    }
    return null;
}

export function lifeweaverInstalled() {
    const lw = ctx().extensionSettings?.[LW_KEY];
    return Boolean(lw && typeof lw === 'object');
}

function nameOf(chat, who) {
    const c = ctx();
    const custom = String(chat.characters?.[who]?.displayName || '').trim();
    if (custom) return custom;
    return who === 'user' ? (c.name1 || 'Player') : (c.name2 || 'Character');
}

/** Знают ли в истории о беременности — та же логика, что isPregnancyObvious в Lifeweaver. */
function known(lw, chat, who) {
    const p = chat.characters?.[who]?.pregnancy;
    if (!p?.isPregnant) return false;
    if (!lw.hiddenPregnancy || p.pregnancyKnown) return true;
    if ((chat.clutches || []).some((cl) => cl?.parentWho === who)) return true;
    return (parseInt(p.weeks, 10) || 0) >= Math.max(1, parseInt(lw.obviousAtWeek, 10) || 12);
}

/**
 * Что сейчас известно по Lifeweaver: [{ who, name, kind, text, textEn }].
 * kind: 'pregnancy' | 'clutch' | 'children'.
 */
export function lifeweaverFacts() {
    const data = lwData();
    if (!data) return [];
    const { settings: lw, chat } = data;
    const out = [];
    for (const who of ['user', 'char']) {
        const p = chat.characters?.[who]?.pregnancy;
        const name = nameOf(chat, who);
        if (p?.isPregnant && known(lw, chat, who)) {
            const weeks = parseInt(p.weeks, 10) || 0;
            const n = Math.max(1, parseInt(p.offspringCount, 10) || 1);
            out.push({
                who, name, kind: 'pregnancy',
                text: `Беременность — ${name}${weeks ? ` · ${weeks} нед.` : ''}${n > 1 ? ` · ${n} ${n < 5 ? 'малыша' : 'малышей'}` : ''}`,
                textEn: `${name} is pregnant${weeks ? ` (week ${weeks})` : ''}${n > 1 ? `, expecting ${n}` : ''}`,
            });
        }
        const clutches = (chat.clutches || []).filter((cl) => cl?.parentWho === who);
        if (clutches.length) {
            out.push({
                who, name, kind: 'clutch',
                text: `Кладка — ${name}${clutches.length > 1 ? ` · ${clutches.length}` : ''} · инкубация`,
                textEn: `${name}'s ${clutches.length > 1 ? `${clutches.length} clutches are` : 'clutch is'} incubating`,
            });
        }
    }
    const kids = (chat.children || []).filter(Boolean);
    if (kids.length) {
        const names = kids.map((k) => String(k.name || '').trim() || 'без имени');
        out.push({
            who: '', name: '', kind: 'children',
            text: `Дети: ${names.join(', ')}`,
            textEn: `Children in the story: ${names.join(', ')}`,
        });
    }
    return out;
}

/** Строка в системный промпт судьи: эти вещи считает Lifeweaver — метками их не дублировать. */
export function lifeweaverRule() {
    return lwData()
        ? ['', 'Pregnancy, heat/rut cycles, clutches and children are tracked by another tool (Lifeweaver): never output MARK lines about them.']
        : [];
}
