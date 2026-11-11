// Thread — судья сюжета: отношения, навыки и проверки, репутация, метки, обещания, ачивки.
// Порт плагина Storyline (Svetlyachok, Tavo) под SillyTavern.
// Этап 1: фундамент — окно с вкладками, настройки, у каждого чата свои данные.
// Этап 2: судья руками — кнопка ⟳, сбор контекста, разбор ответа, сноски, «последний ответ судьи».

import {
    ctx, getSettings, saveSettings, escapeHtml, clampInt, currentChatId,
    getState, saveState, META_KEY, repNow, repLevel, relLevel, modeOf, HIST_DEPTHS, TOAST_TITLE,
} from './store.js';
import {
    judgeNeeded, systemPrompt, userPrompt, parse, parseDate, applyRow, ensureSkills,
    skillList, skillVal, relVal, signed, activeFlags, openQuests, achTitle, LINK_LABELS,
} from './judge.js';
import {
    background, transcript, hearthtideDate, loreMemory, anchorAt, anchorHolds, characterNames, personaName,
} from './context.js';
import { requestJudge } from './connection.js';
import { showMarks, showAch, markLineHtml } from './toasts.js';
import { achIcon, RARITY_LABELS } from './ach.js';

const TABS = [
    { id: 'overview', label: 'Обзор' },
    { id: 'rels', label: 'Отношения', section: 'rels' },
    { id: 'skills', label: 'Навыки', section: 'skills' },
    { id: 'flags', label: 'Метки', section: 'flags' },
    { id: 'ach', label: 'Ачивки', section: 'ach' },
    { id: 'astro', label: 'Астро', section: 'astro' },
    { id: 'settings', label: '<i class="fa-solid fa-gear"></i>', title: 'Настройки' },
];

let overlayEl = null;
let activeTab = 'overview';
let resetArmed = false;
let resetTimer = null;
let busy = false;          // судья думает
let lastJudge = null;      // последний запрос судье — для отладки, живёт до перезагрузки страницы

// ---------- Окно ----------

