import { useEffect, useId, useRef, useState } from 'react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { ArrowIcon } from '@/components/ui/ArrowIcon';
import { Dialog } from '@/components/ui/Dialog';
import { celebrate } from '@/lib/celebrate';
import type { Accent } from '@/data/landing';
import {
  shopDemoBalance,
  shopDemoProducts,
  type ShopGlyphName,
  type ShopProduct,
} from '@/data/shop-demo';

const numberFormat = new Intl.NumberFormat('ru-RU');
const fmt = (value: number) => numberFormat.format(value);

/** Сколько последних заказов показываем в списке; остальные учитываются только в счётчике. */
const VISIBLE_ORDERS = 2;
/** Как долго рядом с балансом висит «−280», мс. */
const DELTA_MS = 2200;
/** «Мало»: с такого остатка и ниже подпись окрашивается. */
const LOW_STOCK = 3;

/** ru-склонение: 1 балл, 2 балла, 5 баллов. */
function points(value: number) {
  const hundred = Math.abs(value) % 100;
  const last = hundred % 10;
  if (hundred > 10 && hundred < 20) return 'баллов';
  if (last === 1) return 'балл';
  if (last >= 2 && last <= 4) return 'балла';
  return 'баллов';
}

type Availability = 'ok' | 'short' | 'limit' | 'out';
type Order = { id: number; name: string; price: number };
type Note =
  | { kind: 'done'; name: string; price: number; left: number }
  | { kind: 'reset' };

const initialStock: Record<string, number> = Object.fromEntries(
  shopDemoProducts.map((product) => [product.id, product.stock]),
);

/** Можно ли сейчас взять товар: склад, лимит «в одни руки», баллы — в таком порядке. */
function availability(
  product: ShopProduct,
  balance: number,
  stock: Record<string, number>,
  bought: Record<string, number>,
): Availability {
  if ((stock[product.id] ?? 0) <= 0) return 'out';
  if (product.limit !== undefined && (bought[product.id] ?? 0) >= product.limit)
    return 'limit';
  if (product.price > balance) return 'short';
  return 'ok';
}

/** Иконки товаров: плоские силуэты цвета акцента, детали вырезаны цветом фона окна. */
export function ShopGlyph({ name }: { name: ShopGlyphName }) {
  const svg = {
    viewBox: '0 0 48 48',
    'aria-hidden': true,
    focusable: false,
  } as const;
  switch (name) {
    case 'stickers':
      return (
        <svg {...svg}>
          <rect
            x="9"
            y="7"
            width="27"
            height="27"
            rx="7"
            transform="rotate(-9 22 20)"
            fill="currentColor"
            opacity="0.4"
          />
          <rect
            x="13"
            y="13"
            width="28"
            height="28"
            rx="7.5"
            fill="currentColor"
          />
          <path
            d="M27 19.4L29.06 24.57L34.61 24.93L30.33 28.48L31.7 33.87L27 30.9L22.3 33.87L23.67 28.48L19.39 24.93L24.94 24.57Z"
            fill="var(--shop-ink)"
          />
        </svg>
      );
    case 'mug':
      return (
        <svg {...svg}>
          <path
            d="M10 15h23v17a7 7 0 0 1-7 7h-9a7 7 0 0 1-7-7z"
            fill="currentColor"
          />
          <path
            d="M33 19.5h2.5a5.5 5.5 0 0 1 0 11H33"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          <path
            d="M17 5.5c-1.7 1.9 1.7 3.1 0 5.2M24 5.5c-1.7 1.9 1.7 3.1 0 5.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.5"
          />
          <rect
            x="14.5"
            y="22"
            width="14"
            height="3.4"
            rx="1.7"
            fill="var(--shop-ink)"
            opacity="0.4"
          />
        </svg>
      );
    case 'tee':
      return (
        <svg {...svg}>
          <path
            d="M17 7 7 12l3 9 5-2v21h18V19l5 2 3-9-10-5c-1 3-4 5-7 5s-6-2-7-5z"
            fill="currentColor"
          />
          <path
            d="M17 7c1 3 4 5 7 5s6-2 7-5"
            fill="none"
            stroke="var(--shop-ink)"
            strokeWidth="1.8"
            opacity="0.45"
          />
        </svg>
      );
    case 'hoodie':
      return (
        <svg {...svg}>
          {/* корпус с длинными рукавами */}
          <path
            d="M15.5 12 8.6 15.4Q6.4 16.5 6 19L4.3 33.4Q4.1 35.3 6 35.8L10.6 37Q12.3 37.4 12.6 35.7L13.5 25.5V39.3Q13.5 41.2 15.4 41.2H32.6Q34.5 41.2 34.5 39.3V25.5L35.4 35.7Q35.7 37.4 37.4 37L42 35.8Q43.9 35.3 43.7 33.4L42 19Q41.6 16.5 39.4 15.4L32.5 12Z"
            fill="currentColor"
          />
          {/* капюшон-кольцо и вырез под лицо */}
          <path
            d="M13.8 13.2C13.8 7.4 18.2 3.6 24 3.6S34.2 7.4 34.2 13.2C34.2 17.6 29.7 20.4 24 20.4S13.8 17.6 13.8 13.2Z"
            fill="currentColor"
          />
          <path
            d="M18 12.9C18 9.6 20.5 7.4 24 7.4S30 9.6 30 12.9C30 15.9 27.3 17.8 24 17.8S18 15.9 18 12.9Z"
            fill="var(--shop-ink)"
            opacity="0.7"
          />
          {/* шнурки и карман-«кенгуру» */}
          <path
            d="M21.3 19.2v5.4M26.7 19.2v5.4"
            fill="none"
            stroke="var(--shop-ink)"
            strokeWidth="1.7"
            strokeLinecap="round"
            opacity="0.55"
          />
          <rect
            x="17"
            y="29.5"
            width="14"
            height="8"
            rx="2.2"
            fill="var(--shop-ink)"
            opacity="0.3"
          />
        </svg>
      );
  }
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

/** Карточка-кнопка в панели «Мерч-шоп»: по клику открывается окно с демо-витриной. */
export function ShopLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="shop-launch-wrap">
      <button
        className="shop-launch"
        type="button"
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        <span className="shop-launch__glyphs" aria-hidden="true">
          {(['mug', 'tee', 'hoodie'] as const).map((name) => (
            <span className="shop-launch__tile" key={name}>
              <ShopGlyph name={name} />
            </span>
          ))}
        </span>
        <span className="shop-launch__copy">
          <strong>Попробуйте витрину</strong>
          <span>Демо: выберите товар и обменяйте баллы</span>
        </span>
        <span className="shop-launch__go" aria-hidden="true">
          <ArrowIcon direction="right" />
        </span>
      </button>
    </div>
  );
}

