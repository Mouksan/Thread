// Thread — встроенные ачивки. Список, редкости и названия — из Storyline (русская локаль).

// Открывает судья по slug (список уходит в промпт)
export const JUDGE_ACH = {
    'first-kiss': 'common', 'first-night': 'rare', 'secret-revealed': 'rare', 'quarrel-makeup': 'common', 'legendary-date': 'rare',
    'first-hug': 'common', 'love-confession': 'rare', 'jealousy': 'common', 'open-heart': 'common', 'meaningful-gift': 'common',
    'first-fight': 'common', 'rescue': 'rare', 'betrayal': 'rare', 'reunion': 'rare', 'breakup': 'rare', 'new-ally': 'common',
    'farewell': 'rare', 'proposal': 'legendary', 'wedding': 'legendary',
};

// Открывает само расширение по счётчикам, без запроса к модели (этап 5)
export const COUNTER_ACH = {
    'century': 'common', 'msg-500': 'rare', 'marathon': 'rare', 'week': 'common', 'month': 'rare',
    'close-one': 'common', 'soulmate': 'legendary', 'nemesis': 'rare', 'crowd': 'common', 'tangled': 'common',
    'master': 'rare', 'virtuoso': 'legendary', 'famous': 'rare', 'outcast': 'rare', 'collector': 'rare',
    'crit-success': 'rare', 'crit-fail': 'common',
};

// Жанровые (этап 6)
export const GENRE_ACH = {
    'slow-burn': 'rare', 'love-triangle': 'rare', 'first-spell': 'common', 'legendary-artifact': 'rare',
    'key-clue': 'common', 'case-closed': 'legendary', 'detention': 'common', 'prom': 'rare',
    'made-member': 'rare', 'double-cross': 'rare', 'survived-night': 'rare', 'face-the-horror': 'legendary',
};

export const ACH_TITLES = {
    "first-kiss": "Первый поцелуй",
    "first-night": "Первая ночь вдвоём",
    "secret-revealed": "Тайна раскрыта",
    "quarrel-makeup": "Помирились после ссоры",
    "legendary-date": "Свидание, которое запомнится",
    "century": "100 сообщений в этом чате",
    "marathon": "1000 сообщений в этом чате",
    "week": "7 дней с этой историей",
    "first-hug": "Первые объятия",
    "love-confession": "Признание в любви",
    "jealousy": "Сцена ревности",
    "open-heart": "Душа нараспашку",
    "meaningful-gift": "Подарок со смыслом",
    "first-fight": "Первая драка",
    "rescue": "Спасение",
    "betrayal": "Предательство",
    "reunion": "Долгожданная встреча",
    "breakup": "Расставание",
    "new-ally": "Новый союзник",
    "farewell": "Прощание навсегда",
    "proposal": "Предложение руки и сердца",
    "wedding": "Свадьба",
    "msg-500": "500 сообщений в этом чате",
    "month": "30 дней с этой историей",
    "close-one": "Близкий человек",
    "soulmate": "Родственная душа",
    "nemesis": "Заклятый враг",
    "crowd": "Душа компании",
    "tangled": "Все со всеми связаны",
    "master": "Мастер своего дела",
    "virtuoso": "Виртуоз",
    "famous": "Живая легенда",
    "outcast": "Изгой",
    "collector": "Коллекционер",
    "crit-success": "Натуральная двадцатка",
    "crit-fail": "Единица на кубике",
    "slow-burn": "Медленное горение",
    "love-triangle": "Любовный треугольник",
    "first-spell": "Первое заклинание",
    "legendary-artifact": "Легендарный артефакт",
    "key-clue": "Ключевая улика",
    "case-closed": "Дело закрыто",
    "detention": "После уроков",
    "prom": "Выпускной бал",
    "made-member": "Свой в семье",
    "double-cross": "Двойная игра",
    "survived-night": "Пережить ночь",
    "face-the-horror": "Лицом к ужасу"
};

export const ACH_HINTS = {
    "first-kiss": "первый поцелуй в истории",
    "first-night": "первая ночь вдвоём",
    "secret-revealed": "важная тайна выходит наружу",
    "quarrel-makeup": "поссориться и помириться",
    "legendary-date": "свидание, которое не забыть",
    "first-hug": "по-настоящему обнять",
    "love-confession": "кто-то признаётся в любви",
    "jealousy": "приревновать или вызвать ревность",
    "open-heart": "кто-то открывает своё прошлое или боль",
    "meaningful-gift": "подарок, который много значит",
    "first-fight": "дойти до драки",
    "rescue": "спасти кого-то от настоящей опасности",
    "betrayal": "настоящее предательство",
    "reunion": "встретиться после долгой разлуки",
    "breakup": "пара расстаётся",
    "new-ally": "враг или незнакомец становится союзником",
    "farewell": "кто-то уходит навсегда",
    "proposal": "сделать предложение",
    "wedding": "сыграть свадьбу",
    "century": "100 сообщений в чате",
    "msg-500": "500 сообщений в чате",
    "marathon": "1000 сообщений в чате",
    "week": "неделя с этой историей",
    "month": "месяц с этой историей",
    "close-one": "отношение кого-то от +60",
    "soulmate": "отношение кого-то от +90",
    "nemesis": "отношение кого-то −60 и ниже",
    "crowd": "8 знакомых в истории",
    "tangled": "5 связей между персонажами",
    "master": "навык до 75",
    "virtuoso": "навык до 95",
    "famous": "репутация 90 и выше",
    "outcast": "репутация 10 и ниже",
    "collector": "10 достижений в одном чате",
    "crit-success": "выкинуть 20 на кубике",
    "crit-fail": "выкинуть 1 на кубике",
    "slow-burn": "признаться в чувствах после долгого напряжения",
    "love-triangle": "оказаться в любовном треугольнике",
    "first-spell": "сотворить первое настоящее заклинание",
    "legendary-artifact": "найти легендарный артефакт",
    "key-clue": "найти ключевую улику",
    "case-closed": "раскрыть дело",
    "detention": "попасться и остаться после уроков",
    "prom": "пойти с кем-то на бал или школьную вечеринку",
    "made-member": "стать своим в банде или «семье»",
    "double-cross": "раскрыть или повести двойную игру",
    "survived-night": "пережить страшную ночь",
    "face-the-horror": "встретиться с ужасом лицом к лицу"
};

export const RARITY_LABELS = { common: 'обычное', rare: 'редкое', legendary: 'легендарное' };

export function achRarityOf(slug) {
    return JUDGE_ACH[slug] || COUNTER_ACH[slug] || GENRE_ACH[slug] || '';
}

export function achIcon(rarity) {
    return rarity === 'legendary' ? '👑' : rarity === 'rare' ? '🏆' : '✨';
}
