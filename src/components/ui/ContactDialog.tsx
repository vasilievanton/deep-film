import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { celebrate } from '@/lib/celebrate';
import {
  LeadError,
  OPEN_CONTACT_EVENT,
  POLICY_URL,
  checkContact,
  checkName,
  formIsLive,
  submitLead,
  type ContactContext,
  type ContactKind,
  type OpenContactDetail,
} from '@/lib/contact';

type Fields = {
  name: string;
  contact: string;
  details: string;
  website: string;
};
type FieldName = 'name' | 'contact';
type FieldErrors = Partial<Record<FieldName, string>>;
type Phase = 'editing' | 'sending' | 'sent';

const emptyFields: Fields = { name: '', contact: '', details: '', website: '' };

function failureText(error: unknown): string {
  if (error instanceof LeadError) {
    if (error.reason === 'offline') {
      return 'Нет соединения с интернетом. Проверьте подключение и отправьте заявку ещё раз.';
    }
    if (error.reason === 'timeout') {
      return 'Сервер слишком долго не отвечает. Попробуйте ещё раз через минуту.';
    }
  }
  return 'Не удалось отправить заявку. Попробуйте ещё раз — набранный текст сохранён.';
}

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

function AlertIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 4.6v4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.2" r=".9" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.5 12.5l4.2 4.2 8.8-9.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Окно «Расскажите о задаче». Одно на страницу: открывается по клику на любой элемент
 * с `data-open-contact` (шапка, hero, подвал, карточки) и по событию `openContact()` из конструктора.
 * Набранный текст сохраняется, пока заявка не отправлена; после отправки форма очищается.
 */
