/** 02 Что делаем: предложение печатается с курсором, четыре слова по очереди получают плашку, три адресата подчёркиваются. */
import { Plate, Typer, splitText } from '../text';
import type { SceneFactory } from '../types';
import { easeIn, easeOut, setVar, stagger, win } from '../util';

export const createWhat: SceneFactory = (el) => {
  const text = el.querySelector<HTMLElement>('.what__text');
  const body = el.querySelector<HTMLElement>('.scene__body');
  if (!text) return { update() {} };
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
    jumpQ: 0.55,
    measure() {
      plates.forEach((plate) => plate.measure());
    },
    update(q) {
      const count = split.chars.length;
      typer.set(win(q, 0.03, 0.33), (index) =>
        easeIn(stagger(q, index, count, 0.8, 0.96, 0.8)),
      );
      const out = easeIn(win(q, 0.84, 0.95));
      plates.forEach((plate, k) => {
        const from = 0.34 + k * 0.075;
        plate.set(easeOut(win(q, from, from + 0.08)), out);
      });
      unders.forEach((under, k) => {
        const from = 0.64 + k * 0.055;
        setVar(under, '--ut', easeOut(win(q, from, from + 0.075)));
        setVar(under, '--uo', out);
      });
      if (body) setVar(body, '--drift', q);
    },
  };
};
