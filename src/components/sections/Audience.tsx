import {
  audienceCards,
  audienceHeading,
  featuredCaseForCategory,
} from '@/data/landing';
import { IconTile } from '@/components/ui/IconTile';
import { ArrowIcon } from '@/components/ui/ArrowIcon';
import { Words } from '@/components/ui/Words';
import { cssVars } from '@/lib/css-vars';

export default function Audience() {
  return (
    <section
      className="audience section-shell"
      id="what-we-do"
      aria-labelledby="audience-heading"
    >
      <div className="audience__heading" data-reveal="title">
        <h2 className="section-title" id="audience-heading">
          <Words text="Для кого мы собираем" />{' '}
          <span>
            <Words text="проекты" from={4} />
          </span>
        </h2>
        <p className="section-lead">{audienceHeading.lead}</p>
      </div>
      <div className="audience__grid">
        {audienceCards.map((item, index) => {
          const example = item.categoryId
            ? featuredCaseForCategory(item.categoryId)
            : null;
          const more = example
            ? `Кейс: ${example.brand} · ${example.title}`
            : 'Обсудить задачу';
          return (
            <article
              className="audience-card"
              key={item.id}
              data-accent={item.accent}
              data-stagger
              data-reveal
              style={cssVars({ '--i': index })}
            >
              <div className="audience-card__body">
                <h3>
                  {example ? (
                    <a
                      className="audience-card__link"
                      href="#cases"
                      data-case-category={item.categoryId}
                      aria-label={`${item.title} — ${more.toLocaleLowerCase('ru-RU')}`}
                    >
                      {item.title}
                    </a>
                  ) : (
                    <a
                      className="audience-card__link"
                      href="#configurator"
                      data-open-contact
                      data-contact-context={item.title}
                      data-contact-source="audience-custom"
                      aria-label={`${item.title} — ${more.toLocaleLowerCase('ru-RU')}`}
                    >
                      {item.title}
                    </a>
                  )}
                </h3>
                <p>{item.lead}</p>
                <ul className="audience-card__tags" role="list">
                  {item.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
                <span className="audience-card__more" aria-hidden="true">
                  {more}
                  <ArrowIcon direction="right" />
                </span>
              </div>
              <span className="audience-card__art" aria-hidden="true">
                <img
                  src={item.image}
                  alt=""
                  width={512}
                  height={512}
                  loading="lazy"
                  decoding="async"
                />
              </span>
            </article>
          );
        })}
      </div>
      <a
        className="telegram-banner"
        data-reveal
        href="#configurator"
        data-open-contact
        data-contact-context="Telegram-бот с web app"
        data-contact-source="audience-telegram"
      >
        <IconTile>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M22 2.4 2.8 10.1c-1 .4-1 1.8.1 2.1l5 1.6 1.8 5.7c.3.9 1.4 1.1 2 .4l2.9-3.2 4.9 3.6c.8.6 1.9.2 2.1-.8L23.5 3.8c.2-1-.6-1.8-1.5-1.4ZM9.2 13.2l9.5-6.1-7.1 7.6-.4 3.1-1.3-4.4-3.8-1.2 3.1 1Z"
            />
          </svg>
        </IconTile>
        <span className="telegram-banner__copy">
          <strong>Также запускаем Telegram-боты с web app</strong>
          <small>
            Онлайн- и офлайн-активности, QR-коды, задания и начисление баллов в
            одном сценарии.
          </small>
        </span>
        <span className="telegram-banner__arrow" aria-hidden="true">
          <ArrowIcon direction="right" />
        </span>
      </a>
    </section>
  );
}
