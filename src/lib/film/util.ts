/**
 * Мелочи для движка сцен: отрезки прогресса, кривые, запись переменных без лишних обращений к DOM.
 * Всё здесь — чистые функции от числа: сцена, прокрученная назад, возвращается ровно в прежнее состояние.
 */
import type { TempoZone } from './types';

export const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export const lerp = (from: number, to: number, t: number) =>
  from + (to - from) * t;

/** Где `q` на отрезке [a, b]: 0 до начала, 1 после конца. */
export const win = (q: number, a: number, b: number) =>
  b === a ? (q >= b ? 1 : 0) : clamp((q - a) / (b - a));

/** Мягкая ступенька. */
export const smooth = (t: number) => t * t * (3 - 2 * t);

/** Быстрый старт и мягкая остановка. */
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Мягче `easeOut`: то же замедление в конце, но большая часть пути не сжимается в первую треть (для счёта чисел). */
export const easeOutQuad = (t: number) => 1 - (1 - t) ** 2;

/** Резкий выход: медленный старт, быстрый конец. */
export const easeIn = (t: number) => t ** 3;

export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

/** Быстрый старт, мягкая остановка и лёгкий «перелёт», как у пружины. */
export const easeBack = (t: number, overshoot = 1.5) => {
  const u = t - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
};

/**
 * Колебание вокруг конечного значения — для плашек, которые «садятся» с пружиной. Мягкая пружина: первый раз
 * доходит до цели на четверти отрезка (а не на седьмой части), перелёт около 8 %, затухает к концу отрезка.
 */
export const spring = (t: number) =>
  t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.exp(-5.6 * t) * Math.cos(6.8 * t);

/**
 * Прогресс одной буквы в группе из `count`: буквы стартуют по очереди внутри отрезка [a, b].
 * `spread` — какая доля отрезка уходит на разброс стартов (остальное — длительность одной буквы).
 */
export function stagger(
  q: number,
  index: number,
  count: number,
  a: number,
  b: number,
  spread = 0.7,
) {
  const span = b - a;
  const step = count > 1 ? (span * spread) / (count - 1) : 0;
  const start = a + index * step;
  return win(q, start, start + span * (1 - spread));
}

/**
 * Темп для сцены с несколькими опорными кадрами: каждый переход между соседними точками `points` (q) делится на части.
 * `parts` — `[от доли, до доли, секунды]` внутри перехода: доля 0 — предыдущая точка, 1 — следующая.
 */
export function hopTempo(
  points: readonly number[],
  parts: readonly (readonly [number, number, number])[],
): TempoZone[] {
  const zones: TempoZone[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const span = points[i] - from;
    for (const [a, b, seconds] of parts) {
      zones.push([from + span * a, from + span * b, seconds]);
    }
  }
  return zones;
}

/** Целое число с разделителем разрядов: 24000 → «24 000». */
export function groupDigits(value: number) {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export const pad2 = (value: number) =>
  Math.max(0, Math.round(value)).toString().padStart(2, '0');

/** Псевдослучайное число от целого — одно и то же при каждом вызове. */
export function hash(seed: number) {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
}

const last = new WeakMap<Element, Map<string, string>>();

/** Записывает CSS-переменную, только если значение изменилось. */
export function setVar(
  el: HTMLElement | SVGElement,
  name: string,
  value: number | string,
) {
  const text =
    typeof value === 'number' ? String(Math.round(value * 1000) / 1000) : value;
  let cache = last.get(el);
  if (!cache) {
    cache = new Map();
    last.set(el, cache);
  }
  if (cache.get(name) === text) return;
  cache.set(name, text);
  el.style.setProperty(name, text);
}

/** Включает или выключает класс, только если состояние изменилось. */
export function setClass(el: Element, name: string, on: boolean) {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}

/** Записывает текст, только если он изменился. */
export function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text;
}

/** Записывает стиль, только если он изменился (для transform/opacity, где переменные не нужны). */
export function setStyle(
  el: HTMLElement,
  prop: 'transform' | 'opacity' | 'clipPath' | 'translate' | 'scale' | 'rotate',
  value: string,
) {
  const key = `@${prop}`;
  let cache = last.get(el);
  if (!cache) {
    cache = new Map();
    last.set(el, cache);
  }
  if (cache.get(key) === value) return;
  cache.set(key, value);
  el.style[prop] = value;
}
