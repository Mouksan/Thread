// Thread — судья сюжета: отношения, навыки и проверки, репутация, метки, обещания, ачивки.
// Порт плагина Storyline (Svetlyachok, Tavo) под SillyTavern.
// Этап 1: фундамент — окно с вкладками, настройки, у каждого чата свои данные.

import {
    ctx, getSettings, saveSettings, escapeHtml, clampInt, currentChatId,
    getState, saveState, META_KEY, repNow, repLevel, modeOf, HIST_DEPTHS, TOAST_TITLE,
} from './store.js';

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
    if (activeTab === 'overview') pane.innerHTML = overviewHtml(st);
    else pane.innerHTML = emptyHtml(EMPTY_TEXT[activeTab]);
}

const EMPTY_TEXT = {
    rels: 'Пока никого — судья запишет персонажей, когда посмотрит историю.',
    skills: 'Навыков пока нет — появятся после первой оценки.',
    flags: 'Пока ни одной метки. Открытых обещаний тоже нет — судья заметит, когда кто-то что-то пообещает.',
    ach: 'Пока ни одной — судья следит.',
    astro: 'Астро появится позже.',
};

function emptyHtml(text) {
    return `<div class="thr-empty">${escapeHtml(text)}</div>`;
}

function overviewHtml(st) {
    const rep = repNow(st);
    const total = Array.isArray(ctx().chat) ? ctx().chat.length : 0;
    const progress = st.touched
        ? `оценено до сообщения ${st.count} из ${total}`
        : `сообщений в чате: ${total} · оценок ещё не было`;
    return `
        <div class="thr-card">
            <div class="thr-card-head"><span>Репутация</span><b>${rep}<small> / 100</small></b></div>
            <div class="thr-bar"><i style="width:${rep}%"></i></div>
            <div class="thr-note">${escapeHtml(repLevel(rep))}</div>
        </div>
        ${st.touched ? '' : '<div class="thr-hint">Судья ещё не смотрел эту историю. Скоро здесь появится кнопка ⟳ — он поставит первые отметки по последним сообщениям.</div>'}
        <div class="thr-note thr-progress">${escapeHtml(progress)}</div>`;
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
                <div class="thr-note">Больше сообщений — лучше контекст, но запрос дольше и дороже.</div>
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
    $('thr_reset').disabled = !currentChatId();
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
    if (isOpen() && activeTab === 'overview') renderAll();
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
