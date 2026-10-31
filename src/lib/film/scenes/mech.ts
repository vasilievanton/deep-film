/**
 * 04 Возможности: восемь названий на вертикальном барабане; активное встаёт на плашку и расшифровывается, ниже печатается описание.
 * Опорные кадры: барабан стоит на каждом из названий (q = 0,1 … 0,9 поровну).
 * Узкая раскладка: названия переносятся на несколько строк, поэтому расстояния между ними не одинаковые. Для каждого
 * положения барабана («стоим на названии a») заранее считаем, где чей верх, а между положениями плавно перетекаем.
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
  summary: HTMLElement;
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
      summary,
    };
  });
  const drum = el.querySelector<HTMLElement>('[data-drum]');
  const counter = el.querySelector<HTMLElement>('[data-counter]');
  const kicker = el.querySelector<HTMLElement>('.kicker');
  let u = 14;
  let tall = false;
  /** Узкая раскладка: tallY[a][i] — где верх названия i, когда барабан стоит на названии a (px от верха барабана). */
  let tallY: number[][] = [];

  /** Плашка за многострочным названием не шире самой длинной строки. */
  const hug = (item: Item) => {
    const host = item.plate.host;
    host.style.removeProperty('width');
    let right = 0;
    item.plate.chars.forEach((char) => {
      right = Math.max(right, char.offsetLeft + char.offsetWidth);
    });
    if (right > 0) host.style.width = `${Math.ceil(right) + 1}px`;
  };

  const layoutTall = (metrics: FilmMetrics) => {
    const count = items.length;
    const room = drum?.clientHeight || metrics.h * 0.7;
    const titleH = items.map((item) => item.plate.host.offsetHeight);
    const summaryH = items.map((item) => item.summary.offsetHeight);
    const gapBelowTitle =
      parseFloat(getComputedStyle(items[0].summary).marginTop) || u * 1.2;
    const gapAfterSummary = u * 2.4;
    const gapNear = u * 1.2;
    // соседние названия уменьшены в 0,8 раза (см. update), поэтому и места занимают меньше
    const far = 0.8;
    const top = room * 0.3;
    tallY = items.map((_, active) => {
      const ys = new Array<number>(count).fill(0);
      ys[active] = top;
      let y =
        top +
        titleH[active] +
        gapBelowTitle +
        summaryH[active] +
        gapAfterSummary;
      for (let i = active + 1; i < count; i += 1) {
        ys[i] = y;
        y += titleH[i] * far + gapNear;
      }
      y = top - gapNear;
      for (let i = active - 1; i >= 0; i -= 1) {
        ys[i] = y - titleH[i] * far;
        y = ys[i] - gapNear;
      }
      return ys;
    });
  };

  return {
    stops: items.map((_, k) => 0.1 + 0.8 * (k / Math.max(1, items.length - 1))),
    measure(metrics: FilmMetrics) {
      u = metrics.u;
      tall = metrics.tall;
      items.forEach((item) => {
        const host = item.plate.host;
        host.style.removeProperty('--fit');
        host.style.removeProperty('width');
        item.scrambler.measure();
        if (tall) {
          hug(item);
        } else {
          // длинные названия («Команды и командные челленджи») сжимаем, чтобы строка не вылезала за экран
          const fit = Math.min(
            1,
            (metrics.w * 0.84) / Math.max(host.offsetWidth, 1),
          );
          if (fit < 1) {
            host.style.setProperty('--fit', fit.toFixed(3));
            item.scrambler.measure();
          }
        }
        item.plate.measure();
      });
      if (tall) layoutTall(metrics);
      else tallY = [];
    },
    update(q) {
      const last = items.length - 1;
      const pos = detent(clamp(win(q, 0.1, 0.9) * last, 0, last));
      const enter = easeOut(win(q, 0, 0.1));
      const exit = easeIn(win(q, 0.9, 0.98));
      const step = u * 8.6;
      const gap = u * 6.2;
      const lo = Math.floor(pos);
      const hi = Math.min(last, lo + 1);
      const part = pos - lo;
      const useTall = tall && tallY.length === items.length;

      items.forEach((item, index) => {
        const d = index - pos;
        const near = clamp(1 - Math.abs(d) * 1.2);
        const y = useTall
          ? tallY[lo][index] + (tallY[hi][index] - tallY[lo][index]) * part
          : d * step + gap * clamp(d, 0, 1);
        const tilt = clamp(-d * 24, -62, 62);
        const scale = 0.8 + 0.2 * near;
        const dim = 0.28 + 0.72 * near;
        // на узком экране ниже названия видно дальше: места по вертикали больше
        const fade = clamp((useTall ? 2.2 : 1.6) - Math.abs(d) * 0.55);
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

      if (counter) setText(counter, pad2(Math.round(pos) + 1));
      if (kicker) {
        setVar(kicker, '--ti', enter);
        setVar(kicker, '--to', exit);
      }
    },
  };
};
