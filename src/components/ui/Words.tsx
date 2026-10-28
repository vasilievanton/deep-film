import { Fragment } from 'react';
import { cssVars } from '@/lib/css-vars';

/** Предел номера слова в задержке: длинный заголовок не должен «дописываться» дольше полусекунды. */
const MAX_STEP = 9;

/** Сколько слов в строке (нужно, чтобы нумерация шла сквозь части заголовка). */
export function wordCount(text: string) {
  return text.split(' ').length;
}

/**
 * Заголовок по словам: каждое слово — отдельный блок `<i class="w">` со своим номером `--wi`,
 * и при появлении секции слова выезжают по очереди (motion.css). Разметка одинакова на сервере и в
 * браузере, поэтому гидрация не расходится; текст для чтения и копирования остаётся обычным
 * (между словами настоящие пробелы). `from` — номер первого слова, если заголовок собран из частей
 * (до плашки и внутри неё), чтобы задержка шла сквозь весь заголовок.
 */
export function Words({ text, from = 0 }: { text: string; from?: number }) {
  return (
    <>
      {text.split(' ').map((word, index) => (
        <Fragment key={index}>
          {index > 0 ? ' ' : null}
          <i
            className="w"
            style={cssVars({ '--wi': Math.min(MAX_STEP, from + index) })}
          >
            {word}
          </i>
        </Fragment>
      ))}
    </>
  );
}
