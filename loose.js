// Thread — вкладка «Метки»: блоки «Висящие нити» и «Тайны» (кто что знает), их кнопки,
// а также напоминание боту о давних нитях.

import { ctx, escapeHtml, modeOf, modOn, getSettings, plural } from './store.js';
import { openThreads } from './judge.js';
import { ME, whoLabel, secretList, addKnower } from './secrets.js';

/** Сколько сообщений нить должна провисеть, чтобы бот получил напоминание. */
export const NUDGE_AFTER = 40;

const MSG = ['сообщение', 'сообщения', 'сообщений'];
const low = (s) => String(s || '').toLowerCase();

function chatLength() {
    return Array.isArray(ctx().chat) ? ctx().chat.length : 0;
}

const xBtn = (act, attrs, title) => `<button class="thr-x" type="button" data-act="${act}" ${attrs} title="${title}" aria-label="${title}"><i class="fa-solid fa-xmark"></i></button>`;
const ico = (name) => `<i class="fa-solid ${name} fa-fw thr-mark-ico" aria-hidden="true"></i>`;

// ---------- Висящие нити ----------

export function threadsHtml(st) {
    if (modeOf('threads') !== 'on') return '';
    const total = chatLength();
    const all = Object.entries(st.threads || {}).filter(([, t]) => t);
    const open = all.filter(([, t]) => t.on).sort(([, a], [, b]) => (a.count || 0) - (b.count || 0)); // давние — сверху
    const closed = all.filter(([, t]) => !t.on).sort(([, a], [, b]) => (b.endAt || b.at || 0) - (a.endAt || a.at || 0)).slice(0, 10);

    const openRows = open.length ? open.map(([k, t]) => {
        const hang = Math.max(0, total - (t.count || total));
        const meta = [hang ? `висит ${plural(hang, MSG)}` : 'только что', t.sd ? `с ${escapeHtml(t.sd)}` : ''].filter(Boolean).join(' · ');
        return `
        <div class="thr-row">
            <div><b>${ico('fa-circle-question')}${escapeHtml(t.name)}</b>${t.note ? `<div class="thr-note">${escapeHtml(t.note)}</div>` : ''}<div class="thr-note">${meta}</div></div>
            <div class="thr-row-btns">
                <button class="thr-x thr-ok" type="button" data-act="thrclose" data-k="${escapeHtml(k)}" title="Нить закрыта" aria-label="Нить закрыта"><i class="fa-solid fa-check"></i></button>
                ${xBtn('thrrm', `data-k="${escapeHtml(k)}"`, 'Убрать')}
            </div>
        </div>`;
    }).join('') : '<div class="thr-note">Висящих нитей нет — судья отметит, если сюжет что-то оставит без ответа</div>';

    const closedRows = closed.length ? `
        <details class="thr-details">
            <summary>Закрытые нити (${closed.length})</summary>
            ${closed.map(([k, t]) => `
            <div class="thr-row thr-faded">
                <div><b>${ico('fa-circle-check')}${escapeHtml(t.name)}</b>${t.end ? `<div class="thr-note">${escapeHtml(t.end)}</div>` : ''}</div>
                <div class="thr-row-btns">
                    <button class="thr-x" type="button" data-act="thrback" data-k="${escapeHtml(k)}" title="Вернуть в открытые" aria-label="Вернуть в открытые"><i class="fa-solid fa-rotate-left"></i></button>
                    ${xBtn('thrrm', `data-k="${escapeHtml(k)}"`, 'Убрать')}
                </div>
            </div>`).join('')}
        </details>` : '';

    return `<div class="thr-sec">Висящие нити</div>${openRows}${closedRows}`;
}

// ---------- Тайны ----------

/** «Знают: …» для окна. */
export function knowersText(f, holder) {
    if (f.pub) return 'известно всем';
    const k = (f.k || []).map(whoLabel);
    if (k.length) return `знают: ${k.join(', ')}`;
    return holder === ME ? 'знаешь только ты' : 'знает только сам';
}

