/**
 * 02 Что делаем: предложение печатается с курсором, четыре слова по очереди получают плашку, три адресата подчёркиваются.
 * Опорные кадры: фраза напечатана; плашки и подчёркивания на месте.
 */
import { Plate, Typer, splitText } from '../text';
import type { SceneFactory } from '../types';
import { easeIn, easeOut, setVar, stagger, win } from '../util';

export const createWhat: SceneFactory = (el) => {
  const text = el.querySelector<HTMLElement>('.what__text');
  const body = el.querySelector<HTMLElement>('.scene__body');
  if (!text) return { stops: [0], update() {} };
  const split = splitText(text);
  const typer = new Typer(split.chars);
  const plates = Array.from(
    split.root.querySelectorAll<HTMLElement>('[data-kind="plate"]'),
  ).map(
    (host) =>
      new Plate(host, Array.from(host.querySelectorAll<HTMLElement>('.c'))),
  );
  const unders = Array.from(
    split.root.querySelectorAll<HTMLElement>('[data-kind="under"]'),
  );

  return {
    stops: [0.305, 0.8],
    jumpStop: 1,
    measure() {
      plates.forEach((plate) => plate.measure());
    },
    update(q) {
      const count = split.chars.length;
      typer.set(win(q, 0.03, 0.3), (index) =>
        easeIn(stagger(q, index, count, 0.84, 0.97, 0.8)),
      );
      const out = easeIn(win(q, 0.86, 0.96));
      plates.forEach((plate, k) => {
        const from = 0.31 + k * 0.07;
        plate.set(easeOut(win(q, from, from + 0.075)), out);
      });
      unders.forEach((under, k) => {
        const from = 0.58 + k * 0.05;
        setVar(under, '--ut', easeOut(win(q, from, from + 0.07)));
        setVar(under, '--uo', out);
      });
      if (body) setVar(body, '--drift', q);
    },
  };
};
