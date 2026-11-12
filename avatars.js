// Thread — аватарки персонажей во вкладке «Отношения».
// Авто: имя от судьи («Ренцо») сравнивается с карточками чата и слотами Frame через транслит с допуском.
// Вручную: клик по аватарке — выбрать карточку чата или реф из Frame, загрузить свою картинку, убрать.
// Чтение слотов Frame — как у Memento (image.js: getFrameRefContainer / getFrameCast).

import { ctx, getState, saveState, escapeHtml } from './store.js';
import { personaAvatarId } from './context.js';

const UPLOAD_FOLDER = 'Thread';
const AVA_SIZE = 256;

// ---------- Транслит и нечёткое сравнение имён ----------

const RU = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
    н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Имя → латинский «скелет» для сравнения: Ренцо → renzo, Вейн → vein. */
function skeleton(name) {
    let s = String(name || '').toLowerCase().trim().split(/[\s,]+/)[0] || '';
    s = s.replace(/дж/g, 'j').replace(/[а-яё]/g, (ch) => RU[ch] ?? ch);
    return s
        .replace(/[^a-z]/g, '')
        .replace(/ts|tz|zz/g, 'z') // Ренцо → renzo
        .replace(/kh|ch|h/g, 'h')
        .replace(/ph/g, 'f')
        .replace(/[yj]/g, 'i')     // Вейн → vein ~ Veyne → veine
        .replace(/w/g, 'v')
        .replace(/c(?=[eiy])/g, 's')
        .replace(/c|q/g, 'k')
        .replace(/x/g, 'ks')
        .replace(/e$/g, '')        // Veyne → vein
        .replace(/(.)\1+/g, '$1');
}

function distance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
    }
    return d[a.length][b.length];
}

/** Одно и то же ли имя, с учётом языка и мелких расхождений транслита. */
export function namesMatch(a, b) {
    const x = skeleton(a);
    const y = skeleton(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const longest = Math.max(x.length, y.length);
    if (longest < 4) return false; // короткие имена — только точное совпадение
    return distance(x, y) <= Math.max(1, Math.floor(longest / 4));
}

// ---------- Откуда брать картинки ----------

function cardThumb(avatar) {
    const c = ctx();
    try {
        if (typeof c.getThumbnailUrl === 'function') return c.getThumbnailUrl('avatar', avatar);
    } catch { /* ниже — запасной путь */ }
    return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;
}

/** Картинка текущей персоны юзера ('' — нет). */
export function personaThumb() {
    const id = personaAvatarId();
    if (!id) return '';
    const c = ctx();
    try {
        if (typeof c.getThumbnailUrl === 'function') return c.getThumbnailUrl('persona', id);
    } catch { /* ниже — запасной путь */ }
    return `/thumbnail?type=persona&file=${encodeURIComponent(id)}`;
}

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

function frameImage(ref) {
    if (!ref) return '';
    if (ref.imagePath) return String(ref.imagePath);
    const b64 = String(ref.imageBase64 || ref.imageData || '');
    if (!b64) return '';
    return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
}

/** Слоты Frame в том же порядке, как их ищут Memento и Reel: сначала область, выбранная во Frame. */
function frameContainer() {
    const c = ctx();
    const fw = c.extensionSettings?.inline_image_gen;
    if (!fw || typeof fw !== 'object') return null;
    const chatBucket = c.chatMetadata?.iig_refs;
    let ownerKey = null;
    if (c.groupId) ownerKey = `group:${String(c.groupId)}`;
    else if (c.characters?.[c.characterId]?.avatar) ownerKey = `character:${c.characters[c.characterId].avatar}`;
    const charBucket = ownerKey ? fw.characterRefs?.[ownerKey] : null;
    const byScope = { 'per-chat': chatBucket, 'per-character': charBucket, global: fw };
    const filled = (box) => box && typeof box === 'object'
        && [box.charRef, ...(Array.isArray(box.npcReferences) ? box.npcReferences : [])].some((r) => frameImage(r));
    for (const scope of [fw.refScope, 'per-chat', 'per-character', 'global']) {
        if (filled(byScope[scope])) return byScope[scope];
    }
    return null;
}

/**
 * Все кандидаты на аватарку в этом чате: { label, names[], url, src }.
 * Персона игрока не нужна — в «Отношения» она не попадает.
 */
export function avatarCandidates() {
    const c = ctx();
    const out = [];
    for (const ch of chatCharacters()) {
        if (ch.avatar) out.push({ label: ch.name, names: [ch.name], url: cardThumb(ch.avatar), src: 'карточка' });
    }
    const box = frameContainer();
    if (box) {
        const push = (ref, fallback) => {
            const url = frameImage(ref);
            const raw = String(ref?.name || fallback || '').trim();
            if (!url || !raw) return;
            const names = raw.split(',').map((x) => x.trim()).filter(Boolean); // во Frame через запятую — алиасы
            out.push({ label: names[0], names, url, src: 'Frame' });
        };
        if (!c.groupId) push(box.charRef, c.name2);
        for (const npc of Array.isArray(box.npcReferences) ? box.npcReferences : []) push(npc, '');
    }
    const seen = new Set();
    return out.filter((x) => (seen.has(x.url) ? false : seen.add(x.url)));
}

/** Картинка для персонажа из «Отношений»: ручная привязка, иначе автоподбор по имени. '' — показать букву. */
export function avatarFor(st, name) {
    const manual = st?.avatars?.[name];
    if (manual === 'none') return '';
    if (manual) return manual;
    for (const cand of avatarCandidates()) {
        if (cand.names.some((n) => namesMatch(n, name))) return cand.url;
    }
    return '';
}

// ---------- Ручной выбор ----------

let menuEl = null;
let menuFor = '';
let onDone = () => {};

export function setAvatarChangeHandler(fn) {
    onDone = fn;
}

function closeMenu() {
    menuEl?.remove();
    menuEl = null;
    document.removeEventListener('mousedown', onOutside, true);
}

function onOutside(e) {
    if (menuEl && !menuEl.contains(e.target)) closeMenu();
}

async function setAvatar(name, value) {
    const st = getState();
    if (!st) return;
    st.avatars = st.avatars && typeof st.avatars === 'object' ? st.avatars : {};
    if (value === null) delete st.avatars[name];
    else st.avatars[name] = value;
    await saveState();
    closeMenu();
    onDone();
}

/** Картинка → квадрат 256px (обрезка по центру) → папка картинок таверны. Возвращает путь. */
async function uploadFile(file, name) {
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('не удалось прочитать картинку'));
        el.src = dataUrl;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = AVA_SIZE;
    canvas.height = AVA_SIZE;
    canvas.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, AVA_SIZE, AVA_SIZE);
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    const safe = String(name).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'npc';
    const response = await fetch('/api/images/upload', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ image: base64, format: 'png', ch_name: UPLOAD_FOLDER, filename: `ava_${safe}_${Date.now()}` }),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || `upload failed (${response.status})`);
    }
    const result = await response.json();
    if (!result?.path) throw new Error('no path in upload response');
    return result.path;
}

