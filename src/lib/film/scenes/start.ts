/**
 * 01 Старт: буквы заголовка въезжают сами (по времени), плашка за двумя словами; первый поворот колеса уводит их вправо.
 * На узком экране размер заголовка подбирается так, чтобы самая длинная плашка («Интерактивные») встала во всю ширину.
 */
import { Plate, setChar, splitText } from '../text';
import type { FilmMetrics, SceneFactory } from '../types';
import { easeBack, easeIn, easeOut, setVar, stagger, win } from '../util';

const INTRO_MS = 2400;

export const createStart: SceneFactory = (el) => {
  const title = el.querySelector<HTMLElement>('.start__title');
  const lines = Array.from(
    el.querySelectorAll<HTMLElement>('.start__title > span'),
  );
  const splits = lines.map(splitText);
  const chars = splits.flatMap((split) => split.chars);
  const plates = [0, 1].map((k) => new Plate(lines[k], splits[k].chars));
  const cta = el.querySelector<HTMLElement>('.start__cta');
  let intro = 0;
  let q = 0;
  let started = 0;

  const apply = () => {
    const count = chars.length;
    chars.forEach((char, index) => {
      setChar(
        char,
        easeBack(stagger(intro, index, count, 0, 0.6, 0.85), 1.1),
        easeIn(stagger(q, index, count, 0.08, 0.9, 0.7)),
      );
    });
    plates.forEach((plate, k) => {
      plate.set(
        easeOut(win(intro, 0.4 + k * 0.1, 0.75 + k * 0.1)),
        easeIn(win(q, 0.3 + k * 0.1, 0.84)),
      );
    });
    if (cta) {
      setVar(cta, '--ti', easeOut(win(intro, 0.72, 1)));
      setVar(cta, '--to', easeIn(win(q, 0.02, 0.3)));
    }
  };

  return {
    stops: [0],
    measure(metrics: FilmMetrics) {
      if (title) {
        title.style.removeProperty('--fit');
        if (metrics.tall) {
          // широкая раскладка считает размер в CSS; на узкой самое длинное слово занимает всю ширину
          title.style.setProperty('--fit', '100px');
          const room = title.parentElement?.clientWidth || metrics.w;
          const need = Math.max(
            0.01,
            ...lines.slice(0, 2).map((line) => line.offsetWidth / 100 + 0.44),
          );
          title.style.setProperty(
            '--fit',
            `${Math.min(room / need, metrics.u * 7.4).toFixed(1)}px`,
          );
        }
      }
      plates.forEach((plate) => plate.measure());
      apply();
    },
    update(value) {
      q = value;
      apply();
    },
    frame(now) {
      if (!started) started = now;
      intro = Math.min(1, (now - started) / INTRO_MS);
      apply();
      return intro < 1;
    },
  };
};
