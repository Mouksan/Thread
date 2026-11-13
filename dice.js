// Thread — 🎲 проверка навыка. Порт из Storyline (checkRoll / doCheck / checkHtml).
// Иконка у поля ввода → окошко: навык, сложность, «Бросить d20». Без запросов к модели:
// исход «заряжается» и уходит боту вместе со следующим ответом.

import { ctx, getState, saveState, escapeHtml, modOn } from './store.js';
import { skillList, skillVal, pushLog } from './judge.js';
import { reconcileSkills } from './genres.js';
import { checkNoteText, armedCheck } from './inject.js';
import { ACH_TITLES, COUNTER_ACH } from './ach.js';
import { showAch } from './toasts.js';

const DC = { easy: 8, mid: 12, hard: 16, epic: 20 };
const DC_LABELS = { easy: 'легко', mid: 'средне', hard: 'сложно', epic: 'экстрим' };
const RES_LABELS = { crit: 'Критический успех', success: 'Успех', fail: 'Провал', fumble: 'Критический провал' };

const ui = { skill: null, dc: 'mid', rolling: false, last: null };
let popEl = null;
let onChange = () => {};

export function setDiceChangeHandler(fn) {
    onChange = fn;
}

function roll(st, skillName, dcKey) {
    const v = skillVal(st, String(skillName).toLowerCase());
    const mod = Math.floor(v / 10);
    const dc = DC[dcKey] || 12;
    const d = 1 + Math.floor(Math.random() * 20);
    const total = d + mod;
    const res = d === 20 ? 'crit' : d === 1 ? 'fumble' : (total >= dc ? 'success' : 'fail');
    return { skill: skillName, v, mod, d, total, dc, dcKey, res, at: Date.now() };
}

function unlockCounter(st, slug, note) {
    if (!modOn('ach') || st.ach[slug]) return null;
    const a = { slug, title: ACH_TITLES[slug], rarity: COUNTER_ACH[slug], note, sd: st.sdate?.text || '', at: Date.now() };
    st.ach[slug] = a;
    pushLog(st, { kind: 'ACH', target: a.title, rarity: a.rarity, delta: 0, note, sd: a.sd, count: ctx().chat?.length || 0, at: a.at });
    return a;
}

/**
 * Бросок с записью в ленту и «зарядкой» для бота. Общий для окошка 🎲 и моста window.Thread.check.
 * arm = false — просто узнать исход, боту ничего не уходит.
 */
export async function rollCheck(skillName, dcKey = 'mid', { arm = true } = {}) {
    const st = getState();
    if (!st) return null;
    const r = roll(st, skillName, DC[dcKey] ? dcKey : 'mid');
    if (arm) st.check = { ...r, armed: true, target: null, note: checkNoteText(r) };
    pushLog(st, {
        kind: 'CHECK', target: r.skill, delta: 0,
        note: `${RES_LABELS[r.res]}: ${r.d} → ${r.total} против ${r.dc}`,
        sd: st.sdate?.text || '', count: ctx().chat?.length || 0, at: Date.now(),
    });
    const unlocked = [];
    if (r.res === 'crit') unlocked.push(unlockCounter(st, 'crit-success', r.skill));
    if (r.res === 'fumble') unlocked.push(unlockCounter(st, 'crit-fail', r.skill));
    await saveState();
    showAch(unlocked.filter(Boolean));
    onChange();
    return { ...r, label: RES_LABELS[r.res], note: checkNoteText(r), armed: arm };
}

async function doRoll() {
    const st = getState();
    if (ui.rolling || !ui.skill || !st) return;
    ui.rolling = true;
    render();
    await new Promise((r) => setTimeout(r, 650)); // «кубик катится»
    ui.last = await rollCheck(ui.skill, ui.dc);
    ui.rolling = false;
    render();
}

async function cancelRoll() {
    const st = getState();
    if (st?.check) st.check.armed = false;
    ui.last = null;
    await saveState();
    render();
    onChange();
}

