/** 08 Как работаем: ползунок бежит по линии с четырьмя ромбиками; на каждом название шага вырастает, ниже печатается описание. */
import { Typer, splitText } from '../text';
import type { FilmMetrics, SceneFactory } from '../types';
import { clamp, easeIn, easeOut, setClass, setVar, smooth, win } from '../util';

export const createProcess: SceneFactory = (el) => {
  const steps = Array.from(el.querySelectorAll<HTMLElement>('[data-step]')).map(
    (step) => {
      const name = step.querySelector<HTMLElement>('[data-name]')!;
      const text = step.querySelector<HTMLElement>('[data-text]')!;
      return { step, name, typer: new Typer(splitText(text).chars) };
    },
  );
  const line = el.querySelector<HTMLElement>('.process__line');
  const diamonds = Array.from(
    el.querySelectorAll<HTMLElement>('[data-diamond]'),
  );
  const kicker = el.querySelector<HTMLElement>('.kicker');
  const count = steps.length;
  /** Где на линии стоит ромбик номер k (доля ширины). */
  const stop = (k: number) => (k + 0.5) / count;

  return {
    jumpQ: 0.14,
    measure(metrics: FilmMetrics) {
      // название шага вписываем по ширине экрана (но не выше трети высоты)
      steps.forEach(({ name }) => {
        name.style.setProperty('--fit', '100px');
        const lines = Array.from(
          name.querySelectorAll<HTMLElement>('.process__word'),
        );
        const natural = Math.max(...lines.map((l) => l.scrollWidth), 1);
        const rows = Math.max(1, lines.length);
        const byWidth = ((metrics.w * 0.86) / natural) * 100;
        const byHeight = (metrics.h * 0.34) / rows / 0.95;
        name.style.setProperty('--fit', `${Math.min(byWidth, byHeight)}px`);
      });
    },
    update(q) {
      const enter = easeOut(win(q, 0, 0.08));
      const exit = easeIn(win(q, 0.92, 0.98));
      const run = win(q, 0.08, 0.92);
      const head = 0.015 + run * 0.97;
      if (line) {
        setVar(line, '--head', head);
        setVar(line, '--ti', enter);
        setVar(line, '--to', exit);
      }
      if (kicker) {
        setVar(kicker, '--ti', enter);
        setVar(kicker, '--to', exit);
      }
      diamonds.forEach((diamond, k) =>
        setClass(diamond, 'is-passed', head >= stop(k) - 0.004),
      );
      steps.forEach(({ step, name, typer }, k) => {
        const near = clamp(1 - Math.abs(head - stop(k)) / 0.16);
        const grow = smooth(near);
        setVar(step, '--grow', grow);
        setVar(step, '--fade', clamp(grow * 1.4) * (1 - exit));
        typer.set(smooth(clamp((grow - 0.55) / 0.4)));
        setVar(name, '--g', grow);
      });
    },
  };
};
