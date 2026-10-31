#!/usr/bin/env node
/**
 * Сборка для GitHub Pages.
 *
 * На GitHub Pages сайт открывается не с корня домена, а из подпапки:
 * https://<пользователь>.github.io/<репозиторий>/. В исходниках пути заданы от корня
 * (`/images/…`, `/fonts/…`, `/cases`, `/#scene-…`), и из подпапки они не работают.
 * Поэтому после обычной сборки (`npm run build`, папка `dist/`) скрипт копирует `dist/` в `dist-pages/`
 * и ставит перед такими путями имя подпапки — в HTML, CSS и JS. Исходники и обычная сборка
 * для корня домена не меняются.
 *
 * Кроме префикса, в копию добавляются:
 *  - `.nojekyll`: без него GitHub Pages пропускает сайт через Jekyll, а тот прячет папки с «_» (у нас `_astro`);
 *  - `<meta name="robots" content="noindex, nofollow">`: это тестовая копия, в поиске ей делать нечего.
 *
 * Использование: `npm run build:pages -- /имя-репозитория` (или `BASE_PATH=/имя-репозитория npm run build:pages`).
 */
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { extname, join } from 'node:path';

const name = (process.argv[2] ?? process.env.BASE_PATH ?? '').replace(
  /^\/+|\/+$/g,
  '',
);
if (!name) {
  console.error('Укажите подпапку: npm run build:pages -- /имя-репозитория');
  process.exit(1);
}
const base = `/${name}`;
const SRC = 'dist';
const OUT = 'dist-pages';
if (!existsSync(SRC)) {
  console.error('Нет папки dist/: сначала соберите сайт (npm run build).');
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });

/** Пути от корня в атрибутах HTML: одиночный «/», не «//» (адрес без протокола). */
const ATTRIBUTE =
  /(\s(?:href|src|srcset|poster|action|component-url|renderer-url|before-hydration-url)=")\/(?!\/)/g;
/**
 * Пути к папкам сайта в любом тексте (HTML, CSS, JS). Перед «/» не должно быть буквы, точки, дефиса,
 * «/» или «:»: так не трогаются «../images», «https://…/images» и уже поставленный префикс.
 */
const FOLDERS = /(?<![\w.\-/:])\/(images|fonts|_astro)\//g;

let changed = 0;
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    const ext = extname(entry.name);
    if (!['.html', '.css', '.js'].includes(ext)) continue;
    const before = readFileSync(path, 'utf8');
    let text = before;
    if (ext === '.html') {
      text = text
        .replace(ATTRIBUTE, `$1${base}/`)
        .replace(
          '<head>',
          '<head><meta name="robots" content="noindex, nofollow">',
        );
    }
    text = text.replace(FOLDERS, `${base}/$1/`);
    if (text !== before) {
      writeFileSync(path, text);
      changed += 1;
    }
  }
};
walk(OUT);
writeFileSync(join(OUT, '.nojekyll'), '');
console.log(`GitHub Pages: ${changed} файлов, пути под ${base}/ → ${OUT}/`);