function popHtml() {
    const st = getState();
    if (!st) return '<div class="thr-note">Открой чат — у каждой истории свои навыки</div>';
    if (!modOn('skills')) return '<div class="thr-note">Раздел «Навыки» выключен — включи его в настройках Thread</div>';
    reconcileSkills(st);
    const list = skillList(st);
    if (!list.length) return '<div class="thr-note">Навыков пока нет</div>';
    if (!ui.skill || !list.some((e) => e.name === ui.skill)) ui.skill = list[0].name;

    const chips = list.map((e) => {
        const mod = Math.floor(skillVal(st, e.name.toLowerCase()) / 10);
        return `<button class="thr-chip-btn ${e.name === ui.skill ? 'thr-on' : ''}" type="button" data-skill="${escapeHtml(e.name)}">${escapeHtml(e.name)} <i>+${mod}</i></button>`;
    }).join('');
    const dcs = Object.keys(DC).map((k) => `<button type="button" data-dc="${k}" class="${ui.dc === k ? 'thr-on' : ''}">${DC_LABELS[k]} ${DC[k]}</button>`).join('');

    // показываем последний бросок, пока он заряжен (или только что брошен)
    const armed = armedCheck(st);
    const r = ui.last || (armed ? armed : null);
    let result = '';
    if (r && !ui.rolling) {
        const good = r.res === 'crit' || r.res === 'success';
        const live = Boolean(armed && armed.at === r.at);
        result = `
            <div class="thr-roll">
                <div class="thr-die ${good ? 'thr-good' : 'thr-bad'}">${r.d}</div>
                <div>
                    <b class="${good ? 'thr-up' : 'thr-down'}">${RES_LABELS[r.res]}</b>
                    <div class="thr-note"><i class="fa-solid fa-dice-d20" aria-hidden="true"></i>${r.d} + ${r.mod} (${escapeHtml(r.skill)}) = ${r.total} против ${r.dc}</div>
                </div>
            </div>
            <div class="thr-note">${live
                ? 'Теперь напиши действие и отправь — бот узнает исход с ответом. Если перегенерируешь ответ, исход сохранится.'
                : 'Бот уже получил этот исход'}</div>
            ${live ? '<button class="menu_button thr-wide" type="button" data-act="cancel">Отменить бросок</button>' : ''}`;
    }
    return `
        <div class="thr-pop-title"><i class="fa-solid fa-dice-d20"></i> Проверка навыка</div>
        <div class="thr-note">Перед рискованным действием выбери навык и сложность и брось кубик. Бот узнает исход вместе со следующим ответом.</div>
        <div class="thr-chips">${chips}</div>
        <div class="thr-seg">${dcs}</div>
        <button class="menu_button thr-wide thr-roll-btn" type="button" data-act="roll" ${ui.rolling ? 'disabled' : ''}>
            <i class="fa-solid fa-dice-d20 ${ui.rolling ? 'thr-roll-spin' : ''}"></i> ${ui.rolling ? 'Кубик катится…' : 'Бросить d20'}
        </button>
        ${result}`;
}

function render() {
    if (!popEl || !popEl.classList.contains('thr-open')) return;
    popEl.innerHTML = popHtml();
}

function onPopClick(e) {
    const skill = e.target.closest('[data-skill]');
    if (skill) { ui.skill = skill.dataset.skill; render(); return; }
    const dc = e.target.closest('[data-dc]');
    if (dc) { ui.dc = dc.dataset.dc; render(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'roll') doRoll();
    if (act === 'cancel') cancelRoll();
}

function onOutside(e) {
    if (!popEl?.classList.contains('thr-open')) return;
    if (popEl.contains(e.target) || e.target.closest('#thr-dice-btn')) return;
    closePop();
}

export function openDice() {
    openPop();
}

function openPop() {
    if (!popEl) {
        popEl = document.createElement('div');
        popEl.id = 'thr-dice-pop';
        popEl.addEventListener('click', onPopClick);
        document.body.appendChild(popEl);
        document.addEventListener('mousedown', onOutside);
    }
    ui.last = null; // свежий заход: показываем только заряженный бросок, если он есть
    popEl.classList.add('thr-open');
    render();
    place();
}

function closePop() {
    popEl?.classList.remove('thr-open');
}

/** Окошко — над полем ввода, у левого края формы. */
function place() {
    const form = document.getElementById('send_form') || document.getElementById('send_textarea');
    if (!form || !popEl) return;
    const rect = form.getBoundingClientRect();
    popEl.style.left = `${Math.max(8, rect.left)}px`;
    popEl.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 8)}px`;
}

/** Обновить вид иконки: подсветка, пока бросок заряжен; скрыта, если навыки выключены. */
export function refreshDiceButton() {
    const btn = document.getElementById('thr-dice-btn');
    if (!btn) return;
    const st = getState();
    btn.style.display = modOn('skills') ? '' : 'none';
    const armed = armedCheck(st);
    btn.classList.toggle('thr-armed', Boolean(armed));
    btn.title = armed ? `Бросок заряжен: ${RES_LABELS[armed.res]} (${armed.skill})` : 'Проверка навыка (d20)';
    render();
}

export function addDiceButton() {
    const host = document.getElementById('leftSendForm');
    if (!host || document.getElementById('thr-dice-btn')) return;
    const btn = document.createElement('div');
    btn.id = 'thr-dice-btn';
    btn.className = 'fa-solid fa-dice-d20 interactable';
    btn.tabIndex = 0;
    btn.addEventListener('click', () => (popEl?.classList.contains('thr-open') ? closePop() : openPop()));
    host.appendChild(btn);
    refreshDiceButton();
}

export function closeDice() {
    closePop();
    ui.last = null;
}
