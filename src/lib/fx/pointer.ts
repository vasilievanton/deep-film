/**
 * Движения от мыши. Работают только с «настоящей» мышью (hover: hover и pointer: fine) и только когда анимации
 * не выключены в системе (подключает `Interactions`). На тач-экранах всего этого нет.
 *
 * Что происходит:
 *  • карточки (`TILT_TARGETS`) чуть наклоняются в сторону курсора, а значок на них сдвигается глубже;
 *  • главные кнопки (`MAGNET_SELECTOR`) «притягиваются» к курсору, а заливка при наведении расходится
 *    от точки, где курсор вошёл (и сворачивается к точке, где вышел);
 *  • наклейки первого экрана и финального блока смещаются на разную глубину за мышью, а слайдер «поворачивает
 *    взгляд»: у него сдвигается точка схода перспективы;
 *  • значок на карточке (`WIGGLE_TARGETS`) один раз качается, когда курсор заходит на карточку.
 *
 * Как устроено: один слушатель pointermove на весь документ, расчёт — один раз за кадр (requestAnimationFrame),
 * значения плавно догоняют цель (экспоненциальное сглаживание), а когда всё улеглось, цикл засыпает. Результат
 * записывается в CSS-переменные элемента (`--rx`, `--ry`, `--nx`, `--ny`, `--mx`, `--my`, `--ox`, `--oy`),
 * а как именно они выглядят — решает motion.css. Только transform / translate / perspective-origin:
 * без перерасчёта вёрстки.
 */

type Cleanup = () => void;

/** Карточки, которые наклоняются за мышью: селектор и наибольший угол в градусах. */
const TILT_TARGETS: ReadonlyArray<readonly [selector: string, max: number]> = [
  ['.audience-card, .process-step', 5],
  ['.case-visual', 2],
];
const TILT_SELECTOR = TILT_TARGETS.map(([selector]) => selector).join(', ');

/** Кнопки, которые тянутся к курсору и красятся «от точки входа». */
const MAGNET_SELECTOR =
  '.arrow-button, .brief-button, .compact-cta, .hero__secondary, .final-cta__ghost, .mechanics__try';
/** Насколько кнопка смещается: доля расстояния от центра и предел в пикселях. */
const MAGNET_PULL_X = 0.22;
const MAGNET_PULL_Y = 0.34;
const MAGNET_MAX_X = 9;
const MAGNET_MAX_Y = 6;

/** Значки, которые качаются, когда курсор заходит на карточку: селектор карточки и селектор значка в ней. */
const WIGGLE_TARGETS: ReadonlyArray<readonly [card: string, art: string]> = [
  ['.mechanic-card', '.mechanic-art'],
  ['.audience-card', '.audience-card__art'],
  ['.process-step', '.process-step__num'],
  ['.telegram-banner', '.icon-tile'],
];
const WIGGLE_CARDS = WIGGLE_TARGETS.map(([card]) => card).join(', ');
/** Качание прибавляется к текущему повороту значка (наклон и выпрямление при наведении остаются). */
const WIGGLE_KEYFRAMES = { rotate: ['0deg', '-9deg', '6deg', '-2deg', '0deg'] };

/** Постоянная времени сглаживания, мс: чем больше, тем плавнее и «тяжелее» следует за мышью. */
const SMOOTH_MS = 90;
/** Область, где значение считается «улёгшимся». */
const EPS = 0.002;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Текущее значение (x, y) и цель (tx, ty), к которой оно плавно тянется. */
interface Spring {
  x: number;
  y: number;
  tx: number;
  ty: number;
}
const follow = (spring: Spring, k: number) => {
  spring.x += (spring.tx - spring.x) * k;
  spring.y += (spring.ty - spring.y) * k;
};
const atRest = (spring: Spring) =>
  spring.tx === 0 &&
  spring.ty === 0 &&
  Math.abs(spring.x) < EPS &&
  Math.abs(spring.y) < EPS;
