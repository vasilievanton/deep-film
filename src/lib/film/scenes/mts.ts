/** 05 МТС · 30 лет: три карточки с наклоном выезжают с разных сторон, числа докручиваются; под ними строка с фактами. */
import { setChar, splitText } from '../text';
import type { SceneFactory } from '../types';
import {
  easeIn,
  easeOut,
  groupDigits,
  setStyle,
  setText,
  setVar,
  spring,
  stagger,
  win,
} from '../util';

export const createMts: SceneFactory = (el) => {
  const title = el.querySelector<HTMLElement>('.mts__title');
  const titleChars = title ? splitText(title).chars : [];
  const cards = Array.from(el.querySelectorAll<HTMLElement>('.mts__card'));
  const nums = cards.map((card) =>
    card.querySelector<HTMLElement>('[data-num]'),
  );
  const facts = el.querySelector<HTMLElement>('.mts__facts');

  return {
    jumpQ: 0.62,
    update(q) {
      titleChars.forEach((char, index) =>
        setChar(
          char,
          easeOut(stagger(q, index, titleChars.length, 0.02, 0.24, 0.7)),
          easeIn(stagger(q, index, titleChars.length, 0.84, 0.97, 0.7)),
        ),
      );
      cards.forEach((card, k) => {
        setVar(card, '--ti', spring(win(q, 0.1 + k * 0.08, 0.42 + k * 0.08)));
        setVar(card, '--to', easeIn(win(q, 0.82 + k * 0.03, 0.97)));
        const num = nums[k];
        if (!num) return;
        const to = Number(num.dataset.to ?? 0);
        const t = easeOut(win(q, 0.3 + k * 0.08, 0.68 + k * 0.05));
        const value = to * t;
        const text = num.dataset.group
          ? groupDigits(value)
          : String(Math.round(value));
        setText(num, text + (num.dataset.suffix ?? ''));
      });
      if (facts) {
        const reveal = easeOut(win(q, 0.64, 0.8));
        setStyle(facts, 'clipPath', `inset(0 ${(1 - reveal) * 100}% 0 0)`);
        setVar(facts, '--to', easeIn(win(q, 0.84, 0.96)));
      }
    },
  };
};
