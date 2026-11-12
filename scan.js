// Thread — скан всей истории пачками. Своя часть Thread (в Storyline такого нет).
// История режется на пачки по N сообщений (настройка 30–80), судья читает их по очереди с самого начала,
// после каждой пачки статы обновляются. Скрытые сообщения тоже читаются. Память судьи на время скана
// выключена: сводки знают будущее. Перед стартом — бэкап, скан можно отменить.
// Ошибка или «Стоп» — пауза: продолжаем с той же пачки, прогресс живёт в метаданных чата.

import { ctx, getSettings, getState, saveState, currentChatId, emptyState, clampInt } from './store.js';
import { systemPrompt, userPrompt, parse, parseDate, applyRow, ensureSkills, SCAN_LIMITS } from './judge.js';
import { background, transcriptRange, hearthtideDateRange, characterNames, personaName } from './context.js';
import { requestJudge } from './connection.js';
import { snapTake } from './state.js';
import { checkMilestones } from './milestones.js';
import { achIcon } from './ach.js';

const CHAPTER_EVERY = 25;   // при скане главы ставятся автоматически
const RARITY_ORDER = { legendary: 0, rare: 1, common: 2 };

let running = false;
let stopAsked = false;
let hooks = { render() {}, showNote() {}, showAch() {}, onError() {}, explain: (m) => m };

export function setScanHooks(h) {
    hooks = { ...hooks, ...h };
}

export function scanRunning() {
    return running;
}

/** Идёт скан или он стоит на паузе — авто и ⟳ в это время молчат. */
export function scanBlocks(st) {
    return running || Boolean(st?.scan && !st.scan.done);
}

export function scanSize() {
    return clampInt(getSettings().scanSize, 30, 80, 50);
}

/** Границы пачек: хвост меньше трети пачки приклеивается к последней. */
export function scanBatches(total, size = scanSize()) {
    const out = [];
    for (let from = 0; from < total; from += size) out.push([from, Math.min(total, from + size)]);
    if (out.length > 1 && out[out.length - 1][1] - out[out.length - 1][0] < size / 3) {
        const tail = out.pop();
        out[out.length - 1][1] = tail[1];
    }
    return out;
}

/** Начать скан с чистого листа. Старое состояние — в бэкап. */
export async function startScan() {
    const st = getState();
    if (!st || running) return;
    const total = Array.isArray(ctx().chat) ? ctx().chat.length : 0;
    if (!total) return;

    const { scanBackup: _old, scan: _oldScan, ...rest } = st;
    const backup = structuredClone(rest);
    const avatars = structuredClone(st.avatars || {});
    for (const key of Object.keys(st)) delete st[key];
    Object.assign(st, emptyState(), { avatars, scanBackup: backup });
    st.chapters = [{ start: 0, title: '' }];
    for (let b = CHAPTER_EVERY; b < total; b += CHAPTER_EVERY) st.chapters.push({ start: b, title: '' });
    const batches = scanBatches(total);
    st.scan = { total, batches, next: 0, rows: 0, ach: [], error: '', done: false, startedAt: Date.now() };
    await saveState();
    await runScan();
}

export async function resumeScan() {
    const st = getState();
    if (!st?.scan || st.scan.done || running) return;
    st.scan.error = '';
    await runScan();
}

export function stopScan() {
    if (running) stopAsked = true;
}

/** Вернуть всё как было до скана. */
export async function undoScan() {
    const st = getState();
    if (!st?.scanBackup || running) return;
    const backup = structuredClone(st.scanBackup);
    const avatars = structuredClone(st.avatars || {});
    for (const key of Object.keys(st)) delete st[key];
    Object.assign(st, emptyState(), backup, { avatars: { ...(backup.avatars || {}), ...avatars } });
    await saveState();
    hooks.showNote('Скан отменён — отметки вернулись к тому, что было до него', { force: true });
    hooks.render();
}

/** Убрать плашку «История прочитана» (бэкап удаляется, отменить скан больше нельзя). */
export async function dismissScan() {
    const st = getState();
    if (!st || running) return;
    delete st.scanBackup;
    delete st.scan;
    await saveState();
    hooks.render();
}

