/** 09 Вопросы: пять квадратиков отмечаются по очереди — четыре галочки «Да» и один крестик «Нет». */
import type { SceneFactory } from '../types';
import { easeIn, easeOut, setVar, win } from '../util';

export const createFaq: SceneFactory = (el) => {
  const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-row]'));
  const kicker = el.querySelector<HTMLElement>('.kicker');

  return {
    jumpQ: 0.85,
    update(q) {
      rows.forEach((row, k) => {
        const slideFrom = 0.03 + k * 0.045;
        setVar(row, '--ti', easeOut(win(q, slideFrom, slideFrom + 0.16)));
        setVar(row, '--to', easeIn(win(q, 0.84 + k * 0.02, 0.97)));
        const tickFrom = 0.22 + k * 0.125;
        setVar(row, '--tick', easeOut(win(q, tickFrom, tickFrom + 0.1)));
      });
      if (kicker) {
        setVar(kicker, '--ti', easeOut(win(q, 0, 0.1)));
        setVar(kicker, '--to', easeIn(win(q, 0.88, 0.97)));
      }
    },
  };
};
