// Thread — переименование и удаление персонажей во вкладке «Отношения».
// Своя часть Thread. Старое имя запоминается как второе имя персонажа (st.aliases),
// чтобы судья по старой памяти не плодил дубль. Переименование в уже существующее имя — слияние.
// Убранный персонаж попадает в st.ignored: судья больше его не записывает, пока его не вернут.

const low = (s) => String(s || '').trim().toLowerCase();

/** Имя от судьи → под каким именем персонаж живёт у нас (с учётом переименований). */
export function resolveName(st, name) {
    const al = st?.aliases;
    if (!al || !name) return name;
    return al[low(name)] || name;
}

/** Все прежние имена персонажа — для запроса судье «(also: …)». */
export function aliasesOf(st, name) {
    const out = [];
    for (const [old, now] of Object.entries(st?.aliases || {})) if (low(now) === low(name)) out.push(old);
    return out;
}

export function isIgnored(st, name) {
    return Array.isArray(st?.ignored) && st.ignored.includes(low(name));
}

function lastTouch(data, name) {
    const h = data.relHist?.[name];
    return Array.isArray(h) && h.length ? h[h.length - 1][0] : -1;
}

function pairKey(a, b) {
    const k1 = low(a);
    const k2 = low(b);
    return k1 < k2 ? `${k1}||${k2}` : `${k2}||${k1}`;
}

/**
 * Переименовать персонажа внутри одного набора данных (живое состояние, снимок отката или отложенный вариант).
 * Если `to` уже есть — слияние: значение берётся у того, кого судья трогал последним.
 */
function renameIn(data, from, to) {
    if (!data || typeof data !== 'object') return;
    const merge = data.rels && data.rels[to] != null && data.rels[from] != null;
    if (data.rels && data.rels[from] != null) {
        if (merge) {
            const tf = lastTouch(data, from);
            const tt = lastTouch(data, to);
            // кого судья трогал последним; если обоих в одной оценке — того, у кого отношение ярче
            const useFrom = tf > tt || (tf === tt && Math.abs(data.rels[from]) > Math.abs(data.rels[to]));
            if (useFrom) data.rels[to] = data.rels[from];
        } else data.rels[to] = data.rels[from];
        delete data.rels[from];
    }
    if (data.relHist && data.relHist[from]) {
        const joined = (data.relHist[to] || []).concat(data.relHist[from]).sort((a, b) => a[0] - b[0]);
        const byCount = new Map();
        for (const p of joined) byCount.set(p[0], p);
        data.relHist[to] = [...byCount.values()].slice(-40);
        delete data.relHist[from];
    }
    if (data.facts && data.facts[from]) {
        const seen = new Set();
        const all = (data.facts[to] || []).concat(data.facts[from]).filter((f) => {
            const k = low(f.t);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
        // по 5 фактов и 5 секретов — оставляем самые свежие
        data.facts[to] = [...all.filter((f) => !f.s).slice(-5), ...all.filter((f) => f.s).slice(-5)];
        delete data.facts[from];
    }
    if (data.pairs) {
        const next = {};
        for (const p of Object.values(data.pairs)) {
            if (!p) continue;
            const a = low(p.a) === low(from) ? to : p.a;
            const b = low(p.b) === low(from) ? to : p.b;
            if (low(a) === low(b)) continue; // после слияния связь сама с собой не нужна
            const key = pairKey(a, b);
            const moved = { ...p, a, b };
            const prev = next[key];
            if (prev) {
                const fresh = (moved.at || 0) >= (prev.at || 0) ? moved : prev;
                next[key] = { ...fresh, types: { ...(prev.types || {}), ...(moved.types || {}) } };
            } else next[key] = moved;
        }
        data.pairs = next;
    }
    if (Array.isArray(data.log)) {
        for (const e of data.log) {
            if (!e) continue;
            if ((e.kind === 'REL' || e.kind === 'FACT') && low(e.target) === low(from)) e.target = to;
            if (e.kind === 'LINK' && typeof e.target === 'string') {
                e.target = e.target.split(' — ').map((x) => (low(x) === low(from) ? to : x)).join(' — ');
            }
        }
    }
}

/** Переименовать (или слить с существующим). Возвращает текст ошибки или ''. */
export function renameCharacter(st, from, toRaw) {
    const to = String(toRaw || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!to) return 'Имя не может быть пустым.';
    if (to === from) return '';
    // Совпадение без учёта регистра — это то же имя существующего персонажа
    const existing = Object.keys(st.rels).find((n) => n !== from && low(n) === low(to)) || to;

    renameIn(st, from, existing);
    for (const snap of Array.isArray(st.snaps) ? st.snaps : []) renameIn(snap.data, from, existing);
    for (const r of Array.isArray(st.redo) ? st.redo : []) {
        renameIn(r.after, from, existing);
        renameIn({ log: r.log }, from, existing);
    }

    if (st.avatars?.[from]) {
        if (!st.avatars[existing]) st.avatars[existing] = st.avatars[from];
        delete st.avatars[from];
    }
    if (st.mapPos?.[low(from)] && low(from) !== low(existing)) {
        if (!st.mapPos[low(existing)]) st.mapPos[low(existing)] = st.mapPos[low(from)];
        delete st.mapPos[low(from)];
    }
    st.aliases = st.aliases && typeof st.aliases === 'object' ? st.aliases : {};
    for (const [old, now] of Object.entries(st.aliases)) if (low(now) === low(from)) st.aliases[old] = existing;
    st.aliases[low(from)] = existing;
    delete st.aliases[low(existing)]; // переименовали обратно — старое правило больше не нужно
    st.ignored = (st.ignored || []).filter((n) => n !== low(existing));
    return '';
}

/** Убрать персонажа целиком и больше не записывать его. */
export function removeCharacter(st, name) {
    if (st.rels[name] == null) return false;
    const drop = (data) => {
        if (!data) return;
        if (data.rels) delete data.rels[name];
        if (data.relHist) delete data.relHist[name];
        if (data.facts) delete data.facts[name];
        if (data.pairs) {
            for (const [k, p] of Object.entries(data.pairs)) {
                if (p && (low(p.a) === low(name) || low(p.b) === low(name))) delete data.pairs[k];
            }
        }
    };
    drop(st);
    st.log = st.log.filter((e) => !(e && (
        ((e.kind === 'REL' || e.kind === 'FACT') && low(e.target) === low(name))
        || (e.kind === 'LINK' && String(e.target).split(' — ').some((x) => low(x) === low(name))))));
    if (st.avatars) delete st.avatars[name];
    if (st.mapPos) delete st.mapPos[low(name)];
    st.ignored = [...new Set([...(st.ignored || []), low(name), ...aliasesOf(st, name)])];
    return true;
}

/** Вернуть убранного персонажа: судья снова сможет его записывать. */
export function unignore(st, name) {
    const before = (st.ignored || []).length;
    st.ignored = (st.ignored || []).filter((n) => n !== low(name));
    return st.ignored.length !== before;
}
