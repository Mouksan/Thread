// Thread — запрос к модели-судье.
// Порт из Junket (а там — из Koma): профиль подключения таверны, без ролевого пресета.

import { ctx, getSettings } from './store.js';

// Потолок ответа. Сам ответ судьи — десяток строк; запас нужен думающим моделям.
const MAX_TOKENS = 3000;

/** Отправляет запрос судье и возвращает текст ответа. */
export async function requestJudge({ system, user }) {
    const settings = getSettings();
    let raw;
    if (settings.profileId) {
        const messages = [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ];
        // includePreset: false — ролевой пресет профиля притащил бы свой системный промпт.
        // Веб-поиск служебному запросу не нужен; размышления — на минимум.
        const result = await ctx().ConnectionManagerRequestService.sendRequest(
            settings.profileId,
            messages,
            MAX_TOKENS,
            { includePreset: false, extractData: true },
            { enable_web_search: false, reasoning_effort: 'min' },
        );
        raw = String(result?.content ?? result ?? '');
    } else {
        // Профиль не выбран — текущее подключение таверны.
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
