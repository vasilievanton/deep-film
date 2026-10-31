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
    stops: [0.74],
    update(q) {
      const ring = easeInOut(win(q, 0.08, 0.5));
      setVar(row, '--rd', ring);
      setVar(row, '--dr', easeOut(win(q, 0.12, 0.5)));
      setVar(row, '--wl', spring(win(q, 0.2, 0.56)));
      setVar(row, '--wr', spring(win(q, 0.26, 0.62)));
      setVar(
        row,
        '--pulse',
        smooth(win(q, 0.5, 0.58)) * (1 - smooth(win(q, 0.58, 0.68))),
      );
      setVar(row, '--ro', easeIn(win(q, 0.82, 0.97)));
      if (text) {
        setVar(text, '--ti', easeOut(win(q, 0.5, 0.68)));
        setVar(text, '--to', easeIn(win(q, 0.8, 0.95)));
      }
    },
  };
};
