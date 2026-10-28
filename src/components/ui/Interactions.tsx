import { useEffect } from 'react';
import { startConfetti } from '@/lib/fx/confetti';
import { startPointerEffects } from '@/lib/fx/pointer';

/**
 * Слой «живости» от пользователя: движения мыши (наклон карточек, магнитные кнопки, наклейки и слайдер,
 * которые смещаются за курсором) и конфетти на приятных моментах. Компонент ничего не рисует, а подключает
 * `lib/fx/*`; внешний вид всего этого — в motion.css.
 *
 * Появление блоков при прокрутке — отдельно, в Motion.tsx. Если анимации выключены в системе
 * (нет класса `motion-ok` на <html>), не происходит ничего, и страница остаётся спокойной и статичной.
 * Мышиные эффекты, кроме того, включаются только при настоящей мыши (на тач-экранах их нет).
 */
export default function Interactions() {
  useEffect(() => {
    if (!document.documentElement.classList.contains('motion-ok')) {
      return undefined;
    }
    const stops = [startPointerEffects(), startConfetti()];
    return () => stops.forEach((stop) => stop());
  }, []);

  return null;
}