const moving = (spring: Spring) =>
  Math.abs(spring.tx - spring.x) > EPS || Math.abs(spring.ty - spring.y) > EPS;

interface Tilt extends Spring {
  el: HTMLElement;
  max: number;
}
interface Magnet extends Spring {
  el: HTMLElement;
}
/** Область, в которой мышь двигает группу объектов (наклейки, слайдер). */
interface Field extends Spring {
  root: HTMLElement;
  /** На сколько пикселей область шире своего блока. */
  pad: number;
  visible: boolean;
  /** Значения сейчас записаны в стили (нужно вернуть). */
  on: boolean;
  apply(x: number, y: number): void;
  clear(): void;
}

function tiltMax(el: Element) {
  for (const [selector, max] of TILT_TARGETS) {
    if (el.matches(selector)) return max;
  }
  return 4;
}

function releaseTilt(el: HTMLElement) {
  el.removeAttribute('data-tilting');
  for (const name of ['--rx', '--ry', '--nx', '--ny']) {
    el.style.removeProperty(name);
  }
}
function releaseMagnet(el: HTMLElement) {
  el.style.removeProperty('--mx');
  el.style.removeProperty('--my');
}

/** Наклейки, которые смещаются на свою «глубину» за мышью: `--depth` (по горизонтали) и `--depth-y` (по вертикали, по умолчанию как `--depth`), в px у самой наклейки. */
function stickerField(
  rootSelector: string,
  itemSelector: string,
): Field | null {
  const root = document.querySelector<HTMLElement>(rootSelector);
  if (!root) return null;
  const items = Array.from(
    root.querySelectorAll<HTMLElement>(itemSelector),
  ).map((el, index) => {
    const style = getComputedStyle(el);
    const depth =
      Number.parseFloat(style.getPropertyValue('--depth')) ||
      (index % 2 ? -14 : 14);
    const depthY = Number.parseFloat(style.getPropertyValue('--depth-y'));
    return { el, depth, depthY: Number.isNaN(depthY) ? depth : depthY };
  });
  if (!items.length) return null;
  return {
    root,
    pad: 0,
    visible: true,
    on: false,
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    apply(x, y) {
      for (const { el, depth, depthY } of items) {
        el.style.transform = `translate(${(x * depth).toFixed(2)}px, ${(y * depthY).toFixed(2)}px)`;
      }
    },
    clear() {
      for (const { el } of items) el.style.removeProperty('transform');
    },
  };
}

/** Слайдер первого экрана: за мышью уходит точка схода перспективы, и боковые карточки «поворачиваются». */
function sliderField(): Field | null {
  const stage = document.querySelector<HTMLElement>('.showcase__stage');
  const space = stage?.querySelector<HTMLElement>('.showcase__space');
  if (!stage || !space) return null;
  return {
    root: stage,
    pad: 90,
    visible: true,
    on: false,
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    apply(x, y) {
      space.style.perspectiveOrigin = `${(50 + x * 14).toFixed(2)}% ${(40 + y * 12).toFixed(2)}%`;
    },
    clear() {
      space.style.removeProperty('perspective-origin');
    },
  };
}