function buildWindow() {
    const overlay = document.createElement('div');
    overlay.id = 'thr-overlay';
    overlay.className = 'thr-overlay';
    overlay.innerHTML = `
        <div class="thr-window" role="dialog" aria-label="Thread">
            <div class="thr-header">
                <div class="thr-title"><i class="fa-solid fa-diagram-project"></i><span>「 THREAD 」</span></div>
                <div class="thr-chatname"></div>
                <button class="thr-icon-btn thr-refresh" type="button" title="Поставить отметки сейчас" aria-label="Поставить отметки сейчас"><i class="fa-solid fa-rotate"></i></button>
                <button class="thr-icon-btn thr-close" type="button" title="Закрыть"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="thr-tabs" role="tablist"></div>
            <div class="thr-body">
                <div class="thr-pane" data-pane="overview"></div>
                <div class="thr-pane" data-pane="rels"></div>
                <div class="thr-pane" data-pane="skills"></div>
                <div class="thr-pane" data-pane="flags"></div>
                <div class="thr-pane" data-pane="ach"></div>
                <div class="thr-pane" data-pane="astro"></div>
                <div class="thr-pane" data-pane="settings">${settingsHtml()}</div>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) closeWindow();
    });
    overlay.querySelector('.thr-close').addEventListener('click', closeWindow);
    overlay.querySelector('.thr-refresh').addEventListener('click', () => evaluate());
    overlay.querySelector('.thr-tabs').addEventListener('click', (e) => {
        const btn = e.target.closest('.thr-tab');
        if (btn) switchTab(btn.dataset.tab);
    });
    overlayEl = overlay;
    bindSettings();
    return overlay;
}

function isOpen() {
    return Boolean(overlayEl && overlayEl.classList.contains('thr-open'));
}

function onKeyDown(e) {
    if (e.key !== 'Escape' || !isOpen()) return;
    // Если поверх открыт попап таверны — пусть он сам обработает Esc
    if (document.querySelector('dialog[open]')) return;
    closeWindow();
}

function openWindow(tab) {
    if (!overlayEl) buildWindow();
    if (tab) activeTab = tab;
    overlayEl.classList.add('thr-open');
    document.addEventListener('keydown', onKeyDown);
    renderAll();
}

function closeWindow() {
    if (!overlayEl) return;
    overlayEl.classList.remove('thr-open');
    document.removeEventListener('keydown', onKeyDown);
    disarmReset();
}

function switchTab(tab) {
    activeTab = tab;
    disarmReset();
    renderAll();
}

/** Вкладка видна, если её раздел в режиме «вкл». */
function visibleTabs() {
    return TABS.filter((t) => !t.section || modeOf(t.section) === 'on');
}

function renderAll() {
    if (!overlayEl) return;
    const tabs = visibleTabs();
    if (!tabs.some((t) => t.id === activeTab)) activeTab = 'overview';

    overlayEl.querySelector('.thr-chatname').textContent = currentChatId() || '';
    overlayEl.querySelector('.thr-tabs').innerHTML = tabs.map((t) => `
        <button class="thr-tab ${t.id === activeTab ? 'thr-active' : ''}" type="button" role="tab"
            data-tab="${t.id}" ${t.title ? `title="${t.title}" aria-label="${t.title}"` : ''}>${t.label}</button>`).join('');
    overlayEl.querySelectorAll('.thr-pane').forEach((pane) => {
        pane.classList.toggle('thr-active', pane.dataset.pane === activeTab);
    });

    const refresh = overlayEl.querySelector('.thr-refresh');
    refresh.classList.toggle('thr-spin', busy);
    refresh.disabled = busy || !currentChatId();

    const st = getState();
    if (activeTab === 'settings') {
        syncSettings();
        return;
    }
    const pane = overlayEl.querySelector(`.thr-pane[data-pane="${activeTab}"]`);
    if (!st) {
        pane.innerHTML = emptyHtml('Открой чат — у каждой истории свои отметки.');
        return;
    }
    const html = { overview: overviewHtml, rels: relsHtml, skills: skillsHtml, flags: flagsHtml, ach: achHtml }[activeTab];
    pane.innerHTML = html ? html(st) : emptyHtml('Астро появится позже.');
}

function emptyHtml(text) {
    return `<div class="thr-empty">${escapeHtml(text)}</div>`;
}

function barCard(title, value, max, note) {
    const width = Math.max(0, Math.min(100, (value / max) * 100));
    return `
        <div class="thr-card">
            <div class="thr-card-head"><span>${escapeHtml(title)}</span><b>${value}<small> / ${max}</small></b></div>
            <div class="thr-bar"><i style="width:${width}%"></i></div>
            ${note ? `<div class="thr-note">${escapeHtml(note)}</div>` : ''}
        </div>`;
}

function overviewHtml(st) {
    const rep = repNow(st);
    const total = Array.isArray(ctx().chat) ? ctx().chat.length : 0;
    const progress = st.touched
        ? `оценено до сообщения ${st.count} из ${total}`
        : `сообщений в чате: ${total} · оценок ещё не было`;
    const feed = st.log.filter((e) => e.count <= total).slice(-5).reverse();
    return `
        ${busy ? '<div class="thr-hint">Судья листает страницы…</div>' : ''}
        ${st.sdate?.text ? `<div class="thr-date"><i class="fa-regular fa-calendar"></i> ${escapeHtml(st.sdate.text)}</div>` : ''}
        ${modeOf('rep') === 'on' ? barCard('Репутация', rep, 100, repLevel(rep)) : ''}
        ${st.touched ? '' : '<div class="thr-hint">Судья ещё не смотрел эту историю. Нажми ⟳ в шапке — он поставит первые отметки по последним сообщениям. Для длинной истории сначала поставь в настройках глубину 80 и включи память судьи.</div>'}
        ${feed.length ? `<div class="thr-sec">Последние события</div><div class="thr-feed">${feed.map(feedLineHtml).join('')}</div>` : ''}
        <div class="thr-note thr-progress">${escapeHtml(progress)}</div>`;
}

function feedLineHtml(e) {
    const date = e.sd ? `<div class="thr-note">${escapeHtml(e.sd)}</div>` : '';
    return `<div class="thr-feed-row">${markLineHtml(e)}${date}</div>`;
}

function relsHtml(st) {
    const names = Object.keys(st.rels).sort((a, b) => relVal(st, b) - relVal(st, a));
    if (!names.length) return emptyHtml('Пока никого — судья запишет персонажей, когда посмотрит историю.');
    const cards = names.map((n) => {
        const v = relVal(st, n);
        return `
            <div class="thr-card">
                <div class="thr-card-head"><span>${escapeHtml(n)}</span><b class="${v > 0 ? 'thr-up' : v < 0 ? 'thr-down' : ''}">${signed(v)}</b></div>
                <div class="thr-bar thr-bar-mid"><i style="${v >= 0 ? `left:50%;width:${v / 2}%` : `right:50%;width:${-v / 2}%`}"></i></div>
                <div class="thr-note">${escapeHtml(relLevel(v))}</div>
            </div>`;
    }).join('');
    const pairs = Object.values(st.pairs).filter(Boolean).sort((a, b) => Math.abs(b.v || 0) - Math.abs(a.v || 0));
    const links = pairs.length ? `<div class="thr-sec">Связи между персонажами</div>${pairs.map((p) => {
        const types = Object.keys(p.types || {}).map((t) => LINK_LABELS[t] || t).join(', ');
        return `
            <div class="thr-row">
                <div><b>${escapeHtml(p.a)} — ${escapeHtml(p.b)}</b>${types ? ` <span class="thr-chip">${escapeHtml(types)}</span>` : ''}
                    ${p.note ? `<div class="thr-note">${escapeHtml(p.note)}</div>` : ''}</div>
                <b class="${p.v > 0 ? 'thr-up' : p.v < 0 ? 'thr-down' : ''}">${signed(p.v || 0)}</b>
            </div>`;
    }).join('')}` : '';
    return cards + links;
}

function skillsHtml(st) {
    const list = skillList(st);
    if (!list.length) return emptyHtml('Навыков пока нет — появятся после первой оценки.');
    return list.map((e) => barCard(e.name, skillVal(st, e.name.toLowerCase()), 100, '')).join('');
}

function flagsHtml(st) {
    const flags = activeFlags(st);
    const quests = openQuests(st);
    const row = (name, note, sd) => `
        <div class="thr-row"><div><b>${escapeHtml(name)}</b>${note ? `<div class="thr-note">${escapeHtml(note)}</div>` : ''}</div>
        ${sd ? `<span class="thr-note">${escapeHtml(sd)}</span>` : ''}</div>`;
    return `
        <div class="thr-sec">Метки сюжета</div>
        ${flags.length ? flags.map((x) => row(x.f.name || x.key, x.f.note, x.f.sd)).join('') : '<div class="thr-note">пока ни одной метки</div>'}
        <div class="thr-sec">Обещания и цели</div>
        ${quests.length ? quests.map((q) => row(q.name, q.note, q.sd)).join('') : '<div class="thr-note">открытых обещаний нет — судья заметит, когда кто-то что-то пообещает</div>'}`;
}

function achHtml(st) {
    const order = { legendary: 0, rare: 1, common: 2 };
    const list = Object.values(st.ach).filter(Boolean)
        .sort((a, b) => (order[a.rarity] ?? 3) - (order[b.rarity] ?? 3) || (b.at || 0) - (a.at || 0));
    if (!list.length) return emptyHtml('Пока ни одной — судья следит.');
    return list.map((a) => `
        <div class="thr-row"><div><b>${achIcon(a.rarity)} ${escapeHtml(achTitle(a))}</b> <span class="thr-chip">${RARITY_LABELS[a.rarity] || ''}</span>
            ${a.note ? `<div class="thr-note">${escapeHtml(a.note)}</div>` : ''}</div>
        ${a.sd ? `<span class="thr-note">${escapeHtml(a.sd)}</span>` : ''}</div>`).join('');
}

// ---------- Оценка ----------

/** Судья читает свежий кусок истории и ставит отметки. */
async function evaluate() {
    if (busy) return;
    const chatId = currentChatId();
    if (!chatId) {
        toastr.info('Открой чат — судье нечего читать', TOAST_TITLE);
        return;
    }
    if (!judgeNeeded()) {
        toastr.info('Все разделы выключены — судье нечего оценивать', TOAST_TITLE);
        return;
    }
    const total = Array.isArray(ctx().chat) ? ctx().chat.length : 0;
    if (!total) {
        toastr.info('В чате пока нет сообщений', TOAST_TITLE);
        return;
    }

    busy = true;
    renderAll();
    try {
        const depth = getSettings().histDepth;
        const st = getState();
        ensureSkills(st);
        const date = hearthtideDate(depth);
        const cx = { bg: background(), memory: await loreMemory(), date };
        const system = systemPrompt({ hasDate: Boolean(date) });
        const user = userPrompt(st, cx, transcript(depth));
        const anchor = anchorAt(total - 1); // что именно прочитал судья
        lastJudge = { at: new Date(), chars: system.length + user.length, system, user, raw: '', error: '' };

        const raw = await requestJudge({ system, user });
        lastJudge.raw = raw;

        // Пока судья думал, чат сменили или ответ перегенерировали — его выводы уже про другой текст
        if (currentChatId() !== chatId) {
            toastr.info('Чат сменился, пока судья думал — эта оценка не применена.', TOAST_TITLE);
            return;
        }
        if (ctx().chat.length < total || !anchorHolds(anchor, total - 1)) {
            toastr.info('Пока судья думал, ответ перегенерировали — эта оценка не применена.', TOAST_TITLE);
            return;
        }
        if (!raw.trim()) throw new Error('Empty reply');
        const rows = parse(raw);
        if (!rows.length && !/\bNONE\b/i.test(raw)) throw new Error('No mark lines in the reply');

        const now = getState();
        const sd = date || parseDate(raw);
        if (sd) now.sdate = { text: sd, at: Date.now() };
        const env = { total, sd: now.sdate?.text || '', chars: characterNames(), persona: personaName() };
        const applied = rows.filter((r) => applyRow(now, r, env));
        now.count = total;
        now.touched = true;
        if (!now.firstAt) now.firstAt = Date.now();
        await saveState();

        showAch(applied.filter((r) => r.kind === 'ACH'));
        showMarks(applied.filter((r) => r.kind !== 'ACH' && r.kind !== 'FACT'));
        if (!applied.length) toastr.info('Судья молчит — за это время ничего не изменилось.', TOAST_TITLE);
    } catch (error) {
        const message = String(error?.message || error || 'Unknown error').slice(0, 300);
        if (lastJudge) lastJudge.error = message;
        console.error('[Thread] судья:', error);
        toastr.error(`${explainError(message)}<br><small>${escapeHtml(message)}</small>`, 'Thread: отметки не поставлены', { escapeHtml: false, timeOut: 9000 });
    } finally {
        busy = false;
        renderAll();
    }
}

/** Пояснение по-русски; сам текст ошибки остаётся на английском — так его проще гуглить. */
function explainError(message) {
    if (/^Empty reply/.test(message)) return 'Модель вернула пустой ответ: сработал фильтр или думающей модели не хватило токенов.';
    if (/^No mark lines/.test(message)) return 'Модель ответила не по форме — отметки собрать не из чего. Сырой ответ лежит в настройках, «Последний ответ судьи».';
    if (/401|403|unauthori|api key/i.test(message)) return 'Провайдер не принял ключ профиля.';
    if (/429|rate limit/i.test(message)) return 'Лимит запросов у провайдера. Подожди минуту и попробуй ещё раз.';
    if (/timeout|timed out|5\d\d/i.test(message)) return 'Провайдер не ответил вовремя.';
    return 'Запрос к модели не прошёл.';
}

// ---------- Настройки (вкладка с шестерёнкой) ----------

function settingsHtml() {
    return `
        <div class="thr-set">
            <div class="thr-set-group">
                <label class="thr-label" for="thr_profile">Профиль подключения для судьи</label>
                <select id="thr_profile" class="text_pole"></select>
                <div class="thr-note" id="thr_profile_hint">Судья — это отдельный тихий запрос. Пусто — он пойдёт на текущее подключение таверны, то есть на основную модель.</div>
            </div>

            <div class="thr-set-group">
                <label class="checkbox_label" for="thr_auto"><input id="thr_auto" type="checkbox" /> Судья следит сам</label>
                <div class="thr-set-row">
                    <label class="thr-label" for="thr_every">Как часто: раз в N сообщений</label>
                    <input id="thr_every" class="text_pole thr-num" type="number" min="2" max="50" step="1" />
                </div>
                <div class="thr-set-row">
                    <label class="thr-label" for="thr_depth">Сколько последних сообщений читает судья</label>
                    <select id="thr_depth" class="text_pole thr-num">
                        ${HIST_DEPTHS.map((n) => `<option value="${n}">${n}${n === 10 ? ' (по умолчанию)' : ''}</option>`).join('')}
                    </select>
                </div>
                <div class="thr-note">Сообщения, карточка и персона уходят судье целиком, без обрезки. Больше сообщений — лучше контекст, но запрос дольше и дороже.</div>
                <label class="checkbox_label" for="thr_memchat"><input id="thr_memchat" type="checkbox" /> Память судьи: лорбук этого чата</label>
                <div class="thr-note">Судья дочитывает лорбук, привязанный к чату (например, сводки MemoryBook), чтобы знать прошлое истории. Боту через Thread он не уходит.</div>
            </div>

            <div class="thr-set-group">
                <label class="checkbox_label" for="thr_influence"><input id="thr_influence" type="checkbox" /> Метки влияют на сюжет</label>
                <div class="thr-note">Бот получает короткую скрытую записку об отношениях, репутации и метках и показывает это поведением.</div>
                <label class="checkbox_label" for="thr_toasts"><input id="thr_toasts" type="checkbox" /> Показывать сноски поверх чата</label>
            </div>

            <div class="thr-set-group">
                <div class="thr-set-row">
                    <label class="thr-label" for="thr_repstart">С чего начинается репутация (0–100)</label>
                    <input id="thr_repstart" class="text_pole thr-num" type="number" min="0" max="100" step="1" />
                </div>
                <div class="thr-note">Действует на истории, которые судья ещё не смотрел.</div>
            </div>

            <div class="thr-set-group">
                <details class="thr-details">
                    <summary>Последний ответ судьи</summary>
                    <div class="thr-note" id="thr_last_meta"></div>
                    <pre class="thr-pre" id="thr_last_raw"></pre>
                    <details class="thr-details">
                        <summary>Что ушло судье</summary>
                        <pre class="thr-pre" id="thr_last_prompt"></pre>
                    </details>
                </details>
            </div>

            <div class="thr-set-group">
                <button id="thr_reset" class="menu_button thr-danger" type="button">Начать с чистого листа</button>
                <div class="thr-note">Стирает метки, навыки, отношения и ачивки этого чата. Настройки остаются.</div>
            </div>
        </div>`;
}

function bindSettings() {
    const $ = (id) => overlayEl.querySelector(`#${id}`);

    // Выпадашку профилей рисует и обновляет сама таверна (как в Koma и Junket)
    try {
        ctx().ConnectionManagerRequestService.handleDropdown('#thr_profile', getSettings().profileId, (profile) => {
            getSettings().profileId = profile?.id || '';
            saveSettings();
        });
    } catch (error) {
        console.warn('[Thread] профили подключений недоступны:', error?.message);
        $('thr_profile').style.display = 'none';
        $('thr_profile_hint').textContent = 'Connection Manager отключён — судья пойдёт на текущее подключение таверны.';
    }

    const bindCheck = (id, key) => $(id).addEventListener('change', (e) => {
        getSettings()[key] = e.target.checked;
        saveSettings();
    });
    bindCheck('thr_auto', 'auto');
    bindCheck('thr_influence', 'influence');
    bindCheck('thr_toasts', 'toasts');
    bindCheck('thr_memchat', 'memChat');

    $('thr_every').addEventListener('change', (e) => {
        getSettings().everyN = clampInt(e.target.value, 2, 50, 3);
        e.target.value = getSettings().everyN;
        saveSettings();
    });
    $('thr_depth').addEventListener('change', (e) => {
        const n = parseInt(e.target.value, 10);
        getSettings().histDepth = HIST_DEPTHS.includes(n) ? n : 10;
        saveSettings();
    });
    $('thr_repstart').addEventListener('change', (e) => {
        getSettings().repStart = clampInt(e.target.value, 0, 100, 50);
        e.target.value = getSettings().repStart;
        saveSettings();
    });
    $('thr_reset').addEventListener('click', onResetClick);
}