export function secretsHtml(st) {
    if (modeOf('knows') !== 'on') return '';
    const list = secretList(st);
    if (!list.length) return `<div class="thr-sec">Тайны</div><div class="thr-note">Тайн пока нет — судья запишет, когда кто-то что-то скроет</div>`;
    const people = Object.keys(st.rels || {}).sort((a, b) => a.localeCompare(b, 'ru'));
    const rows = list.map(({ holder, f }) => {
        const i = (st.facts[holder] || []).indexOf(f);
        const id = `data-h="${escapeHtml(holder)}" data-i="${i}"`;
        const chips = (f.k || []).map((n) => `<span class="thr-chip thr-know-chip">${escapeHtml(whoLabel(n))}<button class="thr-x" type="button" data-act="knowrm" ${id} data-n="${escapeHtml(n)}" title="Не знает" aria-label="${escapeHtml(whoLabel(n))} не знает"><i class="fa-solid fa-xmark"></i></button></span>`).join('');
        const can = [ME, ...people].filter((n) => low(n) !== low(holder) && !(f.k || []).some((x) => low(x) === low(n)));
        const add = f.pub ? '' : `
            <select class="text_pole thr-know-add" ${id} aria-label="Кто ещё знает">
                <option value="">+ кто ещё знает</option>
                ${can.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n === ME ? `Ты (${whoLabel(ME)})` : n)}</option>`).join('')}
                <option value="__all">Все — тайна раскрыта</option>
            </select>`;
        return `
        <div class="thr-row ${f.pub ? 'thr-faded' : ''}">
            <div class="thr-secret">
                <div>${ico('fa-user-secret')}<b>${escapeHtml(whoLabel(holder))}</b> скрывает: ${escapeHtml(f.t)}</div>
                <div class="thr-know-line"><span class="thr-note">${f.pub ? 'Известно всем' : (f.k || []).length ? 'Знают:' : escapeHtml(knowersText(f, holder).replace(/^./, (c) => c.toUpperCase()))}</span>${f.pub ? '' : chips}${add}</div>
            </div>
            <div class="thr-row-btns">
                ${f.pub ? `<button class="thr-x" type="button" data-act="knowhide" ${id} title="Снова тайна" aria-label="Снова тайна"><i class="fa-solid fa-rotate-left"></i></button>` : ''}
                ${xBtn('secrm', id, 'Убрать тайну')}
            </div>
        </div>`;
    }).join('');
    return `<div class="thr-sec">Тайны</div>${rows}`;
}

// ---------- Кнопки ----------

/**
 * Та же правка — в живом состоянии, в снимках отката и в «вернувшихся» оценках:
 * ручная правка переживает свайпы, как и переименование.
 */
function everywhere(st, fn) {
    fn(st);
    for (const snap of Array.isArray(st.snaps) ? st.snaps : []) if (snap?.data) fn(snap.data);
    for (const r of Array.isArray(st.redo) ? st.redo : []) if (r?.after) fn(r.after);
}

function secretAt(data, holder, text) {
    return (data?.facts?.[holder] || []).find((f) => f && f.s && f.t === text) || null;
}

/** Кнопки блоков. true — данные чата изменились; false — не наше. */
export function handleLooseAction(st, btn) {
    const act = btn.dataset.act;
    if (act === 'thrclose' || act === 'thrrm' || act === 'thrback') {
        const k = btn.dataset.k;
        if (!st.threads?.[k]) return false;
        everywhere(st, (d) => {
            const t = d.threads?.[k];
            if (!t) return;
            if (act === 'thrrm') delete d.threads[k];
            else if (act === 'thrclose') Object.assign(t, { on: false, end: 'закрыто вручную', endAt: Date.now() });
            else { t.on = true; delete t.end; delete t.endAt; }
        });
        return true;
    }
    if (act === 'secrm' || act === 'knowrm' || act === 'knowhide') {
        const holder = btn.dataset.h;
        const f = st.facts?.[holder]?.[parseInt(btn.dataset.i, 10)];
        if (!f || !f.s) return false;
        const text = f.t;
        everywhere(st, (d) => {
            const sf = secretAt(d, holder, text);
            if (!sf) return;
            if (act === 'secrm') {
                d.facts[holder] = d.facts[holder].filter((x) => x !== sf);
                if (!d.facts[holder].length) delete d.facts[holder];
            } else if (act === 'knowrm') sf.k = (sf.k || []).filter((n) => n !== btn.dataset.n);
            else delete sf.pub;
        });
        return true;
    }
    return false;
}

/** Выпадашка «+ кто ещё знает». true — данные изменились (сохранить и перерисовать). */
export function handleKnowSelect(st, el) {
    if (!el?.classList?.contains('thr-know-add') || !el.value) return false;
    const holder = el.dataset.h;
    const f = st.facts?.[holder]?.[parseInt(el.dataset.i, 10)];
    if (!f || !f.s) return false;
    const who = el.value;
    const text = f.t;
    everywhere(st, (d) => {
        const sf = secretAt(d, holder, text);
        if (!sf) return;
        if (who === '__all') sf.pub = true;
        else addKnower(sf, who);
    });
    return true;
}

// ---------- Напоминание боту ----------

/** Строка для записки боту о самой давней нити (пусто — нечего напоминать). */
export function threadNudge(st) {
    if (!modOn('threads') || !getSettings().threadNudge) return '';
    const total = chatLength();
    const old = openThreads(st).filter((t) => total - (t.count || total) >= NUDGE_AFTER)
        .sort((a, b) => (a.count || 0) - (b.count || 0))[0];
    if (!old) return '';
    return `an old loose thread the story left hanging (${old.name}${old.note ? ` — ${old.note}` : ''}): the story may return to it when it fits naturally; never force it`;
}
