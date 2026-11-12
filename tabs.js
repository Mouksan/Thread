// Thread — содержимое вкладок окна и их кнопки (✕ записи, ✓ обещания, вернуть метку…).
// Раскладка — по Storyline; вид — стекло на цветах темы таверны.

import { ctx, getSettings, clampInt, escapeHtml, modeOf, repNow, repLevel, relLevel } from './store.js';
import {
    skillList, skillVal, relVal, signed, activeFlags, openQuests, achTitle, sameName, LINK_LABELS,
} from './judge.js';
import { markLineHtml } from './toasts.js';
import { achIcon, RARITY_LABELS, JUDGE_ACH, COUNTER_ACH, ACH_HINTS } from './ach.js';

const RARITY_ORDER = { legendary: 0, rare: 1, common: 2 };

function emptyHtml(text) {
    return `<div class="thr-empty">${escapeHtml(text)}</div>`;
}

function totalNow() {
    return Array.isArray(ctx().chat) ? ctx().chat.length : 0;
}

function tone(v) {
    return v > 0 ? 'thr-up' : v < 0 ? 'thr-down' : '';
}

/**
 * Мини-график из истории [[номер сообщения, значение], …].
 * min/max — пределы шкалы; mid — линия нуля (для отношений).
 */
function spark(hist, min, max, mid = null) {
    const pts = (Array.isArray(hist) ? hist : []).filter((p) => Array.isArray(p) && p.length === 2);
    if (pts.length < 2) return '';
    const x0 = pts[0][0];
    const x1 = pts[pts.length - 1][0];
    const w = Math.max(1, x1 - x0);
    const X = (x) => (((x - x0) / w) * 100).toFixed(2);
    const Y = (y) => (((max - y) / (max - min)) * 30 + 2).toFixed(2);
    const line = pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ');
    const zero = mid !== null ? `<line x1="0" x2="100" y1="${Y(mid)}" y2="${Y(mid)}" class="thr-spark-zero" />` : '';
    return `<svg class="thr-spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">${zero}<polyline points="${line}" /></svg>`;
}

function chapterNum(total) {
    return Math.max(1, Math.floor(total / 25) + 1);
}

// ---------- Обзор ----------

export function overviewHtml(st, busy) {
    const total = totalNow();
    const rep = repNow(st);
    let progress = `сообщений в чате: ${total} · оценок ещё не было`;
    if (st.touched) {
        const settings = getSettings();
        const left = Math.max(0, clampInt(settings.everyN, 2, 50, 3) - (total - st.count));
        const next = !settings.auto ? 'авто выключено'
            : st.rerollWait != null && total <= st.rerollWait ? 'после отката жду новое сообщение'
                : left ? `следующая оценка через ${left} сообщ.` : 'следующая оценка — после ответа бота';
        progress = `оценено до сообщения ${st.count} из ${total} · ${next}`;
    }
    const head = [`Глава ${chapterNum(total)}`];
    if (st.sdate?.text) head.push(`📅 ${escapeHtml(st.sdate.text)}`);
    head.push(`${total} ✉`);

    const repCard = modeOf('rep') === 'on' ? `
        <div class="thr-card">
            <div class="thr-card-head"><span>Репутация</span><b>${rep}<small> / 100</small></b></div>
            <div class="thr-bar"><i style="width:${rep}%"></i></div>
            <div class="thr-card-foot"><span class="thr-note">${escapeHtml(repLevel(rep))}</span></div>
            ${spark(st.repHist, 0, 100)}
        </div>` : '';

    const feed = st.log.filter((e) => e.count <= total).slice(-5).reverse();
    const feedHtml = feed.length ? `
        <div class="thr-sec">Последние события</div>
        <div class="thr-feed">${feed.map((e) => `
            <div class="thr-feed-row">
                <div class="thr-feed-main">${markLineHtml(e)}${e.sd ? `<div class="thr-note">${escapeHtml(e.sd)}</div>` : ''}</div>
                <button class="thr-x" type="button" data-act="dellog" data-id="${escapeHtml(e.id || '')}" title="Убрать запись" aria-label="Убрать запись"><i class="fa-solid fa-xmark"></i></button>
            </div>`).join('')}
        </div>` : '';

    return `
        <div class="thr-chapter">${head.join(' · ')}</div>
        ${busy ? '<div class="thr-hint">Судья листает страницы…</div>' : ''}
        ${repCard}
        ${st.touched ? '' : '<div class="thr-hint">Судья ещё не смотрел эту историю. Нажми ⟳ в шапке — он поставит первые отметки по последним сообщениям. Для длинной истории сначала поставь в настройках глубину 80 и включи память судьи.</div>'}
        ${feedHtml}
        <div class="thr-note thr-progress">${escapeHtml(progress)}</div>`;
}