function syncSettings() {
    const s = getSettings();
    const $ = (id) => overlayEl.querySelector(`#${id}`);
    $('thr_auto').checked = Boolean(s.auto);
    $('thr_influence').checked = Boolean(s.influence);
    $('thr_toasts').checked = Boolean(s.toasts);
    $('thr_every').value = s.everyN;
    $('thr_depth').value = String(s.histDepth);
    $('thr_repstart').value = s.repStart;
    $('thr_memchat').checked = Boolean(s.memChat);
    $('thr_reset').disabled = !currentChatId();

    if (!lastJudge) {
        $('thr_last_meta').textContent = 'С момента загрузки страницы судья ещё не запускался.';
        $('thr_last_raw').textContent = '';
        $('thr_last_prompt').textContent = '';
    } else {
        const time = lastJudge.at.toLocaleTimeString('ru-RU');
        $('thr_last_meta').textContent = `${time} · запрос: ${lastJudge.chars.toLocaleString('ru-RU')} знаков${lastJudge.error ? ` · ошибка: ${lastJudge.error}` : ''}`;
        $('thr_last_raw').textContent = lastJudge.raw || '(пусто)';
        $('thr_last_prompt').textContent = `${lastJudge.system}\n\n────────\n\n${lastJudge.user}`;
    }
}

