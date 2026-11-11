// Thread — что читает судья: карточка, персона, кусок переписки, память и игровая дата.
// Схема — как в Storyline (background / transcript), источники — таверны.

import { ctx, getSettings } from './store.js';

// Thread: в оригинале описание резалось до 400 знаков, а сообщение — до 600. Здесь ничего не режем:
// карточка, персона и сообщения уходят судье целиком, объём регулируется только глубиной чтения.
const MEM_CAP = 8000;       // память судьи (лорбук чата) — единственный потолок, как в оригинале

const HIDDEN_BLOCKS = /<(think|thinking|reasoning|thought|rp_preflight|style|script)\b[^>]*>[\s\S]*?<\/\1>/gi;
// Тег Hearthtide: <!-- HT date=YYYY-MM-DD | time=HH:MM | when=DATE_TEXT -->
const HT_TAG = /<!--\s*HT\s+([^>]*?)-->/gi;
// То, от чего в тексте остаётся только мусор: картинки (вместе с промптом в атрибутах), медиа, вставки
const MEDIA = 'img, picture, video, audio, iframe, svg, canvas, object, embed, style, script';

function sub(text) {
    try { return ctx().substituteParams(String(text || '')); } catch { return String(text || ''); }
}

function htFields(body) {
    const fields = {};
    for (const part of String(body || '').split('|')) {
        const eq = part.indexOf('=');
        if (eq > 0) fields[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
    }
    return fields;
}

function htText(fields) {
    return [fields.when || fields.date, fields.time].filter(Boolean).join(', ').replace(/\s+/g, ' ').slice(0, 40);
}

/**
 * Чистый текст сообщения — целиком, без обрезки. Убираем рассуждения, картинки с их обёртками и разметку.
 * Тег даты Hearthtide не теряется: он превращается в строку «[дата, время]».
 * Разбор — через сам браузер, а не регуляркой: в промпте картинки внутри атрибута может встретиться «>»,
 * и регулярка на этом оставила бы в тексте хвост промпта.
 */
export function cleanMessage(text) {
    const source = String(text || '')
        .replace(HIDDEN_BLOCKS, ' ')
        .replace(HT_TAG, (_, body) => {
            const date = htText(htFields(body));
            return date ? `\n[${date}]\n` : ' ';
        });
    let plain;
    try {
        const box = document.createElement('template'); // в template картинки не грузятся и скрипты не запускаются
        box.innerHTML = source;
        box.content.querySelectorAll(MEDIA).forEach((el) => el.remove());
        box.content.querySelectorAll('br').forEach((el) => el.replaceWith('\n'));
        box.content.querySelectorAll('div, p, li, tr, h1, h2, h3, h4, blockquote').forEach((el) => el.append('\n'));
        plain = box.content.textContent;
    } catch {
        plain = source.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
    }
    return plain
        .replace(/[ \t\u00a0]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

/** Персонажи текущего чата (в групповом — все участники). */
function chatCharacters() {
    const c = ctx();
    if (c.groupId) {
        const group = (c.groups || []).find((g) => String(g.id) === String(c.groupId));
        const members = new Set(group?.members || []);
        return (c.characters || []).filter((ch) => members.has(ch.avatar));
    }
    const ch = c.characters?.[c.characterId];
    return ch ? [ch] : [];
}

export function characterNames() {
    return chatCharacters().map((ch) => String(ch.name || '').trim()).filter(Boolean);
}

export function personaName() {
    return String(ctx().name1 || '').trim();
}

/** Справка о мире для судьи. */
export function background() {
    const c = ctx();
    const bg = [];
    for (const ch of chatCharacters()) {
        if (ch.name) bg.push(`Character: ${ch.name}`);
        const description = sub(ch.description || ch.data?.description).trim();
        if (description) bg.push(`Description: ${description}`);
        const scenario = sub(ch.scenario || ch.data?.scenario).trim();
        if (scenario) bg.push(`Scenario: ${scenario}`);
    }
    const persona = personaName();
    if (persona) bg.push(`Player character: ${persona}`);
    const personaText = sub(c.powerUserSettings?.persona_description).trim();
    if (personaText) bg.push(`Player persona: ${personaText}`);
    return bg.join('\n');
}

/** Последние видимые сообщения чата: [{ index, name, text, raw }]. */
function visibleTail(depth) {
    const chat = Array.isArray(ctx().chat) ? ctx().chat : [];
    const out = [];
    for (let i = chat.length - 1; i >= 0 && out.length < depth; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue; // скрытые и служебные судья не читает
        out.unshift({ index: i, name: m.name || (m.is_user ? personaName() : 'Character'), raw: String(m.mes || '') });
    }
    return out;
}

/** Кусок переписки для судьи: последние сообщения целиком, между ними пустая строка. */
export function transcript(depth) {
    return visibleTail(depth)
        .map((m) => ({ name: m.name, text: cleanMessage(m.raw) }))
        .filter((m) => m.text)
        .map((m) => `${m.name}:\n${m.text}`)
        .join('\n\n');
}

/** Игровая дата из последнего тега Hearthtide в прочитанных сообщениях ('' — тегов нет). */
export function hearthtideDate(depth) {
    const tail = visibleTail(depth);
    for (let i = tail.length - 1; i >= 0; i--) {
        const tags = [...tail[i].raw.matchAll(HT_TAG)];
        for (let j = tags.length - 1; j >= 0; j--) {
            const text = htText(htFields(tags[j][1]));
            if (text) return text;
        }
    }
    return '';
}

/** Память судьи: лорбук, привязанный к чату, целиком (без активации по ключам). Последние записи важнее. */
export async function loreMemory() {
    if (!getSettings().memChat) return '';
    const c = ctx();
    const name = c.chatMetadata?.world_info;
    if (!name) return '';
    try {
        const book = await c.loadWorldInfo?.(name);
        const entries = book?.entries && typeof book.entries === 'object' ? Object.values(book.entries) : [];
        const text = entries
            .filter((e) => !e?.disable && String(e?.content || '').trim())
            .sort((a, b) => (a.displayIndex ?? a.uid ?? 0) - (b.displayIndex ?? b.uid ?? 0))
            .map((e) => {
                const title = String(e.comment || '').trim();
                const content = String(e.content).trim();
                return title ? `${title}: ${content}` : content;
            })
            .join('\n');
        return text.length > MEM_CAP ? `…${text.slice(-MEM_CAP)}` : text;
    } catch (error) {
        console.warn(`[Thread] не удалось прочитать лорбук "${name}"`, error);
        return '';
    }
}

/** Отпечаток сообщения, чтобы понять, что его не подменили, пока судья думал (как якорь в оригинале). */
export function anchorAt(index) {
    const m = ctx().chat?.[index];
    if (!m) return null;
    const t = cleanMessage(m.mes).replace(/\s+/g, ' ');
    if (t.length <= 160) return { snip: t };
    const mid = Math.floor(t.length / 2);
    return { snip: t.slice(mid - 60, mid + 60) };
}

export function anchorHolds(anchor, index) {
    if (!anchor) return true;
    const m = ctx().chat?.[index];
    if (!m) return false;
    return cleanMessage(m.mes).replace(/\s+/g, ' ').includes(anchor.snip);
}
