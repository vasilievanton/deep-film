import { CELEBRATE_EVENT, type CelebrateDetail } from '@/lib/celebrate';

/**
 * Конфетти: плоские фигурки цветов палитры с чёрным контуром — как наклейки на странице.
 * Разлетаются по дуге и гаснут за ~1,5 с. Слой лежит поверх окон (z-index выше диалогов) и не ловит мышь.
 * Включается в `Interactions` только когда анимации не выключены в системе.
 *
 * Поводы: сигнал `celebrate()` (результат теста, обмен баллов, заявка отправлена) и клик по наклейкам
 * первого экрана и финального блока.
 */

/** Токены палитры из theme-deep.css; запасные значения — на случай, если токен не нашёлся. */
const PALETTE: ReadonlyArray<readonly [token: string, fallback: string]> = [
  ['--deep-sun', '#ffd731'],
  ['--deep-mint', '#55db9c'],
  ['--deep-blue', '#4da2ff'],
  ['--deep-lavender', '#e9ccff'],
  ['--deep-ember', '#fb4903'],
  ['--deep-violet', '#5c4ade'],
];
const SHAPES = ['circle', 'square', 'pill'] as const;
/** Наклейки, по которым можно кликнуть: первый экран и финальный блок. */
const STICKER_SELECTOR = '.hero__stickers .sticker, .final-cta__art .sticker';

const GRAVITY = 1700; // px/с²
const SAMPLES = 10; // точек на траекторию: дуга получается ровной, а анимация — одной на фигурку
/** Не больше стольких фигурок на экране одновременно: частые клики не должны копить слой. */
const MAX_PIECES = 140;

export function startConfetti(): () => void {
  let layer: HTMLDivElement | null = null;
  let live = 0;

  function ensureLayer() {
    if (layer?.isConnected) return layer;
    layer = document.createElement('div');
    layer.className = 'fx-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    return layer;
  }

  function readPalette() {
    const style = getComputedStyle(document.documentElement);
    return PALETTE.map(
      ([token, fallback]) => style.getPropertyValue(token).trim() || fallback,
    );
  }

  /** Залп из точки (x, y) в координатах окна. `power` — сила: у клика по наклейке меньше, чем у успеха. */
  function burst(x: number, y: number, count: number, power = 1) {
    if (live + count > MAX_PIECES) return;
    const host = ensureLayer();
    const colors = readPalette();
    for (let i = 0; i < count; i += 1) {
      const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      const size = 8 + Math.random() * 8;
      const piece = document.createElement('i');
      piece.className = 'fx-piece';
      piece.dataset.shape = shape;
      piece.style.width = `${shape === 'pill' ? Math.round(size * 1.8) : size}px`;
      piece.style.height = `${size}px`;
      piece.style.background = colors[i % colors.length];
      host.appendChild(piece);

      // веером вверх: от −160° до −20°, скорость 380–820 px/с
      const angle = ((-160 + Math.random() * 140) * Math.PI) / 180;
      const speed = (380 + Math.random() * 440) * power;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const duration = 1100 + Math.random() * 700;
      const spin = (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 600);
      const frames: Keyframe[] = [];
      for (let step = 0; step <= SAMPLES; step += 1) {
        const share = step / SAMPLES;
        const t = (duration * share) / 1000;
        const px = x + vx * t - size / 2;
        const py = y + vy * t + 0.5 * GRAVITY * t * t - size / 2;
        frames.push({
          offset: share,
          transform: `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) rotate(${(spin * share).toFixed(0)}deg)`,
          opacity: share < 0.72 ? 1 : 1 - (share - 0.72) / 0.28,
        });
      }
      const animation = piece.animate(frames, {
        duration,
        easing: 'linear',
        fill: 'forwards',
      });
      live += 1;
      const done = () => {
        piece.remove();
        live -= 1;
      };
      animation.onfinish = done;
      animation.oncancel = done;
    }
  }

  function onCelebrate(event: Event) {
    const { x, y, count } = (event as CustomEvent<CelebrateDetail>).detail;
    burst(x, y, count ?? 34);
  }

  function onClick(event: MouseEvent) {
    const sticker = (event.target as Element | null)?.closest<HTMLElement>(
      STICKER_SELECTOR,
    );
    if (!sticker) return;
    const rect = sticker.getBoundingClientRect();
    burst(rect.left + rect.width / 2, rect.top + rect.height / 2, 16, 0.75);
    // наклейка делает оборот и «подпрыгивает»; поворот прибавляется к покачиванию, а не заменяет его
    sticker.animate(
      { rotate: ['0deg', '360deg'] },
      {
        duration: 650,
        easing: 'cubic-bezier(0.3, 1.4, 0.5, 1)',
        composite: 'add',
      },
    );
    sticker.animate(
      { scale: [1, 1.15, 1] },
      { duration: 650, easing: 'ease-out' },
    );
  }

  window.addEventListener(CELEBRATE_EVENT, onCelebrate);
  document.addEventListener('click', onClick);
  return () => {
    window.removeEventListener(CELEBRATE_EVENT, onCelebrate);
    document.removeEventListener('click', onClick);
    layer?.remove();
    layer = null;
    live = 0;
  };
}
