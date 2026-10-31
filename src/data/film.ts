/**
 * Вариант 4 — сайт-«фильм»: список сцен и то, что для них берётся из контента сайта.
 *
 * Тексты не пишем заново: всё берётся из `landing.ts`. Здесь — только порядок сцен, их длина
 * в экранах прокрутки и небольшие функции, которые находят в готовых фразах слова для приёмов
 * (плашка, подчёркивание, зачёркивание). Если фраза в `landing.ts` изменится и слова не найдутся,
 * сцена просто покажет текст без приёма.
 */
import {
  cases,
  faqItems,
  featuredCaseForCategory,
  heroAudience,
  heroSubtitle,
  mechanicsLead,
  navigation,
  type CaseCategoryId,
  type CaseItem,
} from '@/data/landing';

/** Сцены по порядку. `len` — сколько экранов прокрутки занимает сцена (карта прокрутки в сценарии). */
export const scenes = [
  { id: 'start', name: 'Старт', len: 1.2 },
  { id: 'what', name: 'Что делаем', len: 1.5 },
  { id: 'speed', name: 'Скорость', len: 1.2 },
  { id: 'mech', name: 'Возможности', len: 3 },
  { id: 'who', name: 'Для кого', len: 1.2 },
  { id: 'mts', name: 'МТС · 30 лет', len: 1.2 },
  { id: 'cases', name: 'Остальные кейсы', len: 2.5 },
  { id: 'process', name: 'Как работаем', len: 2 },
  { id: 'faq', name: 'Вопросы', len: 1.2 },
  { id: 'final', name: 'Финал', len: 1 },
] as const;

export type SceneId = (typeof scenes)[number]['id'];

/** Всего экранов прокрутки в фильме. */
export const totalScreens = scenes.reduce((sum, scene) => sum + scene.len, 0);

/** Кусок фразы: обычный текст, слово под плашку или слово под подчёркивание. */
export type Piece = { text: string; kind: 'plain' | 'plate' | 'under' };

/** Режет фразу на куски по заданным словам. Слово ищется как есть, без учёта регистра. */
export function markPhrase(
  phrase: string,
  plates: readonly string[],
  unders: readonly string[],
): Piece[] {
  const marks = [
    ...plates.map((text) => ({ text, kind: 'plate' as const })),
    ...unders.map((text) => ({ text, kind: 'under' as const })),
  ];
  const found = marks
    .map((mark) => ({
      ...mark,
      at: phrase
        .toLocaleLowerCase('ru-RU')
        .indexOf(mark.text.toLocaleLowerCase('ru-RU')),
    }))
    .filter((mark) => mark.at >= 0)
    .sort((a, b) => a.at - b.at);
  const pieces: Piece[] = [];
  let cursor = 0;
  for (const mark of found) {
    if (mark.at < cursor) continue;
    if (mark.at > cursor) {
      pieces.push({ text: phrase.slice(cursor, mark.at), kind: 'plain' });
    }
    pieces.push({
      text: phrase.slice(mark.at, mark.at + mark.text.length),
      kind: mark.kind,
    });
    cursor = mark.at + mark.text.length;
  }
  if (cursor < phrase.length) {
    pieces.push({ text: phrase.slice(cursor), kind: 'plain' });
  }
  return pieces;
}

/**
 * Меню подвала: подписи те же, что в `navigation` (ищем по адресу раздела), но ведут на сцены ленты
 * (или на FAQ под финалом). Порядок как в ленте: Возможности → Для кого → Кейсы → Как работаем → FAQ.
 */
export const filmNavigation = (
  [
    ['scene-mech', '#mechanics', 'Возможности'],
    ['scene-who', '#what-we-do', 'Для кого'],
    ['scene-cases', '#cases', 'Кейсы'],
    ['scene-process', '#process', 'Как работаем'],
    ['faq', '#faq', 'FAQ'],
  ] as const
).map(
  ([anchor, href, fallback]) =>
    [
      navigation.find((entry) => entry[1] === href)?.[0] ?? fallback,
      anchor,
    ] as const,
);

/** Сцена 02: «Квизы, челленджи, баллы и призы — чтобы вовлекать сотрудников, клиентов и покупателей.» */
export const whatPhrase = {
  text: heroSubtitle[0],
  pieces: markPhrase(
    heroSubtitle[0],
    ['Квизы', 'челленджи', 'баллы', 'призы'],
    ['сотрудников', 'клиентов', 'покупателей'],
  ),
};