// ---------- Отношения ----------

function avatarFor(name) {
    const c = ctx();
    const ch = (c.characters || []).find((x) => x?.name && sameName(x.name, name));
    if (!ch?.avatar) return '';
    try {
        if (typeof c.getThumbnailUrl === 'function') return c.getThumbnailUrl('avatar', ch.avatar);
    } catch { /* ниже — запасной путь */ }
    return `/thumbnail?type=avatar&file=${encodeURIComponent(ch.avatar)}`;
}

function initials(name) {
    return escapeHtml(String(name || '?').trim().charAt(0).toUpperCase() || '?');
}

function factsHtml(st, name) {
    if (modeOf('facts') !== 'on') return '';
    const facts = (st.facts?.[name] || []).map((f, i) => [f, i]);
    if (!facts.length) return '';
    const row = ([f, i]) => `
        <li><span>${f.s ? '<i class="fa-solid fa-user-secret" title="Секрет"></i> ' : ''}${escapeHtml(f.t)}</span>
            <button class="thr-x" type="button" data-act="rmfact" data-name="${escapeHtml(name)}" data-i="${i}" title="Убрать запись" aria-label="Убрать запись"><i class="fa-solid fa-xmark"></i></button></li>`;
    return `<ul class="thr-facts">${facts.map(row).join('')}</ul>`;
}

export function relsHtml(st) {
    const names = Object.keys(st.rels).sort((a, b) => relVal(st, b) - relVal(st, a));
    if (!names.length) return emptyHtml('Пока никого — судья запишет персонажей, когда посмотрит историю.');
    const cards = names.map((n) => {
        const v = relVal(st, n);
        const av = avatarFor(n);
        return `
            <div class="thr-card thr-rel">
                <div class="thr-rel-head">
                    ${av ? `<img class="thr-ava" src="${escapeHtml(av)}" alt="" loading="lazy" />` : `<div class="thr-ava thr-ava-empty">${initials(n)}</div>`}
                    <div class="thr-rel-name"><b>${escapeHtml(n)}</b><span class="thr-note">${escapeHtml(relLevel(v))}</span></div>
                    <b class="thr-rel-val ${tone(v)}">${signed(v)}</b>
                </div>
                <div class="thr-bar thr-bar-mid"><i style="${v >= 0 ? `left:50%;width:${v / 2}%` : `right:50%;width:${-v / 2}%`}"></i></div>
                ${spark(st.relHist?.[n], -100, 100, 0)}
                ${factsHtml(st, n)}
            </div>`;
    }).join('');

    const pairs = Object.entries(st.pairs || {}).filter(([, p]) => p).sort(([, a], [, b]) => Math.abs(b.v || 0) - Math.abs(a.v || 0));
    const links = pairs.length ? `<div class="thr-sec">Связи между персонажами</div>${pairs.map(([, p]) => {
        const types = Object.keys(p.types || {}).map((t) => LINK_LABELS[t] || t);
        return `
            <div class="thr-row">
                <div><b>${escapeHtml(p.a)} — ${escapeHtml(p.b)}</b> ${types.map((t) => `<span class="thr-chip">${escapeHtml(t)}</span>`).join(' ')}
                    ${p.note ? `<div class="thr-note">${escapeHtml(p.note)}</div>` : ''}</div>
                <b class="${tone(p.v || 0)}">${signed(p.v || 0)}</b>
            </div>`;
    }).join('')}` : '';
    return cards + links;
}

// ---------- Навыки ----------

