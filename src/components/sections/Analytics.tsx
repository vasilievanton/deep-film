import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { LiveProvider } from '@/components/analytics/charts';
import { Dashboard } from '@/components/analytics/dashboards';
import { Words } from '@/components/ui/Words';
import {
  periods,
  scenarios,
  type PeriodId,
  type ScenarioId,
} from '@/data/analytics';

/**
 * Панель «Следите за проектом в реальном времени».
 * У каждой задачи — своя панель с собственным набором виджетов (components/analytics/dashboards.tsx):
 * организатор HR-программы смотрит на воронку онбординга и рейтинг офисов, организатор мероприятия —
 * на эфир, QR и голосование, трейд-маркетолог — на проверку чеков и призовой фонд.
 * Возможность под вкладкой подсвечивает виджеты, которые за неё отвечают.
 */
export default function Analytics() {
  const uid = useId();
  const [scenarioId, setScenarioId] = useState<ScenarioId>('hr');
  const [period, setPeriod] = useState<PeriodId>(7);
  const [pinned, setPinned] = useState<string | null>(null);
  const [previewed, setPreviewed] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const tabs = useRef<Partial<Record<ScenarioId, HTMLButtonElement | null>>>(
    {},
  );

  const scenario =
    scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const periodMeta = periods.find((item) => item.id === period) ?? periods[0];
  const focus = previewed ?? pinned;

  const select = (id: ScenarioId) => {
    setScenarioId(id);
    setPinned(null);
    setPreviewed(null);
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = scenarios.length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = scenarios[next];
    select(target.id);
    tabs.current[target.id]?.focus();
  };

  return (
    <section
      className="analytics"
      id="analytics"
      aria-labelledby="analytics-heading"
    >
      <div className="analytics__inner">
        <header className="analytics__heading" data-reveal="title">
          <h2 id="analytics-heading">
            <Words text="Следите за проектом" />{' '}
            <span>
              <Words text="в реальном времени" from={3} />
            </span>
          </h2>
          <p>
            Предоставляем постоянный доступ к ключевым показателям на всём
            протяжении проекта. Для каждой задачи — свой набор виджетов, панель
            адаптируем под ваш сценарий. Результаты можно выгрузить.
          </p>
          <span className="analytics__demo">
            Демо-данные — не результаты реального проекта
          </span>
        </header>

        <div
          className="scenario-tabs"
          role="tablist"
          aria-label="Задача проекта"
          data-reveal
        >
          {scenarios.map((item, index) => {
            const selected = item.id === scenarioId;
            return (
              <button
                type="button"
                role="tab"
                id={`${uid}-tab-${item.id}`}
                key={item.id}
                ref={(element) => {
                  tabs.current[item.id] = element;
                }}
                className={selected ? 'is-selected' : ''}
                data-accent={item.accent}
                aria-selected={selected}
                aria-controls={`${uid}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(item.id)}
                onKeyDown={(event) => onTabKey(event, index)}
              >
                <i aria-hidden="true" />
                {item.tab}
              </button>
            );
          })}
        </div>

        <div
          className="analytics-dash"
          ref={stage}
          data-accent={scenario.accent}
          data-reveal="mark"
        >
          <div className="dash-bar">
            <p className="dash-lead" key={scenarioId}>
              {scenario.lead}
            </p>
            <div className="dash-filters">
              <div className="dash-seg" role="group" aria-label="Период">
                {periods.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={item.id === period}
                    onClick={() => setPeriod(item.id)}
                  >
                    {item.short}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="dash-pause"
                onClick={() => setPaused((value) => !value)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  {paused ? (
                    <path d="M5 3.2v9.6l8-4.8z" fill="currentColor" />
                  ) : (
                    <path
                      d="M4.5 3h2.3v10H4.5zM9.2 3h2.3v10H9.2z"
                      fill="currentColor"
                    />
                  )}
                </svg>
                {paused ? 'Продолжить обновление' : 'Остановить обновление'}
              </button>
            </div>
          </div>

          <div className="dash-caps">
            <span className="dash-caps__label" id={`${uid}-caps`}>
              Возможности — нажмите, подсветим на панели
            </span>
            <ul aria-labelledby={`${uid}-caps`}>
              {scenario.caps.map((cap) => (
                <li key={cap.id}>
                  <button
                    type="button"
                    aria-pressed={pinned === cap.id}
                    onClick={() =>
                      setPinned((value) => (value === cap.id ? null : cap.id))
                    }
                    onPointerEnter={(event) => {
                      if (event.pointerType === 'mouse') setPreviewed(cap.id);
                    }}
                    onPointerLeave={() => setPreviewed(null)}
                    onFocus={(event) => {
                      if (event.currentTarget.matches(':focus-visible')) {
                        setPreviewed(cap.id);
                      }
                    }}
                    onBlur={() => setPreviewed(null)}
                  >
                    {cap.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <LiveProvider rootRef={stage} paused={paused}>
            <div
              className="dash"
              role="tabpanel"
              id={`${uid}-panel`}
              aria-labelledby={`${uid}-tab-${scenarioId}`}
              key={`${scenarioId}-${period}`}
              data-view={scenarioId}
              data-focus={focus ?? undefined}
            >
              <Dashboard scenario={scenarioId} period={period} />
            </div>
          </LiveProvider>

          <p className="dash-legend">
            <span>
              ▲ ▼ — изменение к {periodMeta.vs}; зелёным отмечено то, что хорошо
              для проекта, красным — то, что стоит проверить.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
