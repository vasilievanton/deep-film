/** 10 Финал: жёлтый квадрат вырастает в плашку на всю ширину экрана, на ней проявляется кнопка. Опорный кадр: кнопка на месте. */
import { setChar, splitText } from '../text';
import type { FilmMetrics, SceneFactory } from '../types';
import {
  clamp,
  easeBack,
  easeInOut,
  easeOut,
  lerp,
  setStyle,
  setVar,
  stagger,
  win,
} from '../util';

export const createFinal: SceneFactory = (el) => {
  const bg = el.querySelector<HTMLElement>('.final__bg');
  const stack = el.querySelector<HTMLElement>('.final__stack');
  const title = el.querySelector<HTMLElement>('.final__title');
  const chars = title ? splitText(title).chars : [];
  const text = el.querySelector<HTMLElement>('.final__text');
  const button = el.querySelector<HTMLElement>('.final__btn');
  let w = 1440;
  let h = 900;
  let u = 14;
  let plateH = 500;

  return {
    stops: [0.96],
    measure(metrics: FilmMetrics) {
      ({ w, h, u } = metrics);
      // высота плашки — по содержимому: заголовок, текст и кнопка с полем
      plateH = clamp(
        (stack?.offsetHeight ?? h * 0.5) + u * 13,
        h * 0.5,
        h * 0.92,
      );
    },
    update(q) {
      if (bg) {
        const square = u * 11;
        const pop = easeBack(win(q, 0.02, 0.2), 1.6);
        const grow = easeInOut(win(q, 0.22, 0.56));
        const insetX = lerp((w - square) / 2, 0, grow);
        const insetY = lerp((h - square) / 2, (h - plateH) / 2, grow);
        const radius = lerp(square * 0.1, 8, grow);
        setStyle(
          bg,
          'clipPath',
          `inset(${insetY}px ${insetX}px ${insetY}px ${insetX}px round ${radius}px)`,
        );
        setStyle(bg, 'scale', String(Math.max(0, pop)));
        setStyle(bg, 'rotate', `${(1 - Math.min(1, pop)) * 90}deg`);
      }
      chars.forEach((char, index) =>
        setChar(char, easeOut(stagger(q, index, chars.length, 0.54, 0.8, 0.8))),
      );
      if (text) setVar(text, '--ti', easeOut(win(q, 0.72, 0.84)));
      if (button) setVar(button, '--ti', easeBack(win(q, 0.8, 0.94), 1.4));
    },
  };
};
