import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  caseBrand,
  caseCategories,
  cases,
  type CaseCategoryId,
} from '@/data/landing';
import { ArrowButton } from '@/components/ui/ArrowButton';
import { ArrowIcon } from '@/components/ui/ArrowIcon';
import { Words } from '@/components/ui/Words';

export default function CaseStudy() {
  const [activeCategory, setActiveCategory] = useState<CaseCategoryId>(
    caseCategories[0].id,
  );
  const [activeCaseId, setActiveCaseId] = useState('');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const category =
    caseCategories.find((item) => item.id === activeCategory) ??
    caseCategories[0];
  const categoryCases = cases.filter((item) => item.categoryId === category.id);
  const current =
    categoryCases.find((item) => item.id === activeCaseId) ?? categoryCases[0];

  function selectCategory(id: CaseCategoryId) {
    setActiveCategory(id);
    setActiveCaseId('');
  }

  // Карточки блока «Для кого» и кнопки «Для задач» в первом экране открывают нужную задачу в этом разделе.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const trigger = (event.target as Element | null)?.closest?.(
        '[data-case-category]',
      );
      const id = trigger?.getAttribute('data-case-category');
      const category = caseCategories.find((item) => item.id === id);
      if (!trigger || !category) return;
      setActiveCategory(category.id);
      setActiveCaseId(trigger.getAttribute('data-case-id') ?? '');
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // Ссылка вида /#case-<id> (со страницы «Все кейсы», из закладки или письма) открывает нужный проект.
  // К самому разделу страница прокручивается без скриптов: якоря `case-<id>` лежат над вкладками.
  useEffect(() => {
    function openFromHash() {
      const match = /^#case-([\w-]+)$/.exec(window.location.hash);
      const item = match
        ? cases.find((entry) => entry.id === match[1])
        : undefined;
      if (!item) return;
      setActiveCategory(item.categoryId);
      setActiveCaseId(item.id);
    }
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  function onTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const last = caseCategories.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % caseCategories.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + caseCategories.length) % caseCategories.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    selectCategory(caseCategories[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className="case-study" id="cases" aria-labelledby="case-heading">
      <div className="case-study__inner">
        <div className="case-study__heading-row" data-reveal="title">
          <div>
            <h2 className="section-title" id="case-heading">
              <Words text="Кейсы" />
              <br />
              <span>
                <Words text="по задачам" from={1} />
              </span>
            </h2>
            <p className="section-lead">
              Выберите задачу — покажем проект: что нужно было сделать, что
              собрали и чем всё закончилось.
            </p>
          </div>
          <a className="compact-cta" href="/cases">
            Все кейсы
            <span className="compact-cta__icon" aria-hidden="true">
              <ArrowIcon />
            </span>
          </a>
        </div>
        <span className="case-anchors" aria-hidden="true">
          {cases.map((item) => (
            <span id={`case-${item.id}`} key={item.id} />
          ))}
        </span>
        <div className="case-study__filter" data-reveal>
          <span id="case-filter-label">Задача</span>
          <div
            className="chip-strip"
            role="tablist"
            aria-labelledby="case-filter-label"
          >
            {caseCategories.map((item, index) => {
              const selected = item.id === activeCategory;
              return (
                <button
                  className={`chip${selected ? ' chip--selected' : ''}`}
                  key={item.id}
                  data-accent={item.accent}
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`case-tab-${item.id}`}
                  aria-selected={selected}
                  aria-controls="case-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectCategory(item.id)}
                  onKeyDown={(event) => onTabKeyDown(event, index)}
                >
                  {item.title}
                </button>
              );
            })}
          </div>
        </div>
        {categoryCases.length > 1 ? (
          // без data-reveal: блок появляется и пропадает при смене задачи, а наблюдатель прокрутки
          // видит только то, что было на странице при загрузке
          <div className="case-study__examples">
            <span id="case-examples-label">Проекты</span>
            <div
              className="case-switch"
              role="group"
              aria-labelledby="case-examples-label"
            >
              {categoryCases.map((item) => (
                <button
                  className={`case-switch__item${item.id === current.id ? ' is-active' : ''}`}
                  key={item.id}
                  data-brand={item.theme}
                  type="button"
                  aria-pressed={item.id === current.id}
                  onClick={() => setActiveCaseId(item.id)}
                >
                  <b>{item.brand}</b>
                  {item.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div
          className="case-study__body"
          id="case-panel"
          data-reveal
          role="tabpanel"
          aria-labelledby={`case-tab-${category.id}`}
        >
          <article
            className={`case-visual case-visual--${current.artwork} case-visual--cover case-visual--brand`}
            data-brand={current.theme}
            aria-label={`Пример: ${caseBrand(current)} — ${current.title}`}
          >
            <div className="case-visual__art" aria-hidden="true">
              <img
                className="case-visual__image"
                key={current.id}
                src={current.cover}
                alt=""
                width={1536}
                height={1024}
                decoding="async"
              />
            </div>
            <div className="case-visual__meta" key={category.id}>
              КЕЙС <span>•</span> {category.title.toLocaleUpperCase('ru-RU')}
            </div>
            <header className="case-visual__head" key={current.id}>
              <h3>
                {current.brand}
                {current.brandNote ? (
                  <>
                    {' '}
                    <small className="case-visual__brand-note">
                      ({current.brandNote})
                    </small>
                  </>
                ) : null}
              </h3>
              <h4>{current.title}</h4>
              <p>{current.description}</p>
            </header>
            <div className="case-visual__cta">
              <ArrowButton
                href="#configurator"
                openContact
                context={`${caseBrand(current)} — ${current.title}`}
                kicker="Похожий проект"
                source={`case-${current.id}`}
              >
                Обсудить такой проект
              </ArrowButton>
            </div>
          </article>
          <div
            className="case-story"
            data-accent={category.accent}
            key={current.id}
          >
            <section className="case-story__block">
              <h5 className="case-story__label">Задача</h5>
              <p>{current.task}</p>
            </section>
            <section className="case-story__block">
              <h5 className="case-story__label">Что собрали</h5>
              <ul className="case-story__list" role="list">
                {current.built.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section className="case-story__block">
              <h5 className="case-story__label">Итог</h5>
              {current.outcome.some((item) => item.value) ? (
                <div className="case-story__metrics">
                  {current.outcome.map((item) => (
                    <div key={`${item.value ?? ''}-${item.text}`}>
                      <strong>{item.value}</strong>
                      <small>{item.text}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="case-story__list" role="list">
                  {current.outcome.map((item) => (
                    <li key={item.text}>{item.text}</li>
                  ))}
                </ul>
              )}
            </section>
            {current.facts.length > 0 ? (
              <dl className="case-story__facts">
                {current.facts.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
