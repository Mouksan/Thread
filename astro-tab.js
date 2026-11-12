// Thread — вкладка «Астро»: список людей, карточка персонажа (знак, MBTI, день), влияние на сюжет.
// Раскладка и тексты — по Storyline (astroPageHtml / astroDetailHtml / astroFxHtml).

import { getState, saveState, escapeHtml, getSettings } from './store.js';
import {
    astroState, astroPeople, astroDay, zodiacOf, daily, retroAt, retroRange, astroCalc, astroSet,
    SIGN_ICON, SIGN_RU, MBTI_TYPES, ME,
} from './astro.js';
import { ZODIAC_DATA, MBTI_DATA, AZINFO } from './astro-data.js';
import { avatarFor } from './avatars.js';

export const astroUi = { sel: null, form: false, busy: '', err: '', info: '' };

function initials(name) {
    return escapeHtml(String(name || '?').trim().charAt(0).toUpperCase() || '?');
}

function ava(st, p, cls = 'thr-ava') {
    const url = p.isMe ? '' : avatarFor(st, p.name);
    return url ? `<img class="${cls}" src="${escapeHtml(url)}" alt="" loading="lazy" />` : `<span class="${cls} thr-ava-empty">${p.isMe ? '🧵' : initials(p.name)}</span>`;
}

function profileLine(a) {
    const z = a?.d ? zodiacOf(a.d) : null;
    const parts = [];
    if (z) parts.push(`${SIGN_ICON[z]} ${SIGN_RU[z]}`);
    if (a?.mbti) parts.push(a.mbti);
    if (a?.d) parts.push(a.d);
    return parts.length ? parts.join(' · ') : 'не указано';
}

function infoBtn(k) {
    return `<button class="thr-x thr-info" type="button" data-act="azinfo" data-k="${k}" title="Как считается" aria-label="Как считается">?</button>`;
}

function infoHtml(k) {
    if (astroUi.info !== k) return '';
    const text = k === 'retro'
        ? 'Ретроградный Меркурий — период около трёх недель, 3–4 раза в год, когда планета кажется идущей назад. Даты рассчитаны по орбитам (1900–2100, точность ±1 день). Если игровая дата попадает в ретроград и включено влияние на сюжет, бот подмешивает типичные эффекты: путаницу, сбои связи и возвращение прошлого.'
        : AZINFO[k];
    return `<div class="thr-note thr-astro-info">${escapeHtml(text)}</div>`;
}

function dateUsedHtml(ad) {
    const t = ad.src === 'game'
        ? (ad.guess ? `Дата для астро: ${ad.text} — игровая (года нет, взят текущий)` : `Дата для астро: ${ad.text} — игровая`)
        : 'Дата для астро: сегодня — игровая дата пока не определена';
    return `<div class="thr-note">${escapeHtml(t)}</div>`;
}

function retroHtml(ad) {
    const r = retroAt(ad.ms);
    const chip = r ? `<span class="thr-chip ${r.on ? 'thr-rx' : ''}">${r.on ? 'ретроградный' : 'прямой'}</span>` : '';
    let body;
    if (r?.on) body = `Ретроград: ${retroRange(r.start, r.end)} · день ${r.n} из ${r.total}<div class="thr-note">Типичное: недопонимания и сбои связи, срываются планы; возвращается прошлое — пишут бывшие, всплывают старые дела.</div>`;
    else if (r) body = `Следующий ретроград: ${retroRange(r.start, r.end)} · через ${r.inDays} дн.`;
    else body = '<span class="thr-note">Для этой даты данных нет (таблица охватывает 1900–2100).</span>';
    return `<div class="thr-astro-sec">☿ Меркурий ${chip} ${infoBtn('retro')}</div>${infoHtml('retro')}<div>${body}</div>`;
}

function dailyHtml(st, key) {
    const ad = astroDay(st);
    const d = daily(key, ad.ms);
    return `
        <div class="thr-astro-sec">Фаза луны ${infoBtn('moon')}</div>${infoHtml('moon')}
        <div>${d.moon.i} <b>${escapeHtml(d.moon.n)}</b></div><div class="thr-note">${escapeHtml(d.moon.m)}</div>
        <div class="thr-astro-sec">Карта дня ${infoBtn('tarot')}</div>${infoHtml('tarot')}
        <div>🃏 <b>${escapeHtml(d.tarot.n)}</b></div><div class="thr-note">${escapeHtml(d.tarot.m)}</div>
        <div class="thr-astro-sec">Число дня ${infoBtn('num')}</div>${infoHtml('num')}
        <div>👼 <b>${escapeHtml(d.num.n)}</b> <span class="thr-note">— ${escapeHtml(d.num.m)}</span></div>
        ${retroHtml(ad)}`;
}

