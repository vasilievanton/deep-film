import { useEffect, useId, useRef, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { ArrowIcon } from '@/components/ui/ArrowIcon';
import { figmaAssets } from '@/lib/figma-assets';
import { openContact } from '@/lib/contact';
import { celebrate } from '@/lib/celebrate';
import { quizQuestions, recommend } from '@/data/mechanics-quiz';

type Props = {
  onClose: () => void;
  /** Человек выбрал рекомендованную механику: показать её в списке на странице. */
  onPick: (catalogIndex: number) => void;
};

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Тест из трёх вопросов. Варианты — настоящие радио-кнопки: работают стрелками, читаются
 * скринридером. Результат — две механики из каталога и переход к обсуждению проекта.
 */
export default function MechanicsQuiz({ onClose, onPick }: Props) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const total = quizQuestions.length;
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    quizQuestions.map(() => null),
  );
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const done = step >= total;

  // На каждом шаге фокус уходит на заголовок вопроса: так смену экрана слышит скринридер.
  useEffect(() => {
    if (step > 0) headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Результат готов — конфетти из заголовка «Вам подойдёт».
  useEffect(() => {
    if (done) celebrate(headingRef.current);
  }, [done]);

  const question = quizQuestions[step];
  const picked = answers[step];
  const result = done ? recommend(answers as number[]) : [];

  function choose(optionIndex: number) {
    setAnswers((current) =>
      current.map((value, index) => (index === step ? optionIndex : value)),
    );
  }

  function discuss() {
    const names = result.map((entry) => entry.item.title);
    const details: Record<string, string> = {};
    quizQuestions.forEach((item, index) => {
      const answer = answers[index];
      if (answer !== null) details[item.title] = item.options[answer].label;
    });
    onClose();
    // Ждём, пока окно теста закроется и вернёт фокус, — и только потом открываем форму.
    window.setTimeout(
      () =>
        openContact({
          context: {
            label: names.join(' и '),
            kicker: 'Результат теста',
            source: 'mechanics-quiz',
            details,
          },
        }),
      0,
    );
  }

  function restart() {
    setAnswers(quizQuestions.map(() => null));
    setStep(0);
  }

  return (
    <Dialog onClose={onClose} labelledBy={titleId} className="quiz-dialog">
      <button
        className="dialog-close"
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
      >
        <CloseIcon />
      </button>

      {!done && question ? (
        <>
          <p className="quiz-dialog__kicker">
            Подбор механики · вопрос {step + 1} из {total}
          </p>
          <div className="quiz-dialog__progress" aria-hidden="true">
            {quizQuestions.map((item, index) => (
              <span
                key={item.title}
                className={index <= step ? 'is-filled' : undefined}
              />
            ))}
          </div>
          <fieldset className="quiz-dialog__fieldset">
            <legend className="quiz-dialog__legend">
              <h3
                id={titleId}
                ref={headingRef}
                tabIndex={-1}
                className="dialog-title"
              >
                {question.title}
              </h3>
            </legend>
            <div className="quiz-dialog__options" key={step}>
              {question.options.map((option, index) => (
                <label className="quiz-option" key={option.label}>
                  <input
                    type="radio"
                    name={`${uid}-q${step}`}
                    checked={picked === index}
                    onChange={() => choose(index)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="quiz-dialog__actions">
            {step > 0 ? (
              <button
                className="quiz-dialog__back"
                type="button"
                onClick={() => setStep((value) => value - 1)}
              >
                Назад
              </button>
            ) : (
              <span />
            )}
            <button
              className="contact-dialog__submit quiz-dialog__next"
              type="button"
              disabled={picked === null}
              onClick={() => setStep((value) => value + 1)}
            >
              {step === total - 1 ? 'Показать результат' : 'Дальше'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="quiz-dialog__kicker">Подбор механики · результат</p>
          <h3
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className="dialog-title"
          >
            Вам подойдёт
          </h3>
          <ul className="quiz-result" role="list">
            {result.map(({ item, index }) => (
              <li key={item.id} data-accent={item.accent}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(index);
                    onClose();
                  }}
                >
                  <span className="mechanic-art">
                    <img
                      src={
                        figmaAssets.mechanicIcons[
                          item.icon as keyof typeof figmaAssets.mechanicIcons
                        ]
                      }
                      alt=""
                      width={256}
                      height={256}
                      decoding="async"
                    />
                  </span>
                  <span className="quiz-result__copy">
                    <strong>{item.title}</strong>
                    <span>{item.summary}</span>
                    <em>Показать в списке</em>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="quiz-dialog__note">
            Это ориентир для разговора: точный набор механик определим на
            коротком брифе.
          </p>
          <div className="quiz-dialog__actions quiz-dialog__actions--result">
            <button
              className="quiz-dialog__back"
              type="button"
              onClick={restart}
            >
              Пройти ещё раз
            </button>
            <button
              className="contact-dialog__submit quiz-dialog__next"
              type="button"
              onClick={discuss}
            >
              Обсудить проект
              <ArrowIcon className="quiz-dialog__arrow" />
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
