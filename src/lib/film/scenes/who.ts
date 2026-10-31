/** Для кого: заголовок в центре, шесть плашек влетают с краёв с наклоном и пружиной и встают вокруг. Опорный кадр: все плашки на местах. */
import { setChar, splitText } from '../text';
import type { SceneFactory } from '../types';
import { easeIn, setVar, spring, stagger, win } from '../util';

export const createWho: SceneFactory = (el) => {
  const title = el.querySelector<HTMLElement>('.who__title');
  const chars = title ? splitText(title).chars : [];
  const items = Array.from(
    el.querySelectorAll<HTMLElement>('[data-plate-item]'),
  );

  return {
    stops: [0.7],
    // заголовок и шесть плашек занимают весь вход: сцена собирается секунды полторы, а не за полсекунды
    tempo: [
      [0, 0.7, 1.7],
      [0.8, 0.97, 0.25],
    ],
    update(q) {
      chars.forEach((char, index) =>
        setChar(
          char,
          spring(stagger(q, index, chars.length, 0.02, 0.36, 0.75)),
          easeIn(stagger(q, index, chars.length, 0.84, 0.97, 0.7)),
        ),
      );
      items.forEach((item, k) => {
        const from = 0.04 + k * 0.055;
        setVar(item, '--ti', spring(win(q, from, from + 0.38)));
        setVar(item, '--to', easeIn(win(q, 0.8 + k * 0.025, 0.97)));
      });
    },
  };
};
