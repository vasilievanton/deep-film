import { useMemo, useState } from 'react';
import { figmaAssets } from '@/lib/figma-assets';
import { openContact } from '@/lib/contact';
import { IconTile } from '@/components/ui/IconTile';
import { ArrowIcon } from '@/components/ui/ArrowIcon';
import { Words } from '@/components/ui/Words';
import { buildExample, defaultSelection, questions } from '@/data/configurator';

/** Номер вопроса «Что добавить?» — единственный с множественным выбором. */
const MODULES_QUESTION = 2;

function isDefault(selection: readonly (readonly number[])[]) {
  return selection.every(
    (items, index) =>
      items.length === defaultSelection[index].length &&
      items.every(
        (value, position) => value === defaultSelection[index][position],
      ),
  );
}

export default function Configurator() {
  const [selection, setSelection] = useState<number[][]>(() =>
    defaultSelection.map((items) => [...items]),
  );
  const example = useMemo(() => buildExample(selection), [selection]);
  const { title, description } = example;
  const modulesEmpty = selection[MODULES_QUESTION].length === 0;

  function toggle(questionIndex: number, optionIndex: number) {
    setSelection((current) =>
      current.map((items, index) => {
        if (index !== questionIndex) return items;
        if (!questions[questionIndex].multiple) return [optionIndex];
        // Модули можно снять все: пример тогда честно скажет «подберём вместе».
        return items.includes(optionIndex)
          ? items.filter((item) => item !== optionIndex)
          : [...items, optionIndex].sort((a, b) => a - b);
      }),
    );
  }

  // Выбор из конструктора попадает в заявку, только если его действительно меняли:
  // пример по умолчанию — это витрина, а не ответ человека.
  function discuss() {
    openContact({
      context: isDefault(selection)
        ? null
        : {
            label: `${example.title} · ${example.scaleText}`,
            source: 'configurator',
            details: {
              Задача: example.task.label,
              Масштаб: example.scaleText,
              Модули: example.moduleLabels.join(', ') || 'не выбраны',
              Интеграции: example.integrationLabels.join(', ') || 'нет',
            },
          },
    });
  }

  return (
    <section
      className="configurator"
      id="configurator"
      aria-labelledby="configurator-heading"
    >
      <div className="configurator__inner">
        <header className="configurator__intro" data-reveal="title">
          <h2 id="configurator-heading">
            <span>
              <Words text="Соберите пример" />
            </span>{' '}
            <Words text="своего проекта" from={2} />
          </h2>
          <p>
            Выберите задачу, масштаб и модули — покажем, как мог бы выглядеть
            ваш проект. Готовые модули ускоряют запуск, а
            <br className="desktop-break" /> дизайн, контент и сценарий мы
            делаем под вас.
          </p>
        </header>
        <div className="configurator__columns">
          <div className="builder-panel" data-reveal>
            <h3>
              Настройте <span>свой проект</span>
            </h3>
            {questions.map((question, questionIndex) => (
              <fieldset
                className="builder-question"
                key={question.title}
                data-accent={question.accent}
              >
                <IconTile>
                  <img
                    src={figmaAssets.configuratorIcons[questionIndex]}
                    alt=""
                  />
                </IconTile>
                <div className="builder-question__content">
                  <legend>{question.title}</legend>
                  {question.hint && (
                    <p className="builder-question__hint">{question.hint}</p>
                  )}
                  <div
                    className="builder-options"
                    role="group"
                    aria-label={question.title}
                  >
                    {question.options.map((option, optionIndex) => {
                      const selected =
                        selection[questionIndex].includes(optionIndex);
                      return (
                        <button
                          className={selected ? 'is-selected' : ''}
                          type="button"
                          key={option}
                          aria-pressed={selected}
                          onClick={() => toggle(questionIndex, optionIndex)}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  {questionIndex === MODULES_QUESTION && modulesEmpty && (
                    <p className="builder-question__empty" role="status">
                      Модули не выбраны — подберём набор вместе после брифа.
                    </p>
                  )}
                </div>
              </fieldset>
            ))}
          </div>
          <aside className="project-summary" aria-live="polite" data-reveal>
            <span className="project-summary__eyebrow">Детали проекта</span>
            <h3 key={title}>{title}</h3>
            <p key={description}>{description}</p>
            <div className="summary-tags">
              {[...example.integrationLabels, ...example.moduleLabels].map(
                (tag) => (
                  <span key={tag}>{tag}</span>
                ),
              )}
              {modulesEmpty && (
                <span className="summary-tags__empty">
                  Модули — подберём вместе
                </span>
              )}
            </div>
            <div className="summary-facts">
              <div>
                <IconTile>
                  <img src={figmaAssets.configuratorIcons[2]} alt="" />
                </IconTile>
                <span>
                  Состав проекта
                  <strong>{example.compositionText}</strong>
                </span>
              </div>
              <div>
                <IconTile>
                  <img src={figmaAssets.configuratorIcons[1]} alt="" />
                </IconTile>
                <span>
                  Масштаб проекта
                  <strong>{example.scaleText}</strong>
                </span>
              </div>
            </div>
            <p className="project-summary__note">
              Запуск на готовых модулях — от 1 недели. Кастомные механики и
              интеграции занимают больше времени: срок назовём после брифа.
            </p>
            <div className="project-summary__cta">
              <button
                className="arrow-button arrow-button--light"
                type="button"
                onClick={discuss}
              >
                <span>Обсудить проект</span>
                <span aria-hidden="true" className="arrow-button__icon">
                  <ArrowIcon className="arrow-button__arrow" />
                </span>
              </button>
              <small>Расскажем, как адаптировать под ваши задачи</small>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
