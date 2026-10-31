/**
 * Отладочная панель для настоящего телефона: страница открывается как `…/?debug`.
 *
 * Поверх ленты рисуется маленький текст: размеры окна, положение прокрутки, номер опорного кадра, состояние доводки
 * и счётчики событий (сколько раз пришли касания, прокрутка, шаги). Если лента на телефоне опять «залипнет»,
 * скриншот этой панели показывает, дошли ли до страницы касания, двинулась ли прокрутка и почему шаг не сделан.
 * Без `?debug` панель не создаётся и на страницу ничего не добавляет.
 */
export type Debug = {
  /** Прибавить единицу к счётчику с таким названием. */
  count(key: string): void;
  /** Последнее, что сделал движок, одной строкой. */
  say(text: string): void;
  paint(): void;
  dispose(): void;
};

export function createDebug(read: () => string[]): Debug | undefined {
  if (!new URLSearchParams(window.location.search).has('debug')) {
    return undefined;
  }
  const el = document.createElement('pre');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'z-index:2147483647',
    'margin:0',
    'padding:3px 5px',
    'max-width:100vw',
    'overflow:hidden',
    'pointer-events:none',
    'background:rgba(0,0,0,0.8)',
    'color:#9dff9d',
    'font:9px/1.3 ui-monospace,Menlo,monospace',
    'white-space:pre-wrap',
  ].join(';');
  document.body.append(el);

  const counts = new Map<string, number>();
  let note = '';
  let painted = 0;

  const draw = () => {
    painted = performance.now();
    const counters = Array.from(counts, ([key, n]) => `${key} ${n}`).join(
      ' · ',
    );
    el.textContent = [...read(), counters, note].filter(Boolean).join('\n');
  };
  // обновляем не чаще раза в 120 мс, плюс по таймеру: пока ничего не происходит, строки всё равно живые
  const paint = () => {
    if (performance.now() - painted >= 120) draw();
  };
  const timer = window.setInterval(draw, 500);
  draw();

  return {
    count(key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      paint();
    },
    say(text) {
      note = text;
      draw();
    },
    paint,
    dispose() {
      window.clearInterval(timer);
      el.remove();
    },
  };
}
