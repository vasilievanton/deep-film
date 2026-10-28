import {
  heroAudience,
  heroProof,
  heroSubtitle,
  heroTitle,
} from '@/data/landing';
import { ArrowButton } from '@/components/ui/ArrowButton';
import { Words, wordCount } from '@/components/ui/Words';
import { HeroCarousel } from '@/components/sections/HeroCarousel';
import { cssVars } from '@/lib/css-vars';

/** Наклейки вокруг заголовка — значки тех же механик, что в разделе «Возможности» (чёткие версии). */
const stickers = ['quiz', 'trophy', 'gift', 'receipt'] as const;

export default function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero__surface" aria-hidden="true">
        <div className="hero__grain" />
      </div>
      <div className="hero__body">
        <div className="hero__content">
          <div className="hero__title">
            <div className="hero__stickers" aria-hidden="true">
              {stickers.map((name) => (
                <span className={`sticker sticker--${name}`} key={name}>
                  <img
                    src={`/images/mechanics/${name}-sharp.webp`}
                    alt=""
                    width="256"
                    height="256"
                  />
                </span>
              ))}
            </div>
            <h1 id="hero-title">
              <span>
                <Words text={heroTitle.accent} />
              </span>{' '}
              <Words
                text={heroTitle.rest.trim()}
                from={wordCount(heroTitle.accent)}
              />
            </h1>
          </div>
          <p>
            {heroSubtitle.map((line) => (
              <span className="hero__line" key={line}>
                {line}{' '}
              </span>
            ))}
          </p>
          <div className="hero__actions">
            <a className="hero__secondary" href="#mechanics">
              Смотреть возможности
            </a>
            <ArrowButton href="#configurator" openContact>
              Обсудить проект
            </ArrowButton>
          </div>
          <div className="hero__audience">
            <span className="hero__audience-label">Для задач</span>
            <ul role="list">
              {heroAudience.map((item, index) => (
                <li
                  key={item.label}
                  data-accent={item.accent}
                  style={cssVars({ '--i': index })}
                >
                  {item.categoryId ? (
                    <a href="#cases" data-case-category={item.categoryId}>
                      {item.label}
                    </a>
                  ) : (
                    <a href="#mechanics" data-mechanic-id="custom">
                      {item.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="hero__proof">
            <span className="hero__proof-label">{heroProof.label}</span>
            <ul role="list">
              {heroProof.brands.map((brand, index) => (
                <li key={brand} style={cssVars({ '--i': index })}>
                  {brand}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="hero__stage">
          <HeroCarousel />
        </div>
      </div>
    </section>
  );
}
