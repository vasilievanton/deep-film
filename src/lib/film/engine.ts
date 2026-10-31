/**
 * Движок «фильма»: прокрутка страницы — это ползунок на таймлайне.
 *
 * Страница — высокий блок, внутри него закреплён один экран (sticky). Один слушатель прокрутки
 * считает положение в «экранах», слегка сглаживает его и для видимой сцены пишет прогресс `q` (0…1).
 * Каждая сцена — функция от `q` (см. ./scenes), поэтому прокрутка назад проигрывает её задом наперёд.
 *
 * Доводка: у каждой сцены есть опорные кадры (`stops`) — моменты, когда она собрана целиком. Пока человек
 * крутит, лента едет за ним; стоит остановиться между кадрами, и движок сам доводит прокрутку до
 * ближайшего кадра в сторону движения (первый кадр после остановки — вперёд, если крутили вниз). Так анимация
 * не застревает на середине: ни недопечатанной фразы, ни наполовину «расшифрованных» названий.
 *
 * Телефон и планшет: тот же движок, другая раскладка. «Узкой» считается раскладка, когда окно выше, чем шире
 * (`(max-aspect-ratio: 1/1)`): CSS и замеры сцен переключаются сами, без перезагрузки. Высота экрана берётся
 * у закреплённого блока (`100svh`), а не у окна: адресная строка мобильного браузера её не трогает. Палец
 * на экране — то же, что полоса прокрутки: пока он касается страницы, доводки нет, она начинается после того,
 * как палец отпущен и инерция докатилась.
 *
 * Страховка: класс `film-live` ставит инлайн-скрипт в <head> (нет «уменьшить движение»);
 * `film-ready` движок ставит сам, когда всё разобрано. Если что-то пошло не так, `film-live` снимается и
 * остаётся обычная колонка — текст виден без анимаций.
 */
import { scenes as sceneList, totalScreens } from '@/data/film';
import { createCases } from './scenes/cases';
import { createFaq } from './scenes/faq';
import { createFinal } from './scenes/final';
import { createMech } from './scenes/mech';
import { createMts } from './scenes/mts';
import { createProcess } from './scenes/process';
import { createSpeed } from './scenes/speed';
import { createStart } from './scenes/start';
import { createWhat } from './scenes/what';
import { createWho } from './scenes/who';
import type { FilmMetrics, SceneController, SceneFactory } from './types';
import {
  clamp,
  easeOut,
  lerp,
  pad2,
  setClass,
  setText,
  setVar,
  smooth,
} from './util';

const FACTORIES: Record<string, SceneFactory> = {
  start: createStart,
  what: createWhat,
  speed: createSpeed,
  mech: createMech,
  mts: createMts,
  cases: createCases,
  who: createWho,
  process: createProcess,
  faq: createFaq,
  final: createFinal,
};

/** Пауза между сценами в экранах: на каждой границе экран пустой, горит только служебный слой. */
const PAUSE = 0.07;
/** Сглаживание прокрутки: за сколько секунд сцена догоняет колесо. */
const SMOOTH = 0.085;
/** Длина «минуты» на таймкоде служебного слоя. */
const FILM_SECONDS = 60;
const FRAMES_PER_SECOND = 60;
/** Сцена видна, пока её прогресс внутри этого окна; на границах — глитч-склейка. */
const VISIBLE_FROM = 0.015;
const VISIBLE_TO = 0.985;
const CUT_MS = 170;
/** Прыжок длиннее этого (в экранах) не сглаживается: сцены меняются склейкой. */
const JUMP_CUT = 2.6;
/** Наклон «камеры» за курсором, градусов (в углу экрана). */
const TILT_DEG = 2;
/** Сколько тишины (мс) после последнего движения прокрутки, прежде чем доводить до опорного кадра. */
const SETTLE_IDLE_MS = 140;
/** Ближе этого (px) к опорному кадру — просто возвращаемся на него (случайное подрагивание колеса). */
const SNAP_PX = 26;
/** Допуск (px): уже стоим на кадре. */
const AT_REST_PX = 3;
/** Длительность доводки: от расстояния, но не меньше и не больше. */
const SETTLE_MIN_MS = 320;
const SETTLE_MAX_MS = 1150;
/** Палец давно на экране, а страница молчит: считаем, что событие «отпустили» потерялось, и снимаем блокировку. */
const HOLD_GUARD_MS = 2500;
/** Клавиши, которыми листают страницу: после них тоже доводим до кадра. */
const SCROLL_KEYS: Record<string, 1 | -1> = {
  ArrowDown: 1,
  PageDown: 1,
  ' ': 1,
  End: 1,
  ArrowUp: -1,
  PageUp: -1,
  Home: -1,
};

