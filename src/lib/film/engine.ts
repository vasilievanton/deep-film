/**
 * Движок «фильма»: прокрутка страницы — это ползунок на таймлайне.
 *
 * Страница — высокий блок, внутри него закреплён один экран (sticky). Один слушатель прокрутки
 * считает положение в «экранах», слегка сглаживает его и для видимой сцены пишет прогресс `q` (0…1).
 * Каждая сцена — функция от `q` (см. ./scenes), поэтому прокрутка назад проигрывает её задом наперёд.
 *
 * Страховка: класс `film-live` ставит инлайн-скрипт в <head> (компьютер, без «уменьшить движение»);
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
import { clamp, pad2, setClass, setText, setVar } from './util';

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

type Slot = {
  id: string;
  el: HTMLElement;
  controller: SceneController;
  start: number;
  len: number;
  visible: boolean;
  q: number;
  cutTimer: number;
};

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
      visible: false,
      q: -1,
      cutTimer: 0,
    };
  });

  const metrics: FilmMetrics = { w: 1440, h: 900, u: 14 };
  let trackTop = 0;
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

  /* ───────────── замеры ───────────── */

  const measure = () => {
    metrics.w = window.innerWidth;
    metrics.h = window.innerHeight;
    metrics.u = Math.min(metrics.w / 100, metrics.h / 56.25);
    trackTop = track.getBoundingClientRect().top + window.scrollY;
    slots.forEach((slot) => slot.controller.measure?.(metrics));
    target = screens();
    needsRender = true;
  };

  /** Положение прокрутки в экранах от начала ленты. */
  const screens = () => (window.scrollY - trackTop) / metrics.h;

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

    const diff = target - current;
    if (Math.abs(diff) < 0.0003) {
      current = target;
    } else {
      current += diff * (1 - Math.exp(-dt / SMOOTH));
      more = true;
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

  /** Прокрутка к сцене: как будто перемотали на нужное место, при этом вход сцены проигрывается. */
  const seek = (index: number, q?: number) => {
    const slot = slots[index];
    const m = margin(slot);
    const jump = q ?? slot.controller.jumpQ ?? 0.2;
    const from = index === 0 ? 0 : m;
    const to = index === slots.length - 1 ? 1 : 1 - m;
    const p = from + jump * (to - from);
    const s = slot.start + p * slot.len;
    window.scrollTo({ top: trackTop + s * metrics.h, behavior: 'instant' });
    target = s;
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
    seek(index, slots[index].controller.anchorFor?.(el) ?? undefined);
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
    if (list.hidden) return;
    const inside = (event.target as Element | null)?.closest('[data-hud-menu]');
    if (!inside) closeList(false);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeList();
  };

  /* ───────────── ввод ───────────── */

  const onScroll = () => {
    target = screens();
    // прыжок через полленты (ползунок, End, ссылка) — склейка, а не пролёт через все сцены по пути
    if (Math.abs(target - current) > JUMP_CUT) current = target;
    request();
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
    if (index >= 0 && index !== activeIndex) seek(index, 0.5);
  };
  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(measure, 120);
  };

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const widthQuery = window.matchMedia('(min-width: 1024px)');
  const reload = () => window.location.reload();
  reduceCamera = !window.matchMedia('(hover: hover) and (pointer: fine)')
    .matches;

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  document.addEventListener('click', onClick);
  document.addEventListener('pointerdown', onDocumentDown);
  document.addEventListener('keydown', onKey);
  root.addEventListener('focusin', onFocusIn);
  ringButton.addEventListener('click', onRing);
  motionQuery.addEventListener('change', reload);
  widthQuery.addEventListener('change', reload);

  /* ───────────── старт ───────────── */

  const ready = () => {
    measure();
    current = target;
    render();
    html.classList.add('film-ready');
    if (window.location.hash && goToHash(window.location.hash)) {
      current = target;
      needsRender = true;
    }
    request();
  };

  if (document.fonts?.ready) {
    void document.fonts.ready.then(ready);
  } else {
    ready();
  }

  return () => {
    window.cancelAnimationFrame(raf);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointer);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('click', onClick);
    document.removeEventListener('pointerdown', onDocumentDown);
    document.removeEventListener('keydown', onKey);
    root.removeEventListener('focusin', onFocusIn);
    ringButton.removeEventListener('click', onRing);
    motionQuery.removeEventListener('change', reload);
    widthQuery.removeEventListener('change', reload);
    slots.forEach((slot) => window.clearTimeout(slot.cutTimer));
  };
}