export function startPointerEffects(): Cleanup {
  const media = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!media.matches) return () => {};

  let px = 0;
  let py = 0;
  let inside = false;
  let target: Element | null = null;
  let frame = 0;
  let last = 0;

  const tilts = new Map<HTMLElement, Tilt>();
  const magnets = new Map<HTMLElement, Magnet>();
  let hoveredTilt: HTMLElement | null = null;
  let hoveredMagnet: HTMLElement | null = null;

  const fields = [
    stickerField('.hero', '.hero__stickers .sticker'),
    stickerField('.final-cta', '.final-cta__art .sticker'),
    sliderField(),
  ].filter((field): field is Field => field !== null);

  // группа, которой нет на экране, мышь не двигает
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          for (const entry of entries) {
            const field = fields.find((item) => item.root === entry.target);
            if (field) field.visible = entry.isIntersecting;
          }
        });
  for (const field of fields) observer?.observe(field.root);

  /** Положение курсора относительно центра блока: от −1 до 1 по каждой оси. */
  function aim(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    // размер берём без учёта наклона самого блока, центр — из рамки: при повороте вокруг центра он не плывёт
    const halfW = (el.offsetWidth || rect.width) / 2;
    const halfH = (el.offsetHeight || rect.height) / 2;
    return {
      dx: px - (rect.left + rect.width / 2),
      dy: py - (rect.top + rect.height / 2),
      nx: halfW ? clamp((px - (rect.left + rect.width / 2)) / halfW, -1, 1) : 0,
      ny: halfH ? clamp((py - (rect.top + rect.height / 2)) / halfH, -1, 1) : 0,
    };
  }

  function tick(now: number) {
    frame = 0;
    const dt = last ? Math.min(48, now - last) : 16;
    last = now;
    const k = 1 - Math.exp(-dt / SMOOTH_MS);
    let busy = false;

    const point = inside && target?.isConnected ? target : null;

    // ───── наклон карточек ─────
    const tiltEl = point ? point.closest<HTMLElement>(TILT_SELECTOR) : null;
    if (tiltEl !== hoveredTilt) {
      const old = hoveredTilt ? tilts.get(hoveredTilt) : undefined;
      if (old) {
        old.tx = 0;
        old.ty = 0;
      }
      hoveredTilt = tiltEl;
      if (tiltEl && !tilts.has(tiltEl)) {
        tilts.set(tiltEl, {
          el: tiltEl,
          max: tiltMax(tiltEl),
          x: 0,
          y: 0,
          tx: 0,
          ty: 0,
        });
        tiltEl.setAttribute('data-tilting', '');
      }
    }
    const active = hoveredTilt ? tilts.get(hoveredTilt) : undefined;
    if (active) {
      const { nx, ny } = aim(active.el);
      active.tx = nx;
      active.ty = ny;
    }
    for (const tilt of tilts.values()) {
      follow(tilt, k);
      if (atRest(tilt) && tilt.el !== hoveredTilt) {
        releaseTilt(tilt.el);
        tilts.delete(tilt.el);
        continue;
      }
      const { el, max, x, y } = tilt;
      // курсор у края «вдавливает» его: правый край уходит вглубь (+Y), нижний — к зрителю (−X)
      el.style.setProperty('--rx', `${(-y * max).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${(x * max).toFixed(2)}deg`);
      el.style.setProperty('--nx', x.toFixed(3));
      el.style.setProperty('--ny', y.toFixed(3));
      if (moving(tilt)) busy = true;
    }

    // ───── магнитные кнопки ─────
    const magnetEl = point ? point.closest<HTMLElement>(MAGNET_SELECTOR) : null;
    if (magnetEl !== hoveredMagnet) {
      const old = hoveredMagnet ? magnets.get(hoveredMagnet) : undefined;
      if (old) {
        old.tx = 0;
        old.ty = 0;
      }
      hoveredMagnet = magnetEl;
      if (magnetEl && !magnets.has(magnetEl)) {
        magnets.set(magnetEl, { el: magnetEl, x: 0, y: 0, tx: 0, ty: 0 });
      }
    }
    const pulled = hoveredMagnet ? magnets.get(hoveredMagnet) : undefined;
    if (pulled) {
      const { dx, dy } = aim(pulled.el);
      pulled.tx = clamp(dx * MAGNET_PULL_X, -MAGNET_MAX_X, MAGNET_MAX_X);
      pulled.ty = clamp(dy * MAGNET_PULL_Y, -MAGNET_MAX_Y, MAGNET_MAX_Y);
    }
    for (const magnet of magnets.values()) {
      follow(magnet, k);
      if (atRest(magnet) && magnet.el !== hoveredMagnet) {
        releaseMagnet(magnet.el);
        magnets.delete(magnet.el);
        continue;
      }
      magnet.el.style.setProperty('--mx', `${magnet.x.toFixed(2)}px`);
      magnet.el.style.setProperty('--my', `${magnet.y.toFixed(2)}px`);
      if (moving(magnet)) busy = true;
    }

    // ───── наклейки и слайдер ─────
    for (const field of fields) {
      let tx = 0;
      let ty = 0;
      if (point && field.visible) {
        const rect = field.root.getBoundingClientRect();
        const within =
          px >= rect.left - field.pad &&
          px <= rect.right + field.pad &&
          py >= rect.top - field.pad &&
          py <= rect.bottom + field.pad;
        if (within) {
          tx = clamp(
            (px - (rect.left + rect.width / 2)) / (rect.width / 2),
            -1,
            1,
          );
          ty = clamp(
            (py - (rect.top + rect.height / 2)) / (rect.height / 2),
            -1,
            1,
          );
        }
      }
      field.tx = tx;
      field.ty = ty;
      if (!field.on && atRest(field)) continue;
      follow(field, k * 0.75);
      if (atRest(field)) {
        field.clear();
        field.on = false;
      } else {
        field.apply(field.x, field.y);
        field.on = true;
      }
      if (moving(field)) busy = true;
    }

    if (busy) schedule();
  }

  function schedule() {
    if (!frame) frame = window.requestAnimationFrame(tick);
  }

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    px = event.clientX;
    py = event.clientY;
    inside = true;
    target = event.target as Element | null;
    schedule();
  };
  const onLeave = () => {
    inside = false;
    target = null;
    schedule();
  };
  const onScroll = () => {
    if (inside) schedule();
  };

  /** Откуда заливка кнопки начинает расходиться (при входе) и куда сворачивается (при выходе). */
  const onCross = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    const el = (event.target as Element | null)?.closest<HTMLElement>(
      MAGNET_SELECTOR,
    );
    if (!el || el.contains(event.relatedTarget as Node | null)) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    el.style.setProperty(
      '--ox',
      `${clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100).toFixed(1)}%`,
    );
    el.style.setProperty(
      '--oy',
      `${clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100).toFixed(1)}%`,
    );
  };

  /** Значок на карточке качается, когда курсор заходит на карточку; пока качание идёт, новое не начинается. */
  const wiggling = new WeakSet<Element>();
  const onEnterCard = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    const card = (event.target as Element | null)?.closest<HTMLElement>(
      WIGGLE_CARDS,
    );
    if (!card || card.contains(event.relatedTarget as Node | null)) return;
    const artSelector = WIGGLE_TARGETS.find(([selector]) =>
      card.matches(selector),
    )?.[1];
    const art = artSelector && card.querySelector<HTMLElement>(artSelector);
    if (!art || wiggling.has(art)) return;
    wiggling.add(art);
    const release = () => wiggling.delete(art);
    const animation = art.animate(WIGGLE_KEYFRAMES, {
      duration: 520,
      easing: 'ease-out',
      composite: 'add',
    });
    animation.onfinish = release;
    animation.oncancel = release;
  };

  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerover', onCross, { passive: true });
  document.addEventListener('pointerover', onEnterCard, { passive: true });
  document.addEventListener('pointerout', onCross, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);
  window.addEventListener('scroll', onScroll, { passive: true });

  return () => {
    window.cancelAnimationFrame(frame);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerover', onCross);
    document.removeEventListener('pointerover', onEnterCard);
    document.removeEventListener('pointerout', onCross);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('blur', onLeave);
    window.removeEventListener('scroll', onScroll);
    observer?.disconnect();
    for (const tilt of tilts.values()) releaseTilt(tilt.el);
    for (const magnet of magnets.values()) releaseMagnet(magnet.el);
    for (const field of fields) field.clear();
  };
}