export function skillsHtml(st) {
    const list = skillList(st).slice().sort((a, b) => skillVal(st, b.name.toLowerCase()) - skillVal(st, a.name.toLowerCase()));
    if (!list.length) return emptyHtml('Навыков пока нет — появятся после первой оценки.');
    const check = `
        <button class="menu_button thr-wide-btn" type="button" data-act="dice">
            <i class="fa-solid fa-dice-d20"></i><span>Проверка навыка</span>
        </button>`;
    return check + list.map((e) => {
        const v = skillVal(st, e.name.toLowerCase());
        return `
            <div class="thr-card">
                <div class="thr-card-head"><span>${v >= 75 ? '<i class="fa-solid fa-star thr-star" title="Мастер"></i> ' : ''}${escapeHtml(e.name)}</span><b>${v}<small> / 100</small></b></div>
                <div class="thr-bar"><i style="width:${v}%"></i></div>
                <div class="thr-note">бонус к броску: +${Math.floor(v / 10)}</div>
            </div>`;
    }).join('');
}

// ---------- Метки и обещания ----------

export function flagsHtml(st) {
    const active = activeFlags(st);
    const gone = Object.entries(st.flags || {}).filter(([, f]) => f && !f.on)
        .sort(([, a], [, b]) => (b.at || 0) - (a.at || 0)).slice(0, 5);
    const open = Object.entries(st.quests || {}).filter(([, q]) => q && q.on).sort(([, a], [, b]) => (b.at || 0) - (a.at || 0));
    const closed = Object.entries(st.quests || {}).filter(([, q]) => q && !q.on).sort(([, a], [, b]) => (b.endAt || b.at || 0) - (a.endAt || a.at || 0)).slice(0, 5);
    const x = (act, attr, title = 'Убрать запись') => `<button class="thr-x" type="button" data-act="${act}" ${attr} title="${title}" aria-label="${title}"><i class="fa-solid fa-xmark"></i></button>`;

    const flagRows = active.length ? active.map(({ key, f }) => `
        <div class="thr-row">
            <div><b>🚩 ${escapeHtml(f.name || key)}</b>${f.note ? `<div class="thr-note">${escapeHtml(f.note)}</div>` : ''}${f.sd ? `<div class="thr-note">${escapeHtml(f.sd)}</div>` : ''}</div>
            ${x('delflag', `data-key="${escapeHtml(key)}"`, 'Убрать метку')}
        </div>`).join('') : '<div class="thr-note">пока ни одной метки</div>';
    const goneRows = gone.length ? `<div class="thr-sub">Снятые</div>${gone.map(([key, f]) => `
        <div class="thr-row thr-faded">
            <div><b>🌘 ${escapeHtml(f.name || key)}</b>${f.note ? `<div class="thr-note">${escapeHtml(f.note)}</div>` : ''}</div>
            <div class="thr-row-btns">
                <button class="thr-x" type="button" data-act="reflag" data-key="${escapeHtml(key)}" title="Вернуть метку" aria-label="Вернуть метку"><i class="fa-solid fa-rotate-left"></i></button>
                ${x('delflag', `data-key="${escapeHtml(key)}"`)}
            </div>
        </div>`).join('')}` : '';

    const qRows = open.length ? open.map(([k, q]) => `
        <div class="thr-row">
            <div><b>📜 ${escapeHtml(q.name)}</b>${q.note ? `<div class="thr-note">${escapeHtml(q.note)}</div>` : ''}${q.sd ? `<div class="thr-note">${escapeHtml(q.sd)}</div>` : ''}</div>
            <div class="thr-row-btns">
                <button class="thr-x thr-ok" type="button" data-act="qdone" data-k="${escapeHtml(k)}" title="Выполнено" aria-label="Выполнено"><i class="fa-solid fa-check"></i></button>
                ${x('qrm', `data-k="${escapeHtml(k)}"`)}
            </div>
        </div>`).join('') : '<div class="thr-note">открытых обещаний нет — судья заметит, когда кто-то что-то пообещает</div>';
    const doneRows = closed.length ? `<div class="thr-sub">Закрытые</div>${closed.map(([k, q]) => `
        <div class="thr-row thr-faded">
            <div><b>✔️ ${escapeHtml(q.name)}</b>${q.end ? `<div class="thr-note">${escapeHtml(q.end)}</div>` : ''}</div>
            ${x('qrm', `data-k="${escapeHtml(k)}"`)}
        </div>`).join('')}` : '';

    return `
        <div class="thr-sec">Метки сюжета</div>
        ${flagRows}${goneRows}
        <div class="thr-sec">Обещания и цели</div>
        ${qRows}${doneRows}`;
}