export default function ContactDialog() {
  const uid = useId();
  const titleId = `${uid}-title`;
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('editing');
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [context, setContext] = useState<ContactContext | null>(null);
  const [sent, setSent] = useState<{ kind: ContactKind; value: string } | null>(
    null,
  );
  const doneRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function show(next: ContactContext | null) {
      setContext(next);
      setFailure(null);
      setErrors({});
      setPhase((current) => (current === 'sent' ? 'editing' : current));
      setOpen(true);
    }

    // Любая кнопка «Обсудить проект» на странице открывает форму. Без JS такая ссылка просто ведёт
    // к разделу «Соберите пример проекта».
    function onClick(event: MouseEvent) {
      const trigger = (event.target as Element | null)?.closest?.(
        '[data-open-contact]',
      );
      if (
        !trigger ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      const label = trigger.getAttribute('data-contact-context');
      show(
        label
          ? {
              label,
              kicker:
                trigger.getAttribute('data-contact-kicker') ?? 'Интересует',
              source: trigger.getAttribute('data-contact-source') ?? 'page',
            }
          : null,
      );
    }

    function onOpen(event: Event) {
      show((event as CustomEvent<OpenContactDetail>).detail?.context ?? null);
    }

    document.addEventListener('click', onClick);
    window.addEventListener(OPEN_CONTACT_EVENT, onOpen);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener(OPEN_CONTACT_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'sent') return;
    doneRef.current?.focus({ preventScroll: true });
    celebrate(doneRef.current);
  }, [phase]);

  function close() {
    if (phase === 'sending') return;
    setOpen(false);
  }

  function setField(name: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [name]: value }));
    // Ошибку, которую уже показали, снимаем сразу, как только поле исправлено.
    if (name === 'name' || name === 'contact') {
      setErrors((current) => {
        if (!current[name]) return current;
        const result = name === 'name' ? checkName(value) : checkContact(value);
        return { ...current, [name]: result.ok ? undefined : result.error };
      });
    }
  }

  // Формат проверяем, когда человек ушёл из заполненного поля; «обязательное» — только при отправке.
  function onBlur(name: FieldName) {
    const value = fields[name];
    if (!value.trim()) return;
    const result = name === 'name' ? checkName(value) : checkContact(value);
    setErrors((current) => ({
      ...current,
      [name]: result.ok ? undefined : result.error,
    }));
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase === 'sending') return;
    const name = checkName(fields.name);
    const contact = checkContact(fields.contact);
    const nextErrors: FieldErrors = {};
    if (!name.ok) nextErrors.name = name.error;
    if (!contact.ok) nextErrors.contact = contact.error;
    setErrors(nextErrors);
    if (!name.ok) {
      nameRef.current?.focus();
      return;
    }
    if (!contact.ok) {
      contactRef.current?.focus();
      return;
    }

    setFailure(null);
    setPhase('sending');
    try {
      // Скрытое поле «website» заполняют только боты: им отвечаем как обычно, но ничего не отправляем.
      if (!fields.website.trim()) {
        await submitLead({
          name: name.value,
          contact: contact.value,
          contactKind: contact.kind,
          message: fields.details.trim(),
          project: context
            ? {
                // в заявке подпись самодостаточна: «Из конструктора: Вовлечение команды · до 500 сотрудников»
                label: `${context.kicker ?? 'Из конструктора'}: ${context.label}`,
                source: context.source,
                details: context.details,
              }
            : null,
          page: `${window.location.pathname}${window.location.hash}`,
          sentAt: new Date().toISOString(),
          consent: { accepted: true, policyUrl: POLICY_URL },
        });
      }
      setSent({ kind: contact.kind, value: contact.value });
      setFields(emptyFields);
      setContext(null);
      setPhase('sent');
    } catch (error) {
      setFailure(failureText(error));
      setPhase('editing');
      window.requestAnimationFrame(() => submitRef.current?.focus());
    }
  }

  function removeContext() {
    setContext(null);
    window.requestAnimationFrame(() => nameRef.current?.focus());
  }

  if (!open) return null;

  const sending = phase === 'sending';

  return (
    <Dialog
      onClose={close}
      labelledBy={titleId}
      className="contact-dialog"
      initialFocus="input[name='name']"
    >
      <button
        className="contact-dialog__close"
        type="button"
        aria-label="Закрыть"
        aria-disabled={sending}
        onClick={close}
      >
        <CloseIcon />
      </button>

      {phase === 'sent' && sent ? (
        <div className="contact-done" ref={doneRef} tabIndex={-1} role="status">
          <span className="contact-done__icon" aria-hidden="true">
            <CheckIcon />
          </span>
          <h3 id={titleId}>Заявка отправлена</h3>
          <p>
            {sent.kind === 'email' ? 'Ответим на почту' : 'Свяжемся по номеру'}{' '}
            <b>{sent.value}</b>, чтобы обсудить детали проекта.
          </p>
          {!formIsLive && (
            <p className="contact-done__demo">
              Тестовая версия сайта: форма пока не подключена к CRM, поэтому
              заявка никуда не ушла.
            </p>
          )}
          <button
            className="contact-dialog__secondary"
            type="button"
            onClick={close}
          >
            Закрыть
          </button>
        </div>
      ) : (
        <>
          <h3 id={titleId} className="contact-dialog__title">
            Расскажите о задаче
          </h3>

          {context && (
            <div className="contact-context">
              <span className="contact-context__kicker">
                {context.kicker ?? 'Из конструктора'}
              </span>
              <span className="contact-context__text">{context.label}</span>
              <button
                className="contact-context__remove"
                type="button"
                aria-label="Не добавлять в заявку"
                title="Не добавлять в заявку"
                onClick={removeContext}
              >
                <CloseIcon />
              </button>
            </div>
          )}

          <form className="contact-form" onSubmit={handleSubmit} noValidate>
            <div className="contact-field">
              <label htmlFor={`${uid}-name`}>
                Как к вам обращаться <em aria-hidden="true">*</em>
              </label>
              <input
                ref={nameRef}
                id={`${uid}-name`}
                type="text"
                name="name"
                autoComplete="name"
                required
                aria-required="true"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? `${uid}-name-error` : undefined}
                value={fields.name}
                readOnly={sending}
                onChange={(event) => setField('name', event.target.value)}
                onBlur={() => onBlur('name')}
              />
              {errors.name && (
                <p className="contact-field__error" id={`${uid}-name-error`}>
                  <AlertIcon />
                  {errors.name}
                </p>
              )}
            </div>

            <div className="contact-field">
              <label htmlFor={`${uid}-contact`}>
                Почта или телефон <em aria-hidden="true">*</em>
              </label>
              <input
                ref={contactRef}
                id={`${uid}-contact`}
                type="text"
                name="contact"
                autoComplete="email"
                required
                aria-required="true"
                placeholder="name@company.ru или +7 900 000-00-00"
                aria-invalid={Boolean(errors.contact)}
                aria-describedby={
                  errors.contact ? `${uid}-contact-error` : undefined
                }
                value={fields.contact}
                readOnly={sending}
                onChange={(event) => setField('contact', event.target.value)}
                onBlur={() => onBlur('contact')}
              />
              {errors.contact && (
                <p className="contact-field__error" id={`${uid}-contact-error`}>
                  <AlertIcon />
                  {errors.contact}
                </p>
              )}
            </div>

            <div className="contact-field">
              <label htmlFor={`${uid}-details`}>
                Что хотите запустить <small>(необязательно)</small>
              </label>
              <textarea
                id={`${uid}-details`}
                name="details"
                rows={3}
                maxLength={2000}
                placeholder={
                  context
                    ? 'Что ещё важно: сроки, площадки, бюджет'
                    : 'Задача, аудитория, сроки — в двух словах'
                }
                value={fields.details}
                readOnly={sending}
                onChange={(event) => setField('details', event.target.value)}
              />
            </div>

            <div className="contact-form__trap" aria-hidden="true">
              <label>
                Сайт
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={fields.website}
                  onChange={(event) => setField('website', event.target.value)}
                />
              </label>
            </div>

            {failure && (
              <p className="contact-form__alert" role="alert">
                <AlertIcon />
                {failure}
              </p>
            )}

            <button
              ref={submitRef}
              className="contact-dialog__submit"
              type="submit"
              aria-disabled={sending}
              aria-busy={sending}
            >
              {sending ? (
                <>
                  <span
                    className="contact-dialog__spinner"
                    aria-hidden="true"
                  />
                  Отправляем…
                </>
              ) : failure ? (
                'Отправить ещё раз'
              ) : (
                'Отправить заявку'
              )}
            </button>

            <p className="contact-form__legal">
              Нажимая «Отправить заявку», вы соглашаетесь на обработку
              персональных данных в соответствии с{' '}
              <a href={POLICY_URL} target="_blank" rel="noopener noreferrer">
                Политикой конфиденциальности
              </a>
              .
            </p>
          </form>
        </>
      )}
    </Dialog>
  );
}
