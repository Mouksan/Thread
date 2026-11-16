// Кнопка в панели быстрых ответов — порт кнопки Junket/Koma (только ряд QR).
// Таверна пересобирает панель быстрых ответов (смена чата, правка набора),
// поэтому следим за #send_form и вставляем кнопку обратно. Пока расширение
// работает, кнопка пульсирует; без открытого чата — приглушена.

/**
 * @param {{ id: string, cls: string, icon: string, title: string | (() => string),
 *           isWanted: () => boolean, onClick: () => void }} opts
 */
export function createQuickbarButton({ id, cls, icon, title, isWanted, onClick }) {
    let busy = false;
    let observer = null;
    let timer = null;
    let chatHandler = null;

    const getHost = () => {
        const bar = document.querySelector('#send_form #qr--bar')
            || document.getElementById('qr--bar')
            || document.querySelector('#send_form .qr--bar');
        return bar ? (bar.querySelector('.qr--buttons') || bar) : null;
    };

    const hasChat = () => {
        try {
            return Boolean(SillyTavern.getContext().getCurrentChatId?.());
        } catch {
            return true;
        }
    };

    const wanted = () => {
        try {
            return Boolean(isWanted());
        } catch {
            return false;
        }
    };

    function build() {
        // Подпись может быть функцией: у расширений с переводом он грузится позже.
        const label = typeof title === 'function' ? title() : title;
        const btn = document.createElement('div');
        btn.id = id;
        btn.className = `qr--button menu_button interactable ${cls}`;
        btn.tabIndex = 0;
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', label);
        btn.title = label;
        btn.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        });
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
            }
        });
        return btn;
    }

    /** Поставить или убрать кнопку по настройке и обновить её состояние. Можно звать сколько угодно. */
    function sync() {
        let btn = document.getElementById(id);
        const host = wanted() ? getHost() : null;
        if (!host) {
            btn?.remove();
            return;
        }
        if (!btn) btn = build();
        if (btn.parentElement !== host) host.appendChild(btn);
        btn.classList.toggle(`${cls}--no-chat`, !hasChat());
        btn.classList.toggle(`${cls}--busy`, busy);
    }

    function start() {
        const attach = () => {
            const sendForm = document.getElementById('send_form');
            if (!sendForm) {
                timer = setTimeout(attach, 500);
                return;
            }
            if (!observer) {
                observer = new MutationObserver(() => {
                    const btn = document.getElementById(id);
                    if (wanted() ? (btn && getHost()?.contains(btn)) : !btn) return;
                    clearTimeout(timer);
                    timer = setTimeout(sync, 150);
                });
                observer.observe(sendForm, { childList: true, subtree: true });
            }
            sync();
        };
        attach();
        try {
            const c = SillyTavern.getContext();
            const types = c.eventTypes || c.event_types;
            if (types?.CHAT_CHANGED && !chatHandler) {
                chatHandler = () => setTimeout(sync, 0);
                c.eventSource.on(types.CHAT_CHANGED, chatHandler);
            }
        } catch { /* без событий кнопка всё равно работает */ }
    }

    /** Пульсация, пока что-то работает (окно можно закрыть — видно, что дело идёт). */
    function setBusy(value) {
        busy = Boolean(value);
        document.getElementById(id)?.classList.toggle(`${cls}--busy`, busy);
    }

    function dispose() {
        observer?.disconnect();
        observer = null;
        clearTimeout(timer);
        if (chatHandler) {
            try {
                const c = SillyTavern.getContext();
                c.eventSource.removeListener?.((c.eventTypes || c.event_types).CHAT_CHANGED, chatHandler);
            } catch { /* noop */ }
            chatHandler = null;
        }
        document.getElementById(id)?.remove();
    }

    return { start, sync, setBusy, dispose };
}
