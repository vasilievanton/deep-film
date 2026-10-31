/** 03 Скорость: кольцо дорисовывается, цифра докручивается от 0 до значения, «от» и «недели» доезжают с двух сторон. Опорный кадр: всё собрано. */
import type { SceneFactory } from '../types';
import {
  easeIn,
  easeInOut,
  easeOut,
  setVar,
  smooth,
  spring,
  win,
} from '../util';

export const createSpeed: SceneFactory = (el) => {
  const row = el.querySelector<HTMLElement>('.speed__row');
  const text = el.querySelector<HTMLElement>('.speed__text');
  if (!row) return { stops: [0], update() {} };

  return {
    stops: [0.8],
    // кольцо и цифра идут почти две секунды, слова доезжают с боков, под конец проявляется строка
    tempo: [
      [0.04, 0.8, 1.8],
      [0.82, 0.97, 0.25],
    ],
    update(q) {
      const ring = easeInOut(win(q, 0.04, 0.62));
      setVar(row, '--rd', ring);
      setVar(row, '--dr', easeOut(win(q, 0.04, 0.6)));
      setVar(row, '--wl', spring(win(q, 0.3, 0.72)));
      setVar(row, '--wr', spring(win(q, 0.36, 0.78)));
      setVar(
        row,
        '--pulse',
        smooth(win(q, 0.58, 0.66)) * (1 - smooth(win(q, 0.66, 0.76))),
      );
      setVar(row, '--ro', easeIn(win(q, 0.82, 0.97)));
      if (text) {
        setVar(text, '--ti', easeOut(win(q, 0.56, 0.78)));
        setVar(text, '--to', easeIn(win(q, 0.82, 0.95)));
      }
    },
  };
};
