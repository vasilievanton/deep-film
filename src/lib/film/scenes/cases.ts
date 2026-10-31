/**
 * Остальные кейсы: лента плёнки едет влево; номер кадра докручивается; «не X, а Y» подаётся зачёркиванием и печатью.
 * Опорные кадры: лента стоит на каждом кадре (q = 0,08 … 0,92 поровну).
 */
import { Typer, setChar, splitText } from '../text';
import type { FilmMetrics, SceneFactory } from '../types';
import {
  clamp,
  easeIn,
  easeOut,
  setStyle,
  setVar,
  smooth,
  stagger,
  win,
} from '../util';

/** Лента отдыхает на каждом кадре. */
const detent = (x: number) => {
  const i = Math.floor(x);
  const f = x - i;
  const e = f < 0.5 ? 0.5 * (2 * f) ** 2.2 : 1 - 0.5 * (2 * (1 - f)) ** 2.2;
  return i + e;
};

type Frame = {
  el: HTMLElement;
  brand: HTMLElement[];
  fresh: Typer | null;
  old: HTMLElement | null;
  plain: Typer | null;
};

export const createCases: SceneFactory = (el) => {
  const strip = el.querySelector<HTMLElement>('[data-strip]');
  const kicker = el.querySelector<HTMLElement>('.kicker');
  const digits = el.querySelector<HTMLElement>('[data-digits]');
  const frameEls = Array.from(el.querySelectorAll<HTMLElement>('[data-frame]'));
  const frames: Frame[] = frameEls.map((frame) => {
    const brand = frame.querySelector<HTMLElement>('[data-brand]');
    const fresh = frame.querySelector<HTMLElement>('[data-fresh]');
    const old = frame.querySelector<HTMLElement>('[data-old]');
    const line = frame.querySelector<HTMLElement>('[data-line]');
    const plain = line && !fresh ? splitText(line) : null;
    return {
      el: frame,
      brand: brand ? splitText(brand).chars : [],
      fresh: fresh ? new Typer(splitText(fresh).chars) : null,
      old,
      plain: plain ? new Typer(plain.chars) : null,
    };
  });
  let width = 1440;
  let travel = 0;
  const last = Math.max(1, frameEls.length - 1);

  const place = (q: number) => {
    const enter = easeOut(win(q, 0, 0.08));
    const exit = easeIn(win(q, 0.94, 0.99));
    const s = win(q, 0.08, 0.92);
    const pos = detent(clamp(s * last, 0, last));
    const x =
      -(pos / last) * travel + (1 - enter) * width * 0.45 - exit * width * 0.6;
    if (strip) {
      setStyle(strip, 'transform', `translate3d(${x}px, 0, 0)`);
      setStyle(
        strip,
        'opacity',
        String(Math.round(enter * (1 - exit) * 100) / 100),
      );
    }
    return pos;
  };

  return {
    stops: frameEls.map((_, k) => 0.08 + 0.84 * (k / last)),
    measure(metrics: FilmMetrics) {
      width = metrics.w;
      travel = strip ? Math.max(0, strip.scrollWidth - metrics.w) : 0;
    },
    stopFor(target) {
      const index = frameEls.findIndex((frame) => frame.contains(target));
      return index < 0 ? null : index;
    },
    update(q) {
      const pos = place(q);
      if (kicker) {
        setVar(kicker, '--ti', easeOut(win(q, 0, 0.08)));
        setVar(kicker, '--to', easeIn(win(q, 0.94, 0.99)));
      }
      if (digits) setVar(digits, '--roll', Math.min(pos, last - 1));
      frames.forEach((frame, index) => {
        const near = clamp(1 - Math.abs(index - pos) / 0.9);
        const u = smooth(near);
        setVar(frame.el, '--near', near);
        frame.brand.forEach((char, k) =>
          setChar(
            char,
            easeOut(stagger(u, k, frame.brand.length, 0.05, 0.5, 0.7)),
          ),
        );
        if (frame.old && frame.fresh) {
          setVar(frame.old, '--st', easeOut(win(u, 0.52, 0.76)));
          setVar(frame.old, '--sd', smooth(win(u, 0.7, 0.86)));
          frame.fresh.set(win(u, 0.78, 1));
        }
        if (frame.plain) frame.plain.set(win(u, 0.45, 0.95));
      });
    },
  };
};