function formHtml(a, key) {
    const opts = [''].concat(MBTI_TYPES).map((t) => `<option value="${t}" ${t === (a?.mbti || '') ? 'selected' : ''}>${t || 'MBTI…'}</option>`).join('');
    return `
        <div class="thr-astro-form">
            ${astroUi.err ? `<div class="thr-note thr-down">${escapeHtml(astroUi.err)}</div>` : ''}
            <input class="text_pole" id="thr_az_date" type="text" placeholder="Дата: дд.мм или дд.мм.гггг" value="${escapeHtml(a?.d || '')}" />
            <select class="text_pole" id="thr_az_mbti">${opts}</select>
            <div class="thr-btn-row">
                <button class="menu_button thr-wide-btn" type="button" data-act="azsave" data-key="${escapeHtml(key)}"><span>Сохранить</span></button>
                <button class="menu_button thr-wide-btn" type="button" data-act="azdrop" data-key="${escapeHtml(key)}"><span>Убрать</span></button>
                <button class="menu_button thr-wide-btn" type="button" data-act="azcancel"><span>Отмена</span></button>
            </div>
        </div>`;
}

function detailHtml(st, p) {
    const a = astroState(st).people[p.key] || null;
    const z = a?.d ? zodiacOf(a.d) : null;
    const zd = z ? ZODIAC_DATA[z] : null;
    const md = a?.mbti ? MBTI_DATA[a.mbti] : null;
    const busy = astroUi.busy === p.key;
    return `
        <button class="menu_button thr-back" type="button" data-act="azback"><i class="fa-solid fa-arrow-left"></i><span>К списку</span></button>
        <div class="thr-astro-head">
            ${ava(st, p, 'thr-ava thr-ava-lg')}
            <div>
                <div class="thr-astro-name"><b>${escapeHtml(p.name)}</b>${p.isMe ? ' <span class="thr-note">· ты</span>' : ''}${p.isBot ? ' <span class="thr-note">· карточка</span>' : ''}</div>
                <div>${a?.d ? escapeHtml(a.d) : 'не указано'} <button class="thr-x" type="button" data-act="azedit" title="Изменить" aria-label="Изменить"><i class="fa-solid fa-pen"></i></button></div>
                ${z ? `<div>${SIGN_ICON[z]} <b>${SIGN_RU[z]}</b> <span class="thr-note">(${escapeHtml(zd.rng)})</span></div>` : ''}
                ${a?.mbti ? `<div><b>${escapeHtml(a.mbti)}</b>${md ? ` — ${escapeHtml(md.t)}` : ''}</div>` : ''}
            </div>
        </div>
        ${astroUi.form ? formHtml(a, p.key) : ''}
        ${astroUi.err && !astroUi.form ? `<div class="thr-note thr-down">${escapeHtml(astroUi.err)}</div>` : ''}
        <div class="thr-astro-sec">Знак зодиака</div>
        ${zd ? `<div class="thr-astro-text">${escapeHtml(zd.desc)}</div><div class="thr-note">Лучшая совместимость: ${escapeHtml(zd.match)}</div>` : '<div class="thr-note">не указано</div>'}
        <div class="thr-astro-sec">Тип личности</div>
        ${a?.mbti ? `<div class="thr-note">Как определился: ${a.src === 'manual' ? 'указано вручную' : 'предположено ИИ'}</div>${md ? `<div class="thr-astro-text">${escapeHtml(md.desc)}</div><div class="thr-note">Знаменитости с этим типом: ${escapeHtml(md.fam)}</div>` : ''}` : '<div class="thr-note">не указано</div>'}
        ${dailyHtml(st, p.key)}
        ${a?.src === 'manual' ? '' : `
            <button class="menu_button thr-wide-btn" type="button" data-act="azcalc" data-key="${escapeHtml(p.key)}" ${busy ? 'disabled' : ''}>
                ${busy ? '<i class="fa-solid fa-spinner fa-spin"></i><span>думаю…</span>' : `<i class="fa-solid fa-wand-magic-sparkles"></i><span>${a ? 'Пересчитать' : 'Угадать знак и MBTI'}</span>`}
            </button>`}`;
}

function fxHtml(st) {
    const f = astroState(st).fx;
    const ad = astroDay(st);
    const dis = f.on ? '' : 'disabled';
    const boxes = [['retro', '☿', 'Ретроградный Меркурий'], ['moon', '🌙', 'Фаза луны'], ['tarot', '🃏', 'Карта дня'], ['num', '👼', 'Число дня'], ['sign', '♈', 'Знаки и MBTI']]
        .map(([k, i, label]) => `<label class="checkbox_label"><input type="checkbox" data-afx="${k}" ${f[k] ? 'checked' : ''} ${dis} /> ${i} ${label}</label>`).join('');
    const freq = [['rare', 'Редко — примерно раз в 12 ответов'], ['mid', 'Иногда — примерно раз в 6 ответов'], ['often', 'Часто — примерно раз в 3 ответа']]
        .map(([k, label]) => `<option value="${k}" ${f.freq === k ? 'selected' : ''}>${label}</option>`).join('');
    return `
        <details class="thr-genre thr-astro-fx">
            <summary><b>🪐 Астро: влияние на сюжет</b> — ${f.on ? 'включено' : 'выключено'}</summary>
            ${retroHtml(ad)}
            ${dateUsedHtml(ad)}
            <label class="checkbox_label"><input type="checkbox" data-afx="on" ${f.on ? 'checked' : ''} /> <b>Влиять на сюжет</b></label>
            <div class="thr-astro-boxes ${f.on ? '' : 'thr-faded'}">${boxes}</div>
            <label class="thr-label" for="thr_az_freq">Астро-подсказки — как часто</label>
            <select id="thr_az_freq" class="text_pole" data-afxsel="freq" ${dis}>${freq}</select>
            <div class="thr-note">${getSettings().influence
                ? 'Если включено, бот получает скрытые подсказки про астро-фон игровой даты. Ретроград, луна, карта, число и знак приходят по одной и не в каждом ответе — по кругу, а не все сразу, чтобы не бросалось в глаза. Чаще остальных идёт ретроград, пока он длится. Настройка относится к этому чату.'
                : 'В настройках Thread выключено «Метки влияют на сюжет» — подсказки боту не отправляются, пока не включишь.'}</div>
        </details>`;
}

