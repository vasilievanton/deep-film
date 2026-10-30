/** Размеры кадра: `u` — «единица кадра» в пикселях (1u = 1 % ширины на 16:9, на низких окнах меньше). */
export type FilmMetrics = { w: number; h: number; u: number };

/** Поведение одной сцены. Все сцены двигаются по прогрессу `q` от 0 до 1; обратная прокрутка даёт то же состояние. */
export interface SceneController {
  /** Замеры, зависящие от вёрстки: вызывается после загрузки шрифтов и при изменении размера окна. */
  measure?(metrics: FilmMetrics): void;
  /** Состояние сцены при прогрессе `q`. Вызывается только для видимой сцены. */
  update(q: number): void;
  /** Покадровая анимация по времени (вступление первой сцены). Вернуть true, пока нужны ещё кадры. */
  frame?(now: number): boolean;
  /** Прогресс `q`, на котором виден нужный элемент `data-case` (для ссылок «к кейсу»). */
  anchorFor?(el: HTMLElement): number | null;
  /** Прогресс `q`, к которому прокручиваем из списка сцен. */
  jumpQ?: number;
}

export type SceneFactory = (el: HTMLElement) => SceneController;
