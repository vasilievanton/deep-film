/** 07 Для кого: заголовок в центре, шесть плашек влетают с краёв с наклоном и пружиной и встают вокруг. */
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
    jumpQ: 0.55,
    update(q) {
      chars.forEach((char, index) =>
        setChar(
          char,
          spring(stagger(q, index, chars.length, 0.02, 0.3, 0.75)),
          easeIn(stagger(q, index, chars.length, 0.84, 0.97, 0.7)),
        ),
      );
      items.forEach((item, k) => {
        const from = 0.06 + k * 0.05;
        setVar(item, '--ti', spring(win(q, from, from + 0.3)));
        setVar(item, '--to', easeIn(win(q, 0.8 + k * 0.025, 0.97)));
      });
    },
  };
};