type Props = {
  onClose: () => void;
  /** Цвет окна — акцент механики (data-accent), чтобы иконки и рамки были в её цвете. */
  accent: Accent;
};

/**
 * Демо мерч-шопа: выбор товара → «Обменять» → баллы списываются, остаток и лимит обновляются,
 * заказ попадает в список. Всё состояние локальное: закрыли окно — демо начнётся заново.
 * Варианты — настоящие радио-кнопки (стрелки, скринридер); итог каждого действия озвучивает
 * строка с role="status".
 */
export default function MerchShopDemo({ onClose, accent }: Props) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const [balance, setBalance] = useState(shopDemoBalance);
  const [stock, setStock] = useState(initialStock);
  const [bought, setBought] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [delta, setDelta] = useState<{ id: number; amount: number } | null>(
    null,
  );
  const seq = useRef(0);
  const deltaTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(deltaTimer.current), []);

  const items = shopDemoProducts.map((product) => ({
    product,
    state: availability(product, balance, stock, bought),
    left: stock[product.id] ?? 0,
  }));
  const picked =
    items.find((item) => item.product.id === selected && item.state === 'ok')
      ?.product ?? null;
  const anyAvailable = items.some((item) => item.state === 'ok');

  function buy(origin?: Element) {
    if (!picked) return;
    const id = (seq.current += 1);
    const left = balance - picked.price;
    setBalance(left);
    setStock((current) => ({
      ...current,
      [picked.id]: (current[picked.id] ?? 0) - 1,
    }));
    setBought((current) => ({
      ...current,
      [picked.id]: (current[picked.id] ?? 0) + 1,
    }));
    setOrders((current) => [
      { id, name: picked.name, price: picked.price },
      ...current,
    ]);
    setSelected(null);
    setNote({ kind: 'done', name: picked.name, price: picked.price, left });
    setDelta({ id, amount: picked.price });
    window.clearTimeout(deltaTimer.current);
    deltaTimer.current = window.setTimeout(() => setDelta(null), DELTA_MS);
    celebrate(origin, 22);
  }

  function reset() {
    if (orders.length === 0) return;
    window.clearTimeout(deltaTimer.current);
    setBalance(shopDemoBalance);
    setStock(initialStock);
    setBought({});
    setOrders([]);
    setSelected(null);
    setNote({ kind: 'reset' });
    setDelta(null);
  }

  let hint = 'Выберите товар, чтобы обменять баллы';
  let done = false;
  if (picked) {
    const rest = balance - picked.price;
    hint = `После обмена останется ${fmt(rest)} ${points(rest)}`;
  } else if (note?.kind === 'done') {
    done = true;
    hint = `${note.name}: списано ${fmt(note.price)} ${points(note.price)}, осталось ${fmt(note.left)}.`;
    if (!anyAvailable) hint += ' Обменять больше нечего.';
  } else if (note?.kind === 'reset') {
    hint = `Демо начато заново: снова ${fmt(shopDemoBalance)} ${points(shopDemoBalance)}.`;
  }

  return (
    <Dialog onClose={onClose} labelledBy={titleId} className="shop-dialog">
      <div className="shop-demo" data-accent={accent}>
        <button
          className="dialog-close"
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
        <p className="shop-demo__kicker">Мерч-шоп · демо</p>
        <h3 id={titleId} className="dialog-title">
          Обменяйте баллы на мерч
        </h3>
        <div className="shop-demo__wallet">
          <span className="shop-demo__wallet-label">Ваши баллы</span>
          <span className="shop-demo__wallet-value">
            {delta ? (
              <span
                key={delta.id}
                className="shop-demo__delta"
                aria-hidden="true"
              >
                −{fmt(delta.amount)}
              </span>
            ) : null}
            <span
              className="shop-demo__coin shop-demo__coin--lg"
              aria-hidden="true"
            />
            <strong>
              <AnimatedNumber value={balance} duration={650} />
            </strong>
          </span>
        </div>

        <fieldset className="shop-demo__fieldset">
          <legend className="visually-hidden">Выберите товар</legend>
          <div className="shop-demo__catalog">
            {items.map(({ product, state, left }) => {
              const stockText =
                state === 'out'
                  ? 'Нет в наличии'
                  : left <= LOW_STOCK
                    ? `Осталось ${left}`
                    : `В наличии ${left}`;
              const ruleText =
                state === 'short'
                  ? `Не хватает ${fmt(product.price - balance)}`
                  : state === 'limit'
                    ? 'Лимит исчерпан'
                    : state === 'ok' && product.limit !== undefined
                      ? `Лимит: ${product.limit} на человека`
                      : '';
              const key = `${uid}-${product.id}`;
              return (
                <label
                  className="shop-demo__item"
                  key={product.id}
                  data-state={state}
                >
                  {/* имя для скринридера собираем явно: «Кружка, 280 баллов, в наличии 12», как бы ни стояли блоки на экране */}
                  <input
                    type="radio"
                    name={`${uid}-product`}
                    value={product.id}
                    checked={picked?.id === product.id}
                    disabled={state !== 'ok'}
                    aria-labelledby={`${key}-name ${key}-price ${key}-meta ${key}-rule`}
                    onChange={() => setSelected(product.id)}
                  />
                  <span className="shop-demo__card">
                    <span className="shop-demo__top">
                      <span className="shop-demo__glyph" aria-hidden="true">
                        <ShopGlyph name={product.glyph} />
                      </span>
                      <span className="shop-demo__price" id={`${key}-price`}>
                        <span className="shop-demo__coin" aria-hidden="true" />
                        {fmt(product.price)}
                        <span className="visually-hidden">
                          {' '}
                          {points(product.price)}
                        </span>
                      </span>
                    </span>
                    <span className="shop-demo__title">
                      <span className="shop-demo__name" id={`${key}-name`}>
                        {product.name}
                      </span>
                      <svg
                        className="shop-demo__tick"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path
                          d="M5 10.5l3.2 3.2L15 6.8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span
                      className={`shop-demo__meta${
                        state !== 'out' && left <= LOW_STOCK ? ' is-low' : ''
                      }`}
                      id={`${key}-meta`}
                    >
                      {stockText}
                    </span>
                    <span className="shop-demo__rule" id={`${key}-rule`}>
                      {ruleText}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="shop-demo__bar">
          <p
            className={`shop-demo__hint${done ? ' is-done' : ''}`}
            role="status"
          >
            {hint}
          </p>
          <button
            className="shop-demo__buy"
            type="button"
            aria-disabled={picked ? undefined : true}
            onClick={(event) => buy(event.currentTarget)}
          >
            {picked
              ? `Обменять на ${fmt(picked.price)} ${points(picked.price)}`
              : 'Обменять'}
          </button>
        </div>

        <div className="shop-demo__orders">
          <div className="shop-demo__orders-head">
            <h4 className="shop-demo__orders-title">
              Заказы
              {orders.length > VISIBLE_ORDERS ? ` · ${orders.length}` : ''}
            </h4>
            <button
              className="shop-demo__reset"
              type="button"
              aria-disabled={orders.length === 0 ? true : undefined}
              onClick={reset}
            >
              Начать заново
            </button>
          </div>
          {/* всегда два места: пустые держат высоту окна, поэтому оно не «прыгает» при первом заказе */}
          <ul className="shop-demo__list" role="list">
            {Array.from({ length: VISIBLE_ORDERS }, (_, index) => {
              const order = orders[index];
              if (order) {
                return (
                  <li className="shop-demo__order" key={order.id}>
                    <span className="shop-demo__order-name">{order.name}</span>
                    <span className="shop-demo__status">Оформлен</span>
                    <span className="shop-demo__order-sum">
                      −{fmt(order.price)}
                    </span>
                  </li>
                );
              }
              return index === 0 ? (
                <li className="shop-demo__slot" key="slot-0">
                  Здесь появятся ваши заказы
                </li>
              ) : (
                <li
                  className="shop-demo__slot"
                  key={`slot-${index}`}
                  aria-hidden="true"
                />
              );
            })}
          </ul>
        </div>
        <p className="shop-demo__note">
          Товары и баллы условные, заказы никуда не уходят.
        </p>
      </div>
    </Dialog>
  );
}
