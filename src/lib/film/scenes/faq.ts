/** 09 Вопросы: пять квадратиков отмечаются по очереди — четыре галочки «Да» и один крестик «Нет». Опорный кадр: все отмечены. */
import type { SceneFactory } from '../types';
import { easeIn, easeOut, setVar, win } from '../util';

export const createFaq: SceneFactory = (el) => {
  const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-row]'));
  const kicker = el.querySelector<HTMLElement>('.kicker');

  return {
    stops: [0.76],
    // строки выезжают по очереди, потом одна за другой отмечаются галочки
    tempo: [
      [0, 0.76, 1.6],
      [0.84, 0.97, 0.25],
    ],
    update(q) {
      rows.forEach((row, k) => {
        const slideFrom = 0.02 + k * 0.05;
        setVar(row, '--ti', easeOut(win(q, slideFrom, slideFrom + 0.26)));
        setVar(row, '--to', easeIn(win(q, 0.84 + k * 0.02, 0.97)));
        const tickFrom = 0.14 + k * 0.1;
        setVar(row, '--tick', easeOut(win(q, tickFrom, tickFrom + 0.2)));
      });
      if (kicker) {
        setVar(kicker, '--ti', easeOut(win(q, 0, 0.1)));
        setVar(kicker, '--to', easeIn(win(q, 0.88, 0.97)));
      }
    },
  };
};
