/**
 * 04 Возможности: восемь названий на вертикальном барабане; активное встаёт на плашку и расшифровывается, ниже печатается описание.
 * Опорные кадры: барабан стоит на каждом из названий (q = 0,1 … 0,9 поровну).
 */
import { Plate, Scrambler, Typer, splitText } from '../text';
import type { FilmMetrics, SceneFactory } from '../types';
import {
  clamp,
  easeIn,
  easeOut,
  pad2,
  setClass,
  setStyle,
  setText,
  setVar,
  smooth,
  win,
} from '../util';

/** Барабан отдыхает у каждого названия: шаг между ними «залипает» у целых значений. */
const detent = (x: number) => {
  const i = Math.floor(x);
  const f = x - i;
  const e = f < 0.5 ? 0.5 * (2 * f) ** 2.4 : 1 - 0.5 * (2 * (1 - f)) ** 2.4;
  return i + e;
};

type Item = {
  el: HTMLElement;
  plate: Plate;
  scrambler: Scrambler;
  typer: Typer;
};

export const createMech: SceneFactory = (el) => {
  const items: Item[] = Array.from(
    el.querySelectorAll<HTMLElement>('[data-item]'),
  ).map((item) => {
    const title = item.querySelector<HTMLElement>('[data-title]')!;
    const summary = item.querySelector<HTMLElement>('[data-summary]')!;
    const titleSplit = splitText(title);
    const summarySplit = splitText(summary);
    return {
      el: item,
      plate: new Plate(title, titleSplit.chars),
      scrambler: new Scrambler(titleSplit.chars),
      typer: new Typer(summarySplit.chars),
    };
  });
  const drum = el.querySelector<HTMLElement>('[data-drum]');
  const counter = el.querySelector<HTMLElement>('[data-counter]');
  const kicker = el.querySelector<HTMLElement>('.kicker');
  let u = 14;

  return {
    stops: items.map((_, k) => 0.1 + 0.8 * (k / Math.max(1, items.length - 1))),
    measure(metrics: FilmMetrics) {
      u = metrics.u;
      // длинные названия («Команды и командные челленджи») сжимаем, чтобы строка не вылезала за экран
      items.forEach((item) => {
        const host = item.plate.host;
        host.style.removeProperty('--fit');
        item.scrambler.measure();
        const fit = Math.min(
          1,
          (metrics.w * 0.84) / Math.max(host.offsetWidth, 1),
        );
        if (fit < 1) {
          host.style.setProperty('--fit', fit.toFixed(3));
          item.scrambler.measure();
        }
        item.plate.measure();
      });
    },
    update(q) {
      const last = items.length - 1;
      const pos = detent(clamp(win(q, 0.1, 0.9) * last, 0, last));
      const enter = easeOut(win(q, 0, 0.1));
      const exit = easeIn(win(q, 0.9, 0.98));
      const step = u * 8.6;
      const gap = u * 6.2;

      items.forEach((item, index) => {
        const d = index - pos;
        const near = clamp(1 - Math.abs(d) * 1.2);
        const y = d * step + gap * clamp(d, 0, 1);
        const tilt = clamp(-d * 24, -62, 62);
        const scale = 0.8 + 0.2 * near;
        const dim = 0.28 + 0.72 * near;
        const fade = clamp(1.6 - Math.abs(d) * 0.55);
        const flight = (1 - enter) * u * 30 + exit * u * -26;
        setStyle(
          item.el,
          'transform',
          `translate3d(${flight}px, ${y}px, 0) rotateX(${tilt}deg) scale(${scale})`,
        );
        setStyle(
          item.el,
          'opacity',
          String(Math.round(dim * fade * enter * (1 - exit) * 100) / 100),
        );
        setClass(item.el, 'is-active', near > 0.82);
        item.plate.set(smooth(win(near, 0.3, 0.78)));
        item.scrambler.set(near);
        item.typer.set(win(near, 0.55, 1));
      });

      if (drum) setVar(drum, '--pos', pos);
      if (counter) setText(counter, pad2(Math.round(pos) + 1));
      if (kicker) {
        setVar(kicker, '--ti', enter);
        setVar(kicker, '--to', exit);
      }
    },
  };
};