type Slot = {
  id: string;
  el: HTMLElement;
  controller: SceneController;
  start: number;
  len: number;
  /** Положение опорных кадров на странице, px. */
  stopYs: number[];
  visible: boolean;
  q: number;
  cutTimer: number;
};

/** Опорный кадр: положение прокрутки в px и номер сцены. */
type Stop = { y: number; index: number };
type Settle = { from: number; to: number; t0: number; dur: number };

export function startFilm(): (() => void) | undefined {
  const html = document.documentElement;
  const root = document.querySelector<HTMLElement>('[data-film]');
  if (!root || !html.classList.contains('film-live')) return undefined;

  try {
    return boot(root, html);
  } catch (error) {
    console.error('[film] запуск не удался, показываем обычную колонку', error);
    html.classList.remove('film-live', 'film-ready');
    return undefined;
  }
}

function boot(root: HTMLElement, html: HTMLElement): () => void {
  const track = root.querySelector<HTMLElement>('.film__track')!;
  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  const world = root.querySelector<HTMLElement>('[data-world]')!;
  const hud = root.querySelector<HTMLElement>('[data-hud]')!;
  const ringBar = hud.querySelector<SVGElement>('[data-hud-ring]');
  const ringButton = hud.querySelector<HTMLButtonElement>('[data-hud-toggle]')!;
  const num = hud.querySelector<HTMLElement>('[data-hud-num]');
  const time = hud.querySelector<HTMLElement>('[data-hud-time]');
  const frameNo = hud.querySelector<HTMLElement>('[data-hud-frame]');
  const nameEl = hud.querySelector<HTMLElement>('[data-hud-name]');
  const cta = hud.querySelector<HTMLElement>('[data-hud-cta]');
  const hint = hud.querySelector<HTMLElement>('[data-hud-hint]');
  const list = hud.querySelector<HTMLElement>('[data-hud-list]')!;
  const listLinks = Array.from(
    list.querySelectorAll<HTMLAnchorElement>('a[data-jump]'),
  );

  const slots: Slot[] = sceneList.map((meta, index) => {
    const el = root.querySelector<HTMLElement>(`[data-scene="${meta.id}"]`);
    const factory = FACTORIES[meta.id];
    if (!el || !factory) throw new Error(`нет сцены ${meta.id}`);
    return {
      id: meta.id,
      el,
      controller: factory(el),
      start: sceneList.slice(0, index).reduce((sum, s) => sum + s.len, 0),
      len: meta.len,
      stopYs: [],
      visible: false,
      q: -1,
      cutTimer: 0,
    };
  });

  const metrics: FilmMetrics = { w: 1440, h: 900, u: 14, tall: false };
  const tallQuery = window.matchMedia('(max-aspect-ratio: 1/1)');
  // «единицу кадра» считает CSS (--u зависит от раскладки), поэтому берём её из вёрстки, а не повторяем формулу
  const probe = document.createElement('i');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:absolute;top:0;left:0;width:var(--u);height:0;visibility:hidden;pointer-events:none';
  stage.append(probe);
  let sizeKey = '';
  let trackTop = 0;
  let trackBottom = 0;
  let target = 0;
  let current = 0;
  let activeIndex = -1;
  let raf = 0;
  let lastTime = 0;
  let camX = 0;
  let camY = 0;
  let aimX = 0;
  let aimY = 0;
  let needsRender = true;
  let reduceCamera = false;
  // доводка до опорного кадра
  let stops: Stop[] = [];
  let endY = 0;
  let settle: Settle | null = null;
  let idleTimer = 0;
  let inputDir = 0;
  let lastY = window.scrollY;
  let ownY = Number.NaN;
  let ownAt = 0;
  let holding = false;
  let holdTimer = 0;
  // где мы были на ленте до смены размеров окна: в экранах от её начала или в px ниже её конца
  let keepIn = Number.NaN;
  let keepBelow = Number.NaN;
  let resizing = false;
  let resizeTimer = 0;

  /** Мгновенный переход: на старых браузерах значения `instant` нет, там обычный scrollTo и так мгновенный. */
  const jump = (y: number) => {
    try {
      window.scrollTo({ top: y, behavior: 'instant' });
    } catch {
      window.scrollTo(0, y);
    }
  };

  /* ───────────── замеры ───────────── */

  const measure = () => {
    metrics.tall = tallQuery.matches;
    metrics.w = window.innerWidth;
    // высота закреплённого экрана (100svh), а не окна: у телефона окно меняется вместе с адресной строкой
    metrics.h = stage.clientHeight || window.innerHeight;
    metrics.u =
      probe.getBoundingClientRect().width ||
      Math.min(metrics.w / 100, metrics.h / 56.25);
    sizeKey = `${metrics.w}x${metrics.h}x${metrics.tall ? 1 : 0}`;
    trackTop = track.getBoundingClientRect().top + window.scrollY;
    trackBottom = trackTop + track.offsetHeight;
    slots.forEach((slot) => slot.controller.measure?.(metrics));
    buildStops();
    target = screens();
    needsRender = true;
  };

  /** Опорные кадры всех сцен в px страницы — по ним доводим прокрутку и прыгаем по ссылкам. */
  const buildStops = () => {
    const all: Stop[] = [];
    slots.forEach((slot, index) => {
      const m = margin(slot);
      const from = index === 0 ? 0 : m;
      const to = index === slots.length - 1 ? 1 : 1 - m;
      slot.stopYs = slot.controller.stops.map((q) => {
        const s = slot.start + (from + q * (to - from)) * slot.len;
        const y = Math.round(trackTop + s * metrics.h);
        all.push({ y, index });
        return y;
      });
    });
    stops = all.sort((a, b) => a.y - b.y);
    endY = trackTop + totalScreens * metrics.h;
    // для проверок и отладки: где на странице стоят опорные кадры
    root.dataset.filmStops = JSON.stringify(
      stops.map((st) => [st.index, st.y]),
    );
  };

  /** Положение прокрутки в экранах от начала ленты. */
  const screens = () => (window.scrollY - trackTop) / metrics.h;

  /**
   * Запоминает, где мы на ленте (в экранах от её начала) или под ней (в px от её низа) — в единицах, которые не
   * зависят от размера окна. Пока окно меняет размер, браузер сам двигает прокрутку (прижимает к новому концу
   * страницы) — тогда помнить нечего, ждём замера.
   */
  const remember = () => {
    if (resizing) return;
    const y = window.scrollY;
    if (y >= trackBottom) {
      keepBelow = y - trackBottom;
      keepIn = Number.NaN;
    } else {
      keepIn = (y - trackTop) / metrics.h;
      keepBelow = Number.NaN;
    }
  };

  /** Окно сменило размер (поворот телефона, другое окно браузера): меряем заново и возвращаемся в тот же момент. */
  const relayout = () => {
    window.clearTimeout(resizeTimer);
    const was = keepIn;
    const below = keepBelow;
    measure();
    if (!Number.isNaN(was)) jump(Math.round(trackTop + was * metrics.h));
    else if (!Number.isNaN(below)) jump(Math.round(trackBottom + below));
    lastY = window.scrollY;
    target = screens();
    current = clamp(target, 0, totalScreens);
    resizing = false;
    remember();
    needsRender = true;
    request();
    armIdle();
  };

  const margin = (slot: Slot) => PAUSE / slot.len;

  /** Прогресс содержимого сцены: первая сцена не имеет входа по прокрутке, последняя — выхода. */
  const contentProgress = (slot: Slot, index: number, s: number) => {
    const p = clamp((s - slot.start) / slot.len);
    const m = margin(slot);
    const from = index === 0 ? 0 : m;
    const to = index === slots.length - 1 ? 1 : 1 - m;
    return clamp((p - from) / (to - from));
  };

  const sceneAt = (s: number) => {
    for (let i = slots.length - 1; i >= 0; i -= 1) {
      if (s >= slots[i].start) return i;
    }
    return 0;
  };

  /* ───────────── показ сцен и склейки ───────────── */

  const setVisible = (slot: Slot, on: boolean, instant = false) => {
    if (slot.visible === on) return;
    slot.visible = on;
    window.clearTimeout(slot.cutTimer);
    const { el } = slot;
    el.classList.remove('is-in', 'is-out');
    if (instant) {
      setClass(el, 'is-on', on);
      return;
    }
    if (on) {
      el.classList.add('is-on', 'is-in');
      slot.cutTimer = window.setTimeout(
        () => el.classList.remove('is-in'),
        CUT_MS,
      );
    } else {
      // уходящая сцена ещё 170 мс «рвётся» и только потом гаснет
      el.classList.add('is-out');
      slot.cutTimer = window.setTimeout(() => {
        el.classList.remove('is-out', 'is-on');
      }, CUT_MS);
    }
  };

  /* ───────────── служебный слой ───────────── */

  const updateHud = (s: number, index: number) => {
    const progress = clamp(s / (totalScreens - 0.0001));
    if (ringBar) setVar(ringBar, '--hp', progress);
    if (num) setText(num, pad2(index + 1));
    const seconds = progress * FILM_SECONDS;
    if (time) {
      setText(
        time,
        `${pad2(Math.floor(seconds / 60))}:${pad2(Math.floor(seconds % 60))}`,
      );
    }
    if (frameNo) {
      setText(
        frameNo,
        String(Math.floor(seconds * FRAMES_PER_SECOND)).padStart(4, '0'),
      );
    }
    if (nameEl)
      setText(nameEl, sceneList[index].name.toLocaleUpperCase('ru-RU'));
    // кнопка «Обсудить проект» появляется после второй сцены, а на финале её заменяет огромная
    const wantCta = index >= 2 && index < slots.length - 1;
    if (cta) setClass(cta, 'is-shown', wantCta);
    if (hint) setClass(hint, 'is-gone', s > 0.08);
    ringButton.setAttribute(
      'aria-label',
      `Сцены: сейчас ${index + 1} из ${slots.length}, открыть список`,
    );
    listLinks.forEach((link, i) => {
      if (i === index) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
  };

  /* ───────────── кадр ───────────── */

  const render = () => {
    const s = clamp(current, 0, totalScreens);
    const index = sceneAt(s);
    activeIndex = index;
    slots.forEach((slot, i) => {
      if (i !== index) {
        if (slot.visible) setVisible(slot, false);
        return;
      }
      const q = contentProgress(slot, i, s);
      const visible =
        (i === 0 || q > VISIBLE_FROM) &&
        (i === slots.length - 1 || q < VISIBLE_TO);
      if (visible !== slot.visible) setVisible(slot, visible);
      if (Math.abs(q - slot.q) > 1e-5 || needsRender) {
        slot.q = q;
        slot.controller.update(q);
      }
    });
    updateHud(s, index);
    needsRender = false;
  };

  /* ───────────── цикл ───────────── */

  const tick = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, lastTime ? (now - lastTime) / 1000 : 0.016);
    lastTime = now;
    let more = false;

    if (settle) {
      // доводка: сами ведём прокрутку по плавной кривой, сглаживание колеса здесь не нужно
      const t = clamp((now - settle.t0) / settle.dur);
      const y = lerp(settle.from, settle.to, settleEase(t));
      ownY = y;
      ownAt = performance.now();
      jump(y);
      lastY = window.scrollY;
      current = target = screens();
      if (t >= 1) settle = null;
      else more = true;
    } else {
      const diff = target - current;
      if (Math.abs(diff) < 0.0003) {
        current = target;
      } else {
        current += diff * (1 - Math.exp(-dt / SMOOTH));
        more = true;
      }
    }

    slots.forEach((slot) => {
      if (slot.controller.frame?.(now)) more = true;
    });

    if (!reduceCamera) {
      const k = 1 - Math.exp(-dt / 0.18);
      camX += (aimX - camX) * k;
      camY += (aimY - camY) * k;
      const tiny = Math.abs(camX) < 0.003 && Math.abs(camY) < 0.003;
      world.style.transform = tiny
        ? ''
        : `perspective(1700px) rotateX(${(-camY * TILT_DEG).toFixed(3)}deg) rotateY(${(camX * TILT_DEG).toFixed(3)}deg)`;
      if (Math.abs(aimX - camX) > 0.002 || Math.abs(aimY - camY) > 0.002)
        more = true;
    }

    render();
    if (more) request();
    else lastTime = 0;
  };

  const request = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  /* ───────────── переходы ───────────── */

  /** Прокрутка к сцене: прыгаем на её опорный кадр (собранный), при этом вход сцены проигрывается. */
  const seek = (index: number, stopNo?: number) => {
    const slot = slots[index];
    const y =
      slot.stopYs[stopNo ?? slot.controller.jumpStop ?? 0] ?? slot.stopYs[0];
    settle = null;
    jump(y);
    lastY = window.scrollY;
    target = (y - trackTop) / metrics.h;
    if (sceneAt(current) !== index) current = slot.start;
    needsRender = true;
    request();
  };

  const seekToCase = (id: string) => {
    const el = root.querySelector<HTMLElement>(
      `[data-case="${CSS.escape(id)}"]`,
    );
    if (!el) return false;
    const index = slots.findIndex((slot) => slot.el.contains(el));
    if (index < 0) return false;
    seek(index, slots[index].controller.stopFor?.(el) ?? undefined);
    return true;
  };

  const seekToSceneId = (id: string) => {
    const index = slots.findIndex((slot) => slot.id === id);
    if (index < 0) return false;
    seek(index);
    return true;
  };

  /** Ссылки вида #scene-mech и #case-tbank работают внутри ленты. */
  const goToHash = (hash: string) => {
    if (hash.startsWith('#case-'))
      return seekToCase(decodeURIComponent(hash.slice(6)));
    if (hash.startsWith('#scene-')) return seekToSceneId(hash.slice(7));
    return false;
  };

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
      'a[href*="#case-"], a[href*="#scene-"]',
    );
    if (!link) return;
    const url = new URL(link.href, window.location.href);
    if (
      url.pathname.replace(/\/index\.html$/, '/') !==
      window.location.pathname.replace(/\/index\.html$/, '/')
    )
      return;
    if (goToHash(url.hash)) {
      event.preventDefault();
      closeList(false);
      history.replaceState(null, '', url.hash);
    }
  };

  /* ───────────── список сцен ───────────── */

  const openList = () => {
    list.hidden = false;
    ringButton.setAttribute('aria-expanded', 'true');
    hud.classList.add('is-list');
    list
      .querySelector<HTMLElement>('a[aria-current="step"]')
      ?.focus({ preventScroll: true });
  };
  function closeList(restoreFocus = true) {
    if (list.hidden) return;
    list.hidden = true;
    ringButton.setAttribute('aria-expanded', 'false');
    hud.classList.remove('is-list');
    if (restoreFocus) ringButton.focus({ preventScroll: true });
  }
  const onRing = () => (list.hidden ? openList() : closeList());
  const onDocumentDown = (event: PointerEvent) => {
    // нажали на полосу прокрутки страницы: пока держим, ничего не доводим
    if (
      event.pointerType === 'mouse' &&
      event.target === document.documentElement &&
      event.clientX >= document.documentElement.clientWidth
    ) {
      onHold(event);
    }
    if (list.hidden) return;
    const inside = (event.target as Element | null)?.closest('[data-hud-menu]');
    if (!inside) closeList(false);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeList();
    const dir = SCROLL_KEYS[event.key];
    if (dir && !event.ctrlKey && !event.metaKey && !event.altKey) {
      settle = null;
      inputDir = event.key === ' ' && event.shiftKey ? -1 : dir;
      armIdle();
    }
  };

  /* ───────────── доводка до опорного кадра ───────────── */

  /** Быстрый старт и мягкая остановка: ощущается как продолжение движения, а не рывок. */
  const settleEase = (t: number) => lerp(smooth(t), easeOut(t), 0.5);

  const armIdle = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(settleNow, SETTLE_IDLE_MS);
  };

  /** Прокрутка остановилась между кадрами: едем до ближайшего в сторону движения. */
  const settleNow = () => {
    idleTimer = 0;
    if (settle || stops.length === 0) return;
    // палец на экране или кнопка мыши на полосе прокрутки — человек ещё крутит
    if (holding) return;
    // открыто окно (форма): страница под ним не должна двигаться
    if (document.body.style.overflow === 'hidden') return;
    const y = window.scrollY;
    if (y > endY + AT_REST_PX) return; // ниже ленты — обычная страница
    let prev: Stop | undefined;
    let next: Stop | undefined;
    for (const st of stops) {
      if (st.y <= y) prev = st;
      else {
        next = st;
        break;
      }
    }
    const nearest = [prev, next]
      .filter((st): st is Stop => st !== undefined)
      .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0];
    if (nearest && Math.abs(nearest.y - y) <= AT_REST_PX) return; // уже на кадре
    let pick: Stop | undefined;
    if (nearest && Math.abs(nearest.y - y) <= SNAP_PX) pick = nearest;
    else if (inputDir > 0) pick = next;
    else if (inputDir < 0) pick = prev;
    else pick = nearest;
    if (!pick) return; // дальше в эту сторону кадров нет: обычная прокрутка
    const dist = Math.abs(pick.y - y);
    settle = {
      from: y,
      to: pick.y,
      t0: performance.now(),
      dur: clamp(SETTLE_MIN_MS + dist * 0.55, SETTLE_MIN_MS, SETTLE_MAX_MS),
    };
    request();
  };

  /* ───────────── ввод ───────────── */

  const onScroll = () => {
    const y = window.scrollY;
    const mine =
      !Number.isNaN(ownY) &&
      Math.abs(y - ownY) <= 1.6 &&
      performance.now() - ownAt < 250;
    if (!mine) {
      // страницу двинули не мы (колесо, касание, клавиша, ползунок): доводку отменяем, запоминаем сторону
      settle = null;
      const dy = y - lastY;
      if (Math.abs(dy) >= 1) inputDir = dy > 0 ? 1 : -1;
      if (holding) armHoldGuard();
      armIdle();
    }
    lastY = y;
    remember();
    target = screens();
    // прыжок через полленты (ползунок, End, ссылка) — склейка, а не пролёт через все сцены по пути
    if (Math.abs(target - current) > JUMP_CUT) current = target;
    request();
  };
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || Math.abs(event.deltaY) < 0.5) return;
    settle = null;
    inputDir = event.deltaY > 0 ? 1 : -1;
    armIdle();
  };
  /** Страховка: если «отпустили» не пришло, через пару секунд тишины считаем, что палец уже поднят. */
  const armHoldGuard = () => {
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      if (!holding) return;
      holding = false;
      armIdle();
    }, HOLD_GUARD_MS);
  };
  const onHold = (event: Event) => {
    holding = true;
    settle = null;
    armHoldGuard();
    if (event.type === 'pointerdown') return;
    window.clearTimeout(idleTimer);
  };
  const onRelease = (event: Event) => {
    // второй палец поднят, первый ещё на экране
    if (event.type.startsWith('touch') && (event as TouchEvent).touches.length)
      return;
    // у касания pointerup и pointercancel приходят, когда браузер забрал жест себе (началась прокрутка), а не
    // когда палец поднят: для пальца ждём touchend, для мыши (полоса прокрутки) — pointerup
    if (event instanceof PointerEvent && event.pointerType !== 'mouse') return;
    if (!holding) return;
    holding = false;
    window.clearTimeout(holdTimer);
    armIdle();
  };
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    aimX = (event.clientX / window.innerWidth - 0.5) * 2;
    aimY = (event.clientY / window.innerHeight - 0.5) * 2;
    request();
  };
  const onLeave = () => {
    aimX = 0;
    aimY = 0;
    request();
  };
  /** Фокус с клавиатуры ушёл в невидимую сцену — показываем её. */
  const onFocusIn = (event: FocusEvent) => {
    const el = event.target as Element | null;
    const index = slots.findIndex((slot) => slot.el.contains(el));
    if (index < 0 || index === activeIndex) return;
    const stopNo =
      el instanceof HTMLElement
        ? slots[index].controller.stopFor?.(el)
        : undefined;
    seek(index, stopNo ?? undefined);
  };
  const onResize = () => {
    resizing = true;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      // адресная строка телефона «шевелит» окно при каждой прокрутке, а размер закреплённого экрана не меняется
      const key = `${window.innerWidth}x${stage.clientHeight || window.innerHeight}x${tallQuery.matches ? 1 : 0}`;
      if (key === sizeKey) {
        resizing = false;
        remember();
        return;
      }
      relayout();
    }, 120);
  };
  /** Окно стало выше, чем шире (или наоборот): переключается раскладка, сцены меряем заново сразу. */
  const onLayout = () => {
    resizing = true;
    relayout();
  };

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reload = () => window.location.reload();
  reduceCamera = !window.matchMedia('(hover: hover) and (pointer: fine)')
    .matches;

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onHold, { passive: true });
  window.addEventListener('touchend', onRelease, { passive: true });
  window.addEventListener('touchcancel', onRelease, { passive: true });
  window.addEventListener('pointerup', onRelease);
  window.addEventListener('pointercancel', onRelease);
  window.addEventListener('resize', onResize);
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  document.addEventListener('click', onClick);
  document.addEventListener('pointerdown', onDocumentDown);
  document.addEventListener('keydown', onKey);
  root.addEventListener('focusin', onFocusIn);
  ringButton.addEventListener('click', onRing);
  motionQuery.addEventListener('change', reload);
  tallQuery.addEventListener('change', onLayout);

  /* ───────────── старт ───────────── */

  const ready = () => {
    // страховочный таймер уже вернул обычную колонку (шрифты грузились слишком долго): движок не нужен
    if (!html.classList.contains('film-live')) {
      dispose();
      return;
    }
    measure();
    current = target;
    render();
    html.classList.add('film-ready');
    if (window.location.hash && goToHash(window.location.hash)) {
      current = target;
      needsRender = true;
    }
    // браузер мог вернуть прокрутку ещё до замера: место, которое «помнили» тогда, считалось по пустым размерам
    remember();
    armIdle();
    request();
  };

  if (document.fonts?.ready) {
    void document.fonts.ready.then(ready);
  } else {
    ready();
  }

  function dispose() {
    window.cancelAnimationFrame(raf);
    window.clearTimeout(idleTimer);
    window.clearTimeout(holdTimer);
    window.clearTimeout(resizeTimer);
    probe.remove();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onHold);
    window.removeEventListener('touchend', onRelease);
    window.removeEventListener('touchcancel', onRelease);
    window.removeEventListener('pointerup', onRelease);
    window.removeEventListener('pointercancel', onRelease);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointer);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('click', onClick);
    document.removeEventListener('pointerdown', onDocumentDown);
    document.removeEventListener('keydown', onKey);
    root.removeEventListener('focusin', onFocusIn);
    ringButton.removeEventListener('click', onRing);
    motionQuery.removeEventListener('change', reload);
    tallQuery.removeEventListener('change', onLayout);
    slots.forEach((slot) => window.clearTimeout(slot.cutTimer));
  }

  return dispose;
}