// ---------- Ачивки ----------

export function achHtml(st) {
    const got = Object.values(st.ach).filter(Boolean)
        .sort((a, b) => (RARITY_ORDER[a.rarity] ?? 3) - (RARITY_ORDER[b.rarity] ?? 3) || (b.at || 0) - (a.at || 0));
    const builtin = { ...JUDGE_ACH, ...COUNTER_ACH };
    const sealed = Object.keys(builtin).filter((slug) => !st.ach[slug])
        .sort((a, b) => (RARITY_ORDER[builtin[a]] ?? 3) - (RARITY_ORDER[builtin[b]] ?? 3));
    const gotBuiltin = Object.keys(builtin).length - sealed.length;

    const cards = got.map((a) => `
        <div class="thr-ach thr-rar-${a.rarity || 'common'}">
            <div class="thr-ach-ico">${achIcon(a.rarity)}</div>
            <div class="thr-ach-body">
                <b>${escapeHtml(achTitle(a))}</b>
                <span class="thr-ach-rar">${RARITY_LABELS[a.rarity] || ''}${a.slug ? '' : ' · придумал судья'}</span>
                ${a.note ? `<span class="thr-note">${escapeHtml(a.note)}</span>` : ''}
                ${a.sd ? `<span class="thr-note">${escapeHtml(a.sd)}</span>` : ''}
            </div>
        </div>`).join('');
    const locked = sealed.map((slug) => `
        <div class="thr-ach thr-sealed thr-rar-${builtin[slug]}" title="${escapeHtml(RARITY_LABELS[builtin[slug]] || '')}">
            <div class="thr-ach-ico"><i class="fa-solid fa-lock"></i></div>
            <div class="thr-ach-body"><span>${escapeHtml(ACH_HINTS[slug] || '???')}</span></div>
        </div>`).join('');

    return `
        <div class="thr-note thr-progress">открыто встроенных: ${gotBuiltin} из ${Object.keys(builtin).length}${got.length > gotBuiltin ? ` · своих от судьи: ${got.length - gotBuiltin}` : ''}</div>
        ${got.length ? `<div class="thr-ach-grid">${cards}</div>` : emptyHtml('Пока ни одной — судья следит.')}
        ${locked ? `<div class="thr-sec">Ещё не открыты</div><div class="thr-ach-grid">${locked}</div>` : ''}`;
}

// ---------- Кнопки во вкладках ----------

/** Обработка кнопок. Возвращает true, если данные чата изменились (нужно сохранить). */
export function handleTabAction(st, btn) {
    const act = btn.dataset.act;
    if (act === 'dellog') {
        const i = st.log.findIndex((e) => e && e.id === btn.dataset.id);
        if (i < 0) return false;
        const e = st.log[i];
        // Метку из ленты убираем совсем — вместе с её записями (как в оригинале)
        if (e.kind === 'MARK' && e.target) {
            const key = String(e.target).toLowerCase();
            delete st.flags[key];
            st.log = st.log.filter((l) => !(l.kind === 'MARK' && String(l.target).toLowerCase() === key));
        } else {
            st.log.splice(i, 1);
        }
        return true;
    }
    if (act === 'delflag') {
        const key = btn.dataset.key;
        if (!st.flags[key]) return false;
        delete st.flags[key];
        st.log = st.log.filter((l) => !(l.kind === 'MARK' && String(l.target).toLowerCase() === String(key).toLowerCase()));
        return true;
    }
    if (act === 'reflag') {
        const f = st.flags[btn.dataset.key];
        if (!f) return false;
        f.on = true;
        f.at = Date.now();
        return true;
    }
    if (act === 'qdone' || act === 'qrm') {
        const q = st.quests[btn.dataset.k];
        if (!q) return false;
        if (act === 'qrm') delete st.quests[btn.dataset.k];
        else Object.assign(q, { on: false, end: 'закрыто вручную', endAt: Date.now() });
        return true;
    }
    if (act === 'rmfact') {
        const list = st.facts?.[btn.dataset.name];
        const i = parseInt(btn.dataset.i, 10);
        if (!Array.isArray(list) || !list[i]) return false;
        list.splice(i, 1);
        if (!list.length) delete st.facts[btn.dataset.name];
        return true;
    }
    return false;
}
