/**
 * Приёмы работы с текстом: разбор на буквы, плашка за словом, печать с курсором, расшифровка из случайных символов.
 *
 * Текст остаётся настоящим: для скринридеров рядом лежит обычная копия (`.sr`), а разобранные на буквы
 * куски скрыты от них (`aria-hidden`). Каждая буква — `.c` с переменными `--ti` (вход, 0…1) и `--to`
 * (выход, 0…1); как именно буква едет, решает CSS.
 */
import { clamp, hash, setClass, setVar } from './util';

export type Split = {
  /** Внешний элемент, который разобрали. */
  host: HTMLElement;
  /** Все буквы по порядку. */
  chars: HTMLElement[];
  /** Все слова по порядку. */
  words: HTMLElement[];
  /** Контейнер с разобранным текстом (внутри `host`). */
  root: HTMLElement;
};

/** Разбирает текст элемента на слова и буквы. Вложенные элементы (плашки, подчёркивания) сохраняются. */
export function splitText(host: HTMLElement): Split {
  const chars: HTMLElement[] = [];
  const words: HTMLElement[] = [];
  const label = (host.textContent ?? '').replace(/\s+/g, ' ').trim();
  const root = document.createElement('span');
  root.className = 'split';
  root.setAttribute('aria-hidden', 'true');

  const walk = (from: Node, to: Node) => {
    from.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        for (const part of (node.textContent ?? '').split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            to.appendChild(document.createTextNode(' '));
            continue;
          }
          const word = document.createElement('span');
          word.className = 'w';
          for (const glyph of Array.from(part)) {
            const char = document.createElement('span');
            char.className = 'c';
            char.textContent = glyph;
            word.appendChild(char);
            chars.push(char);
          }
          words.push(word);
          to.appendChild(word);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.tagName === 'BR') {
          to.appendChild(el.cloneNode());
          return;
        }
        const copy = el.cloneNode(false) as HTMLElement;
        walk(el, copy);
        to.appendChild(copy);
      }
    });
  };
  walk(host, root);

  // пробелы по краям (из переносов в разметке) не нужны
  while (root.firstChild?.nodeType === Node.TEXT_NODE) root.firstChild.remove();
  while (root.lastChild?.nodeType === Node.TEXT_NODE) root.lastChild.remove();

  host.textContent = '';
  const sr = document.createElement('span');
  sr.className = 'sr';
  sr.textContent = label;
  host.append(sr, root);
  host.dataset.split = '1';
  return { host, chars, words, root };
}

/** Буква в состоянии «вход / выход»: две переменные, дальше всё делает CSS. */
export function setChar(char: HTMLElement, enter: number, exit = 0) {
  setVar(char, '--ti', enter);
  setVar(char, '--to', exit);
}

/**
 * Плашка за словом: жёлтая заливка выезжает слева, а буквы, которые она накрыла, становятся чёрными.
 * Цвет меняется по буквам: в момент, когда край плашки проходит середину буквы.
 */
export class Plate {
  private centers: number[] = [];
  private width = 1;
  private pad = 0;

  constructor(
    readonly host: HTMLElement,
    readonly chars: HTMLElement[],
  ) {
    host.classList.add('plate');
    const bg = document.createElement('span');
    bg.className = 'plate__bg';
    bg.setAttribute('aria-hidden', 'true');
    host.prepend(bg);
  }

  /** Замеряет положение букв (после загрузки шрифтов и при изменении размера окна). */
  measure() {
    this.width = this.host.offsetWidth || 1;
    const size = parseFloat(getComputedStyle(this.host).fontSize) || 16;
    this.pad = size * 0.2;
    this.centers = this.chars.map(
      (char) => char.offsetLeft + char.offsetWidth / 2,
    );
  }

  /** `enter` — заливка выезжает слева направо, `exit` — убирается тем же ходом. */
  set(enter: number, exit = 0) {
    setVar(this.host, '--pi', enter);
    setVar(this.host, '--po', exit);
    const full = this.width + this.pad * 2;
    const rightEdge = -this.pad + enter * full;
    const leftEdge = -this.pad + exit * full;
    this.chars.forEach((char, index) => {
      const x = this.centers[index] ?? 0;
      setClass(char, 'is-ink', enter > 0 && x <= rightEdge && x >= leftEdge);
    });
  }
}

/**
 * Печать с курсором: `set(t)` показывает долю текста от 0 до 1. Курсор — это край последней
 * напечатанной буквы (класс `is-last`), мигает он средствами CSS. `exit` — выход: одно число
 * на весь текст или функция от номера буквы.
 */
export class Typer {
  constructor(
    readonly chars: HTMLElement[],
    private readonly cursor = true,
  ) {}

  set(t: number, exit: number | ((index: number) => number) = 0) {
    const count = this.chars.length;
    // каждой букве нужно 1,5 «буквы» хода, чтобы выйти на полную яркость: без запаса последняя так и
    // оставалась бледной и сдвинутой, даже когда всё напечатано (t = 1)
    const reach = t * (count + 0.5);
    const lead = Math.min(count - 1, Math.ceil(reach) - 1);
    this.chars.forEach((char, index) => {
      const out = typeof exit === 'function' ? exit(index) : exit;
      setVar(char, '--ti', clamp((reach - index) / 1.5));
      setVar(char, '--to', out);
      setClass(
        char,
        'is-last',
        this.cursor && index === lead && t > 0 && out === 0,
      );
    });
  }
}

const GLYPHS = 'ABCDEFGHKMNPRSTXZ0123456789#%&*+=?/<>';

/**
 * Расшифровка: буквы сначала подменяются случайными символами, потом слева направо встают на место.
 * Случайный символ зависит только от номера буквы и положения прокрутки, поэтому при прокрутке
 * назад картинка повторяется.
 */
export class Scrambler {
  private finals: string[];
  private widths: number[] = [];

  constructor(readonly chars: HTMLElement[]) {
    this.finals = chars.map((char) => char.textContent ?? '');
  }

  /** Фиксирует ширину букв, чтобы строка не дёргалась, пока символы меняются. */
  measure() {
    this.chars.forEach((char, index) => {
      char.style.width = '';
      char.textContent = this.finals[index];
    });
    // computed width — дробная и не зависит от transform (у барабана на сценах стоит scale)
    this.widths = this.chars.map(
      (char) => parseFloat(getComputedStyle(char).width) || char.offsetWidth,
    );
    this.chars.forEach((char, index) => {
      char.style.width = `${this.widths[index]}px`;
    });
  }

  /** `t` — 0…1 по всему слову: 0 — читается как есть, середина — шифр, 1 — снова читается. */
  set(t: number) {
    const count = this.chars.length;
    const step = Math.floor(t * 70);
    this.chars.forEach((char, index) => {
      const u = count > 1 ? index / (count - 1) : 0;
      const scrambleAt = 0.04 + 0.1 * u;
      const lockAt = 0.4 + 0.55 * u;
      const final = this.finals[index];
      let glyph = final;
      if (t >= scrambleAt && t < lockAt && final.trim() !== '') {
        glyph =
          GLYPHS[Math.floor(hash(index * 131 + step * 17) * GLYPHS.length)];
      }
      if (char.textContent !== glyph) char.textContent = glyph;
    });
  }
}