/** Сцена 03: «… запуск на готовых модулях от 1 недели.» → слова «от», «1», «недели». */
export function speedWords() {
  const sentence = heroSubtitle[1];
  const match = /(?<![\p{L}\p{N}])от\s+(\d+)\s+(недел\p{L}*)/iu.exec(sentence);
  return {
    sentence,
    from: match?.[0].split(' ')[0] ?? null,
    value: match ? Number(match[1]) : null,
    unit: match?.[2] ?? null,
  };
}

/** Сцена 04: подпись «Из чего собираем проект» — начало вводной фразы блока «Механики». */
export const mechLabel = mechanicsLead.split(':')[0];

/** Сцена «МТС · 30 лет»: кейс-герой и строка фактов «60 000 сотрудников · платформа за 4 недели». */
export function mtsScene() {
  const item = cases.find((entry) => entry.id === 'mts-30') ?? cases[0];
  const audience = item.facts.find((fact) => fact.label === 'Аудитория');
  const platform = item.facts.find((fact) => fact.label === 'Платформа');
  const line =
    audience && platform
      ? `${audience.value} · ${platform.label.toLocaleLowerCase('ru-RU')} ${platform.value}`
      : null;
  return { item, line };
}

/** Число и подпись из итога кейса: «24 000» + «участников». */
export function splitValue(value: string) {
  const match = /^([\d\s  ]+)(.*)$/u.exec(value);
  const digits = match ? match[1].replace(/[\s  ]/gu, '') : '';
  const suffix = match ? match[2] : value;
  return {
    target: digits ? Number(digits) : null,
    grouped: Boolean(match && /[\s  ]/u.test(match[1].trim())),
    suffix,
  };
}

/** Одна фраза «новое, а не старое»: старая часть зачёркивается, новая печатается. */
export type StrikeLine = {
  fresh: string;
  join: string;
  old: string;
  /** Точка в конце фразы, если она была. */
  tail: string;
};

/** Режет фразу на «новое» и «старое» по связке «вместо» или «а не». */
export function strikeLine(phrase: string): StrikeLine | null {
  const tail = phrase.endsWith('.') ? '.' : '';
  const clean = tail ? phrase.slice(0, -1) : phrase;
  for (const join of [' вместо ', ', а не ']) {
    const at = clean.indexOf(join);
    if (at > 0) {
      return {
        fresh: clean.slice(0, at),
        join,
        old: clean.slice(at + join.length),
        tail,
      };
    }
  }
  return null;
}

export type FilmFrame = {
  item: CaseItem;
  /** Номер кадра в ленте: у МТС «30 лет» номер 01, остальные идут с 02. */
  number: number;
  /** Главная строка кадра. */
  line: string;
  /** Если в строке есть «не X, а Y» — её части. */
  strike: StrikeLine | null;
};

/** Сцена «Остальные кейсы»: кейсы, кроме МТС «30 лет» (он уже был в своей сцене). Итог берём из `outcome[0]`, у HeadHunter — из задачи. */
export function caseFrames(): FilmFrame[] {
  return cases
    .filter((item) => item.id !== 'mts-30')
    .map((item, index) => {
      const outcome = item.outcome[0]?.text ?? item.description;
      const outcomeStrike = strikeLine(outcome);
      const taskStrike = outcomeStrike ? null : strikeLine(item.task);
      return {
        item,
        number: index + 2,
        line: taskStrike ? item.task : outcome,
        strike: outcomeStrike ?? taskStrike,
      };
    });
}

/** Сцена «Для кого»: плашки задач. Клик ведёт к кейсу этой задачи, а «Своя механика» открывает форму. */
export function whoPlates() {
  return heroAudience.map((entry) => ({
    label: entry.label,
    caseId: entry.categoryId
      ? featuredCaseForCategory(entry.categoryId as CaseCategoryId).id
      : null,
  }));
}

/** Сцена «Вопросы»: вопросы, на которые в FAQ отвечено коротким «Да» или «Нет». */
export function faqChecks() {
  return faqItems
    .filter((item) => /^(Да|Нет)(?![\p{L}\p{N}])/u.test(item.answer))
    .map((item) => ({
      question: item.question,
      yes: item.answer.startsWith('Да'),
      word: item.answer.startsWith('Да') ? 'Да' : 'Нет',
    }));
}