/** Меню у аватарки: кандидаты из чата и Frame, загрузка своей картинки, «авто», «без картинки». */
export function openAvatarMenu(anchor, name) {
    closeMenu();
    menuFor = name;
    const st = getState();
    const manual = st?.avatars?.[name];
    const cands = avatarCandidates();
    menuEl = document.createElement('div');
    menuEl.className = 'thr-ava-menu';
    menuEl.innerHTML = `
        <div class="thr-ava-menu-title">Аватарка: ${escapeHtml(name)}</div>
        ${cands.length ? `<div class="thr-ava-pick">${cands.map((c, i) => `
            <button type="button" data-i="${i}" title="${escapeHtml(`${c.label} · ${c.src}`)}" class="${manual === c.url ? 'thr-on' : ''}">
                <img src="${escapeHtml(c.url)}" alt="" loading="lazy" /><span>${escapeHtml(c.label)}</span><small>${escapeHtml(c.src)}</small>
            </button>`).join('')}</div>` : '<div class="thr-note">В чате нет карточек и рефов Frame с картинками.</div>'}
        <div class="thr-ava-actions">
            <button type="button" class="menu_button" data-act="upload"><i class="fa-solid fa-upload"></i><span>Загрузить свою</span></button>
            ${manual ? '<button type="button" class="menu_button" data-act="auto"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Подбирать сама</span></button>' : ''}
            ${manual !== 'none' ? '<button type="button" class="menu_button" data-act="none"><i class="fa-solid fa-ban"></i><span>Без картинки</span></button>' : ''}
        </div>
        <input type="file" accept="image/*" hidden />`;
    document.body.appendChild(menuEl);

    const rect = anchor.getBoundingClientRect();
    const width = 300;
    menuEl.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    menuEl.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 260)}px`;

    const input = menuEl.querySelector('input[type="file"]');
    menuEl.addEventListener('click', async (e) => {
        const pick = e.target.closest('[data-i]');
        if (pick) {
            await setAvatar(name, cands[Number(pick.dataset.i)].url);
            return;
        }
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'upload') input.click();
        if (act === 'auto') await setAvatar(name, null);
        if (act === 'none') await setAvatar(name, 'none');
    });
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            const path = await uploadFile(file, menuFor);
            await setAvatar(menuFor, path);
        } catch (error) {
            console.error('[Thread] аватарка:', error);
            toastr.error(`Не получилось сохранить картинку<br><small>${escapeHtml(error.message)}</small>`, 'Thread', { escapeHtml: false });
        }
    });
    setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
}
