/** МТС · 30 лет: три карточки с наклоном выезжают с разных сторон, числа докручиваются; под ними строка с фактами. Опорный кадр: числа докручены, строка фактов открыта. */
import { setChar, splitText } from '../text';
import type { SceneFactory } from '../types';
import {
  easeIn,
  easeOut,
  easeOutQuad,
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
    stops: [0.82],
    // карточки выезжают по очереди, каждое число считается около секунды, под конец открывается строка фактов
    tempo: [
      [0, 0.82, 1.65],
      [0.84, 0.97, 0.25],
    ],
    update(q) {
      titleChars.forEach((char, index) =>
        setChar(
          char,
          easeOut(stagger(q, index, titleChars.length, 0.02, 0.28, 0.7)),
          easeIn(stagger(q, index, titleChars.length, 0.84, 0.97, 0.7)),
        ),
      );
      cards.forEach((card, k) => {
        setVar(card, '--ti', spring(win(q, 0.04 + k * 0.08, 0.4 + k * 0.08)));
        setVar(card, '--to', easeIn(win(q, 0.84 + k * 0.03, 0.97)));
        const num = nums[k];
        if (!num) return;
        const to = Number(num.dataset.to ?? 0);
        const t = easeOutQuad(win(q, 0.12 + k * 0.08, 0.62 + k * 0.08));
        const value = to * t;
        const text = num.dataset.group
          ? groupDigits(value)
          : String(Math.round(value));
        setText(num, text + (num.dataset.suffix ?? ''));
      });
      if (facts) {
        const reveal = easeOut(win(q, 0.62, 0.8));
        setStyle(facts, 'clipPath', `inset(0 ${(1 - reveal) * 100}% 0 0)`);
        setVar(facts, '--to', easeIn(win(q, 0.86, 0.96)));
      }
    },
  };
};
