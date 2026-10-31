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
  hopTempo,
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
  /** Заголовок с названием бренда и слово внутри него (нужны, чтобы вписать длинное название в узкий кадр). */
  brandHost: HTMLElement | null;
  brandWord: HTMLElement | null;
  brand: HTMLElement[];
  fresh: Typer | null;
  old: HTMLElement | null;
  plain: Typer | null;
};

export const createCases: SceneFactory = (el) => {
  const strip = el.querySelector<HTMLElement>('[data-strip]');
  const kicker = el.querySelector<HTMLElement>('.kicker');
  const digits = el.querySelector<HTMLElement>('[data-digits]');
  const hint = el.querySelector<HTMLElement>('[data-hint]');
  const frameEls = Array.from(el.querySelectorAll<HTMLElement>('[data-frame]'));
  const frames: Frame[] = frameEls.map((frame) => {
    const brand = frame.querySelector<HTMLElement>('[data-brand]');
    const fresh = frame.querySelector<HTMLElement>('[data-fresh]');
    const old = frame.querySelector<HTMLElement>('[data-old]');
    const line = frame.querySelector<HTMLElement>('[data-line]');
    const plain = line && !fresh ? splitText(line) : null;
    return {
      el: frame,
      brandHost: frame.querySelector<HTMLElement>('.frame__brand'),
      brandWord: brand,
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
    const raw = clamp(s * last, 0, last);
    // лента отдыхает у каждого кадра (detent), а эффекты кадра идут по ровному ходу (`raw`): иначе всё, что
    // привязано к сближению, сжималось в короткий кусок середины перехода (зачёркивание успевало за 60 мс)
    const pos = detent(raw);
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
    return { pos, raw };
  };

  const stops = frameEls.map((_, k) => 0.08 + 0.84 * (k / last));

  return {
    stops,
    // лента едет влево, как карусель: на телефоне её хочется листать вбок, и свайп вбок тоже работает
    sideways: true,
    // кадр подъезжает недолго, а название бренда, зачёркивание и новая строка проигрываются без спешки
    tempo: [
      [0, 0.08, 0.6],
      ...hopTempo(stops, [
        [0, 0.35, 0.25],
        [0.35, 1, 1.1],
      ]),
      [0.94, 0.99, 0.28],
    ],
    measure(metrics: FilmMetrics) {
      width = metrics.w;
      // узкий кадр: название бренда, которое не помещается («Headhunter»), уменьшаем, чтобы оно не вылезало за рамку
      frames.forEach(({ brandHost, brandWord }) => {
        brandHost?.style.removeProperty('--fit');
        if (!metrics.tall || !brandHost || !brandWord) return;
        const room = brandHost.clientWidth;
        const need = brandWord.offsetWidth;
        if (need > room && room > 0) {
          brandHost.style.setProperty('--fit', (room / need).toFixed(3));
        }
      });
      travel = strip ? Math.max(0, strip.scrollWidth - metrics.w) : 0;
    },
    stopFor(target) {
      const index = frameEls.findIndex((frame) => frame.contains(target));
      return index < 0 ? null : index;
    },
    update(q) {
      const { pos, raw } = place(q);
      if (kicker) {
        setVar(kicker, '--ti', easeOut(win(q, 0, 0.08)));
        setVar(kicker, '--to', easeIn(win(q, 0.94, 0.99)));
      }
      if (digits) setVar(digits, '--roll', Math.min(pos, last - 1));
      // подсказка «листайте вниз» стоит всю сцену: лента похожа на карусель, а на крайних кадрах свайп вбок
      // ничего не листает, и без подсказки человек решил бы, что кейсы кончились
      if (hint) {
        setVar(
          hint,
          '--hint',
          easeOut(win(q, 0, 0.08)) * (1 - easeIn(win(q, 0.94, 0.99))),
        );
      }
      frames.forEach((frame, index) => {
        const near = clamp(1 - Math.abs(index - pos) / 0.9);
        const fx = clamp(1 - Math.abs(index - raw) / 0.9);
        setVar(frame.el, '--near', near);
        frame.brand.forEach((char, k) =>
          setChar(
            char,
            easeOut(stagger(fx, k, frame.brand.length, 0.17, 0.5, 0.7)),
          ),
        );
        if (frame.old && frame.fresh) {
          setVar(frame.old, '--st', easeOut(win(fx, 0.47, 0.76)));
          setVar(frame.old, '--sd', smooth(win(fx, 0.69, 0.84)));
          frame.fresh.set(win(fx, 0.71, 0.97));
        }
        if (frame.plain) frame.plain.set(win(fx, 0.33, 0.97));
      });
    },
  };
};