function disarmReset() {
    resetArmed = false;
    clearTimeout(resetTimer);
    const btn = overlayEl?.querySelector('#thr_reset');
    if (btn) btn.textContent = 'Начать с чистого листа';
}

async function onResetClick(e) {
    if (!currentChatId()) return;
    if (!resetArmed) {
        resetArmed = true;
        e.currentTarget.textContent = 'Точно стереть всё? Нажми ещё раз';
        resetTimer = setTimeout(disarmReset, 5000);
        return;
    }
    disarmReset();
    delete ctx().chatMetadata[META_KEY];
    getState();
    await saveState();
    toastr.info('Отметки этого чата стёрты', TOAST_TITLE);
    renderAll();
}

// ---------- Встраивание в таверну ----------

function addSettingsDrawer() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host || document.getElementById('thread_settings')) return;
    const wrap = document.createElement('div');
    wrap.id = 'thread_settings';
    wrap.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>「 THREAD 」</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <button id="thr_open_panel" class="menu_button" type="button">
                    <i class="fa-solid fa-diagram-project"></i> <span>Открыть Thread</span>
                </button>
                <div class="thr-note">Все настройки — в окне, на вкладке с шестерёнкой.</div>
            </div>
        </div>`;
    host.appendChild(wrap);
    wrap.querySelector('#thr_open_panel').addEventListener('click', () => openWindow());
}

function addWandButton() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById('thr-wand')) return;
    const item = document.createElement('div');
    item.id = 'thr-wand';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = '<div class="fa-solid fa-diagram-project extensionsMenuExtensionButton"></div><span>Thread</span>';
    item.addEventListener('click', () => openWindow());
    menu.appendChild(item);
}

function onChatChanged() {
    // Данные живут в метаданных чата и читаются заново при каждой отрисовке —
    // между чатами ничего не кэшируем, поэтому и перетекать нечему.
    disarmReset();
    if (isOpen()) renderAll();
}

function onMessagesChanged() {
    if (isOpen() && activeTab === 'overview' && !busy) renderAll();
}

jQuery(async () => {
    getSettings();
    addSettingsDrawer();
    addWandButton();

    const { eventSource, event_types } = ctx();
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    for (const key of ['MESSAGE_RECEIVED', 'MESSAGE_SENT', 'MESSAGE_DELETED']) {
        if (event_types[key]) eventSource.on(event_types[key], onMessagesChanged);
    }
});