export function astroHtml(st) {
    const people = astroPeople(st);
    if (astroUi.sel) {
        const p = people.find((x) => x.key === astroUi.sel);
        if (p) return detailHtml(st, p);
        astroUi.sel = null;
    }
    const rows = people.map((p) => {
        const a = astroState(st).people[p.key] || null;
        return `
            <button class="thr-astro-row" type="button" data-act="azopen" data-key="${escapeHtml(p.key)}">
                ${ava(st, p)}
                <span class="thr-astro-row-main"><b>${escapeHtml(p.name)}</b>${p.isMe ? ' <span class="thr-note">· ты</span>' : ''}
                    <span class="thr-note">${escapeHtml(profileLine(a))}</span></span>
                <i class="fa-solid fa-chevron-right thr-note"></i>
            </button>`;
    }).join('');
    const scanBusy = astroUi.busy === '*';
    return `
        <button class="menu_button thr-wide-btn" type="button" data-act="azscan" ${scanBusy ? 'disabled' : ''}>
            ${scanBusy ? '<i class="fa-solid fa-spinner fa-spin"></i><span>думаю…</span>' : '<i class="fa-solid fa-wand-magic-sparkles"></i><span>Угадать тебе и персонажу карточки</span>'}
        </button>
        ${astroUi.err ? `<div class="thr-note thr-down">${escapeHtml(astroUi.err)}</div>` : ''}
        ${rows}
        ${fxHtml(st)}`;
}

// ---------- Кнопки ----------

/** Возвращает true, если данные изменились; 'render' — только перерисовать; Promise для запросов к модели. */
export function handleAstroAction(st, btn, root, rerender) {
    const act = btn.dataset.act;
    if (act === 'azopen') { Object.assign(astroUi, { sel: btn.dataset.key, form: false, err: '', info: '' }); return 'render'; }
    if (act === 'azback') { Object.assign(astroUi, { sel: null, form: false, err: '', info: '' }); return 'render'; }
    if (act === 'azedit') { astroUi.form = !astroUi.form; astroUi.err = ''; return 'render'; }
    if (act === 'azcancel') { astroUi.form = false; astroUi.err = ''; return 'render'; }
    if (act === 'azinfo') { astroUi.info = astroUi.info === btn.dataset.k ? '' : btn.dataset.k; return 'render'; }
    if (act === 'azsave' || act === 'azdrop') {
        const d = act === 'azdrop' ? '' : root.querySelector('#thr_az_date')?.value;
        const m = act === 'azdrop' ? '' : root.querySelector('#thr_az_mbti')?.value;
        const err = astroSet(st, btn.dataset.key, d, m);
        astroUi.err = err;
        if (err) return 'render';
        astroUi.form = false;
        return true;
    }
    if (act === 'azcalc' || act === 'azscan') {
        if (astroUi.busy) return 'render';
        const people = astroPeople(st);
        const targets = act === 'azcalc'
            ? people.filter((p) => p.key === btn.dataset.key)
            : people.filter((p) => (p.isMe || p.isBot) && astroState(st).people[p.key]?.src !== 'manual');
        astroUi.busy = act === 'azcalc' ? btn.dataset.key : '*';
        astroUi.err = '';
        rerender();
        (async () => {
            try {
                for (const p of targets) await astroCalc(p.key, p.name);
            } catch (error) {
                astroUi.err = `Не получилось: ${String(error?.message || error).slice(0, 160)}`;
                console.error('[Thread] астро:', error);
            } finally {
                astroUi.busy = '';
                rerender();
            }
        })();
        return 'render';
    }
    return false;
}

/** Галочки и частота влияния на сюжет. */
export async function handleAstroInput(el) {
    const st = getState();
    if (!st) return false;
    const fx = astroState(st).fx;
    if (el.dataset.afx) fx[el.dataset.afx] = el.checked;
    else if (el.dataset.afxsel) fx[el.dataset.afxsel] = el.value;
    else return false;
    await saveState();
    return true;
}

export { ME };