async function runScan() {
    const chatId = currentChatId();
    running = true;
    stopAsked = false;
    hooks.render();
    try {
        for (;;) {
            const st = getState();
            if (!st?.scan || currentChatId() !== chatId) return;
            const sc = st.scan;
            if (sc.next >= sc.batches.length) break;
            if (stopAsked) {
                sc.error = '';
                sc.paused = true;
                await saveState();
                return;
            }
            sc.paused = false;
            const [from, to] = sc.batches[sc.next];
            ensureSkills(st);

            const date = hearthtideDateRange(from, to);
            const system = systemPrompt({ hasDate: Boolean(date), scan: true });
            const user = userPrompt(st, { bg: background(), memory: '', date }, transcriptRange(from, to), { from, to, total: sc.total });
            let raw;
            try {
                raw = await requestJudge({ system, user });
                if (!raw.trim()) throw new Error('Empty reply');
            } catch (error) {
                const message = String(error?.message || error || 'Unknown error').slice(0, 300);
                const now = getState();
                if (now?.scan) {
                    now.scan.error = message;
                    now.scan.paused = true;
                    await saveState();
                }
                hooks.onError(message);
                return;
            }
            if (currentChatId() !== chatId) return; // чат сменили — прогресс останется в том чате

            const now = getState();
            const rows = parse(raw, SCAN_LIMITS);
            const sd = date || parseDate(raw);
            const evId = `S${Date.now().toString(36)}`;
            snapTake(now, now.count, to, evId);
            if (sd) now.sdate = { text: sd, at: Date.now() };
            const env = { total: to, sd: now.sdate?.text || '', chars: characterNames(), persona: personaName(), ev: evId };
            const applied = rows.filter((r) => applyRow(now, r, env));
            now.count = to;
            now.touched = true;
            if (!now.firstAt) now.firstAt = Date.now();
            now.scan.rows += applied.length;
            for (const r of applied) if (r.kind === 'ACH') now.scan.ach.push({ title: r.title, rarity: r.rarity, note: r.note });
            now.scan.next++;
            await saveState();
            hooks.render();
        }

        // Готово
        const st = getState();
        const sc = st.scan;
        const counters = checkMilestones(st);
        for (const a of counters) sc.ach.push({ title: a.title, rarity: a.rarity, note: a.note });
        sc.done = true;
        sc.paused = false;
        st.rerollWait = null;
        await saveState();
        const top = sc.ach.slice().sort((a, b) => (RARITY_ORDER[a.rarity] ?? 3) - (RARITY_ORDER[b.rarity] ?? 3));
        hooks.showNote(`История прочитана: ${sc.total} сообщений, пачек — ${sc.batches.length}. Отметок: ${sc.rows}, ачивок: ${sc.ach.length}.`, { force: true });
        hooks.showAch(top.slice(0, 2));
    } finally {
        running = false;
        stopAsked = false;
        hooks.render();
    }
}

/** Плашка скана для Обзора ('' — показывать нечего). */
export function scanCardHtml(st, escapeHtml) {
    const sc = st?.scan;
    if (!sc) return '';
    const n = sc.batches.length;
    const pct = Math.round((sc.next / n) * 100);
    const bar = `<div class="thr-bar"><i style="width:${pct}%"></i></div>`;
    if (running) {
        const [from, to] = sc.batches[Math.min(sc.next, n - 1)];
        return `
            <div class="thr-card thr-scan">
                <div class="thr-card-head"><span><i class="fa-solid fa-book-open"></i> Читаю историю…</span><b>${sc.next + 1}<small> / ${n}</small></b></div>
                ${bar}
                <div class="thr-note">пачка ${sc.next + 1} из ${n} · сообщения ${from + 1}–${to} из ${sc.total}${stopAsked ? ' · остановлюсь после этой пачки' : ''}</div>
                <button class="menu_button thr-wide-btn" type="button" data-act="scanstop" ${stopAsked ? 'disabled' : ''}><i class="fa-solid fa-pause"></i><span>Стоп</span></button>
            </div>`;
    }
    if (!sc.done) {
        return `
            <div class="thr-card thr-scan">
                <div class="thr-card-head"><span><i class="fa-solid fa-book-open"></i> Скан на паузе</span><b>${sc.next}<small> / ${n}</small></b></div>
                ${bar}
                <div class="thr-note">прочитано пачек: ${sc.next} из ${n}. Пока скан не закончен, судья сам не оценивает.</div>
                ${sc.error ? `<div class="thr-note thr-down">${escapeHtml(hooks.explain(sc.error))} <small>${escapeHtml(sc.error)}</small></div>` : ''}
                <div class="thr-btn-row">
                    <button class="menu_button thr-wide-btn" type="button" data-act="scanresume"><i class="fa-solid fa-play"></i><span>Продолжить</span></button>
                    <button class="menu_button thr-wide-btn" type="button" data-act="scanundo"><i class="fa-solid fa-rotate-left"></i><span>Отменить скан</span></button>
                </div>
            </div>`;
    }
    const ach = sc.ach.length ? ` · ачивок: ${sc.ach.length} ${sc.ach.slice(0, 6).map((a) => achIcon(a.rarity)).join('')}` : '';
    return `
        <div class="thr-card thr-scan">
            <div class="thr-card-head"><span><i class="fa-solid fa-book"></i> История прочитана</span></div>
            <div class="thr-note">${sc.total} сообщений, пачек — ${n} · отметок: ${sc.rows}${ach}</div>
            <div class="thr-btn-row">
                <button class="menu_button thr-wide-btn" type="button" data-act="scanok"><i class="fa-solid fa-check"></i><span>Отлично</span></button>
                ${st.scanBackup ? '<button class="menu_button thr-wide-btn" type="button" data-act="scanundo"><i class="fa-solid fa-rotate-left"></i><span>Отменить скан</span></button>' : ''}
            </div>
        </div>`;
}
