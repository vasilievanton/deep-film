/**
 * Сигнал «получилось!». Компонент сообщает о приятном моменте (результат теста, обмен баллов в демо-шопе,
 * отправленная заявка), а слой эффектов (`Interactions`, см. `lib/fx/confetti.ts`) решает, показывать ли
 * конфетти: при `prefers-reduced-motion` слушателя нет и сигнал ничего не делает.
 */
export const CELEBRATE_EVENT = 'deep:celebrate';

/** Точка на экране (в координатах окна), откуда разлетается конфетти. */
export type CelebrateDetail = { x: number; y: number; count?: number };

/** Конфетти из центра элемента (без элемента — из верхней трети экрана); `count` — сколько фигурок. */
export function celebrate(origin?: Element | null, count?: number) {
  if (typeof window === 'undefined') return;
  const rect = origin?.getBoundingClientRect();
  const detail: CelebrateDetail = rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, count }
    : { x: window.innerWidth / 2, y: window.innerHeight / 3, count };
  window.dispatchEvent(
    new CustomEvent<CelebrateDetail>(CELEBRATE_EVENT, { detail }),
  );
}
