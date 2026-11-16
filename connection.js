// Thread — запрос к модели-судье.
// Порт из Junket (а там — из Koma): профиль подключения таверны, без ролевого пресета.

import { ctx, getSettings } from './store.js';

// Потолок ответа. Сам ответ судьи — десяток строк; запас нужен думающим моделям.
const MAX_TOKENS = 3000;

/** Отправляет запрос судье и возвращает текст ответа. */
export async function requestJudge({ system, user, signal = null }) {
    const settings = getSettings();
    let raw;
    if (settings.profileId) {
        const messages = [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ];
        // includePreset: false — ролевой пресет профиля притащил бы свой системный промпт.
        // Веб-поиск служебному запросу не нужен. Размышления — на минимум, либо не задаём вовсе:
        // некоторые модели минимум не поддерживают и ругаются на него.
        const overrides = { enable_web_search: false };
        if (settings.judgeReasoning !== 'auto') overrides.reasoning_effort = 'min';
        const result = await ctx().ConnectionManagerRequestService.sendRequest(
            settings.profileId,
            messages,
            MAX_TOKENS,
            { includePreset: false, extractData: true, ...(signal ? { signal } : {}) },
            overrides,
        );
        raw = String(result?.content ?? result ?? '');
    } else {
        // Профиль не выбран — текущее подключение таверны. Её тихую генерацию снаружи не прервать:
        // при «стопе» ответ дождёмся и выбросим (это решает вызывающий).
        const result = await ctx().generateRaw({
            prompt: [{ role: 'user', content: user }],
            systemPrompt: system,
            responseLength: MAX_TOKENS,
        });
        raw = typeof result === 'string' ? result : String(result?.content || result?.text || result || '');
    }
    return stripReasoning(raw);
}

/** Срезает рассуждения модели, если она вернула их вместе с ответом. */
function stripReasoning(text) {
    let out = String(text || '').replace(/\r\n?/g, '\n').trim();
    out = out.replace(/<(think|thinking|reasoning|thought|rp_preflight)>[\s\S]*?<\/\1>/gi, '').trim();
    out = out.replace(/^[\s\S]*?<\/(?:think|thinking|reasoning|thought|rp_preflight)>/i, '').trim();
    return out;
}
