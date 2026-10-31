/**
 * Движок «фильма»: прокрутка страницы — это ползунок на таймлайне.
 *
 * Страница — высокий блок, внутри него закреплён один экран (sticky). Один слушатель прокрутки
 * считает положение в «экранах», слегка сглаживает его и для видимой сцены пишет прогресс `q` (0…1).
 * Каждая сцена — функция от `q` (см. ./scenes), поэтому прокрутка назад проигрывает её задом наперёд.
 *
 * Доводка: у каждой сцены есть опорные кадры (`stops`) — моменты, когда она собрана целиком. Пока человек
 * крутит, лента едет за ним; стоит остановиться между кадрами, и движок сам доводит прокрутку до
 * ближайшего кадра в сторону движения (первый кадр после остановки — вперёд, если крутили вниз). Так анимация
 * не застревает на середине: ни недопечатанной фразы, ни наполовину «расшифрованных» названий.
 *
 * Один жест — один кадр: как бы сильно ни крутили, один взмах колеса, свайп или нажатие клавиши уводит ленту не
 * дальше соседнего опорного кадра. Жест начинается со входа и кончается той же тишиной, что запускает доводку; пока
 * он идёт, у ленты есть стенки (см. `Gesture`), а страница под ней прижимается к стенке. Следующий кадр открывается,
 * только когда человек добавил: развернул колесо, нажал клавишу ещё раз, сделал новый взмах поверх затухающего
 * «хвоста» инерции, давит ровно и долго или снова коснулся экрана. Аккуратная прокрутка работает как раньше.
 *
 * Темп: когда лента едет сама (доводка, а в жесте — бег к стенке), она идёт не с одинаковой скоростью по странице, а
 * по «времени фильма». Сцены сами говорят (`tempo`), сколько секунд играется каждый их участок, поэтому печать, плашки
 * и счёт чисел не пролетают за доли секунды, а переходы без эффектов идут быстро (`SECONDS_PER_SCREEN`). Пока лента
 * идёт за рукой (колесо, палец), её держит только щедрый предел `FOLLOW_RATE`; ползунок полосы прокрутки и Home/End
 * ничем не ограничены.
 *
 * Телефон и планшет: тот же движок, другая раскладка. «Узкой» считается раскладка, когда окно выше, чем шире
 * (`(max-aspect-ratio: 1/1)`): CSS и замеры сцен переключаются сами, без перезагрузки. Высота экрана берётся
 * у закреплённого блока (`100svh`), а не у окна: адресная строка мобильного браузера её не трогает. Палец
 * на экране — то же, что полоса прокрутки: пока он двигается, доводки нет, она начинается после того, как
 * палец отпущен и инерция докатилась. Палец, который давно лежит неподвижно (большой палец держащей руки,
 * потерянное «отпустили»), доводку не держит, а каждое новое касание начинает жест, сколько бы пальцев ни лежало.
 * В сценах с лентой, которая едет влево (кейсы), свайп вбок тоже листает кадры (`sideways`).
 *
 * Телефон (маленький экран, палец): ленту листает движок, а не браузер. На ленте браузер не прокручивает страницу
 * под пальцем (`touch-action: none`, см. stage.css), поэтому нет инерции, которая спорила бы со стенками, и адресная
 * строка не «шевелит» окно посреди жеста. Свайп — один шаг к соседнему опорному кадру (`stepFilm`), а за последним
 * кадром следующий свайп вверх уводит к обычной странице (FAQ списком, подвал), которую браузер листает сам. На
 * планшете и компьютере всё работает как описано выше. Для проверки на настоящем телефоне: `?debug` (панель
 * счётчиков, см. debug.ts), `?steps=0` и `?steps=1` — выключить или включить телефонный режим.
 *
 * Страховка: класс `film-live` ставит инлайн-скрипт в <head> (нет «уменьшить движение»);
 * `film-ready` движок ставит сам, когда всё разобрано. Если что-то пошло не так, `film-live` снимается и
 * остаётся обычная колонка — текст виден без анимаций.
 */
import { scenes as sceneList, totalScreens } from '@/data/film';
import { createCases } from './scenes/cases';
import { createFaq } from './scenes/faq';
import { createFinal } from './scenes/final';
import { createMech } from './scenes/mech';
import { createMts } from './scenes/mts';
import { createProcess } from './scenes/process';
import { createSpeed } from './scenes/speed';
import { createStart } from './scenes/start';
import { createWhat } from './scenes/what';
import { createWho } from './scenes/who';
import { createDebug } from './debug';
import type { FilmMetrics, SceneController, SceneFactory } from './types';
import { clamp, lerp, pad2, setClass, setText, setVar, smooth } from './util';

const FACTORIES: Record<string, SceneFactory> = {
  start: createStart,
  what: createWhat,
  speed: createSpeed,
  mech: createMech,
  mts: createMts,
  cases: createCases,
  who: createWho,
  process: createProcess,
  faq: createFaq,
  final: createFinal,
};

/** Пауза между сценами в экранах: на каждой границе экран пустой, горит только служебный слой. */
const PAUSE = 0.07;
/** Сглаживание прокрутки: за сколько секунд сцена догоняет колесо. */
const SMOOTH = 0.085;
/** Во время доводки лента сглаживается быстрее: она должна идти за прокруткой почти вплотную. */
const FOLLOW = 0.03;
/** Длина «минуты» на таймкоде служебного слоя. */
const FILM_SECONDS = 60;
const FRAMES_PER_SECOND = 60;
/** Сцена видна, пока её прогресс внутри этого окна; на границах — глитч-склейка. */
const VISIBLE_FROM = 0.015;
const VISIBLE_TO = 0.985;
const CUT_MS = 170;
/** Прыжок длиннее этого (в экранах) не сглаживается: сцены меняются склейкой. */
const JUMP_CUT = 2.6;
/** Наклон «камеры» за курсором, градусов (в углу экрана). */
const TILT_DEG = 2;
/** Сколько тишины (мс) после последнего движения прокрутки, прежде чем доводить до опорного кадра. */
const SETTLE_IDLE_MS = 140;
/** Ближе этого (px) к опорному кадру — просто возвращаемся на него (случайное подрагивание колеса). */
const SNAP_PX = 26;
/** Допуск (px): уже стоим на кадре. */
const AT_REST_PX = 3;
/**
 * Темп ленты. «Время фильма» — секунды, которые участок страницы играется при доводке: обычный экран идёт за
 * SECONDS_PER_SCREEN, а участки, где сцена просит больше (`tempo`), — за столько, сколько она назвала. Резкие границы
 * участков размываются (TEMPO_BLUR), чтобы скорость не прыгала.
 */
const SECONDS_PER_SCREEN = 0.42;
const TEMPO_STEP = 0.005;
const TEMPO_BLUR = 0.05;
/**
 * Доводка играет путь трапецией скорости: разгон SETTLE_RAMP_IN_MS, ход в нормальном темпе, торможение
 * SETTLE_RAMP_OUT_MS (мягкая посадка на кадр). Короткий путь не короче SETTLE_MIN_MS; SETTLE_MAX_MS — страховка.
 */
const SETTLE_RAMP_IN_MS = 140;
const SETTLE_RAMP_OUT_MS = 450;
const SETTLE_MIN_MS = 320;
const SETTLE_MAX_MS = 6000;
/** Кнопка мыши давно нажата на полосе прокрутки, а страница молчит: считаем, что «отпустили» потерялось, и снимаем блокировку. */
const HOLD_GUARD_MS = 2500;
/**
 * Палец держит доводку, пока двигается (или только что лёг). Единственный палец, который замер, держит её ещё
 * FINGER_REST_MS: человек мог просто остановиться посреди движения. Когда на экране несколько пальцев, замерший палец
 * держит её только FINGER_CROWD_MS: это большой палец держащей руки, который остаётся на экране, пока другой палец
 * листает (и потерянное «отпустили» у одного из них). Двигается — сдвинулся дальше FINGER_MOVE_PX от места, где
 * его видели в прошлый раз.
 */
const FINGER_REST_MS = 800;
const FINGER_CROWD_MS = 250;
const FINGER_MOVE_PX = 6;
/** Свайп вбок в сцене с лентой (кейсы) листает кадры: не короче SIDE_PX, заметно горизонтальный, не дольше SIDE_MAX_MS. */
const SIDE_PX = 44;
const SIDE_RATIO = 1.8;
const SIDE_MAX_MS = 900;
/** …и страница по вертикали при этом сдвинулась не больше (px): иначе это обычная диагональная прокрутка. */
const SIDE_MAX_SCROLL = 40;
/**
 * Телефон: палец прошёл по главной оси не меньше STEP_PX — это свайп, и лента делает один шаг к соседнему кадру (вверх —
 * вперёд, вниз — назад, а в сцене с лентой вбок ещё и влево-вправо). Пока лента едет, следующие свайпы ставят в очередь
 * следующие кадры, но не дальше STEP_QUEUE кадров от того места, где лента сейчас: нетерпеливые свайпы не теряются
 * и не уносят ленту через полфильма. Выход за последний кадр к обычной странице проигрывается EXIT_MS (мс).
 * «Телефон» — физический экран, у которого меньшая сторона короче PHONE_MAX (px), а указатель — палец.
 */
const STEP_PX = 24;
const STEP_QUEUE = 3;
const EXIT_MS = 650;
const PHONE_MAX = 600;
/** Колесо повернули в другую сторону сильнее этого (px): это уже новый жест. */
const FLIP_FORCE = 6;
/**
 * Новый взмах поверх затухающего «хвоста» инерции: за последние 80 мс колесо прокрутило не меньше этого (px) и
 * в SURGE_RATIO раза больше, чем за каждые из двух предыдущих отрезков по 80 мс. Хвост одного взмаха только слабеет,
 * ровный рывок колеса не растёт, поэтому под это не подходят ни он, ни случайная пауза посреди рывка.
 */
const SURGE_SUM = 30;
const SURGE_RATIO = 2.5;
/** …и случилось не раньше, чем через столько мс после того, как лента упёрлась в стенку. */
const SURGE_AFTER_MS = 250;
/**
 * Поток шагов споткнулся (главный поток занят, кадр затянулся): накопившееся приходит разом, и после паузы это
 * выглядит как вспыхнувший новый взмах. Если между двумя шагами прошло не меньше STALL_MS, взмахом считаем только то,
 * что осталось заметным ещё STALL_CALM_MS спустя: «пачка» за это время выходит из окна в 80 мс, а настоящий взмах
 * никуда не девается и распознаётся чуть позже.
 */
const STALL_MS = 60;
const STALL_CALM_MS = 100;
/**
 * Колесо крутят ровно, клавишу держат: у стенки каждые столько мс открывается следующий кадр, пока давление не
 * слабеет (за последние 200 мс прокручено не меньше этого (px) и не меньше 3/4 от предыдущих 200 мс).
 */
const HOLD_STEP_MS = 600;
const STEADY_SUM = 40;
/**
 * …и не меньше этой доли от самого сильного отрезка в 200 мс с начала жеста (или с прошлого открытого кадра). Хвост
 * инерции, даже медленно затухающий, к этому моменту уже в разы слабее пика; колесо, которое крутят ровно, и
 * зажатая клавиша остаются на уровне пика.
 */
const STEADY_KEEP = 0.5;
/** Усилие повтора зажатой клавиши (px): у клавиши нет «силы», берём как у щелчка колеса. */
const KEY_FORCE = 100;
/**
 * Предел скорости ленты в жесте, «секунд фильма» в секунду. Резкий взмах мгновенно отправляет страницу к стенке, и без
 * предела лента пролетала бы сцену за четверть секунды. Пока лента ещё не дошла до стенки, предел щедрый (FOLLOW_RATE:
 * палец и колесо ведут её почти как раньше); как только упёрлась, она проигрывает остаток пути в обычном темпе
 * (PLAY_RATE чуть выше хода доводки, чтобы не отставать от неё). Нажатие клавиши — готовая команда, а не движение
 * руки: страница уезжает сама (PageDown — почти на экран), поэтому для неё PLAY_RATE с первого мгновения.
 */
const FOLLOW_RATE = 3;
const PLAY_RATE = 1.15;
/** Подхваченная на ходу доводка засчитывается шагом, если после этого ленту сдвинули хотя бы на столько (px). */
const CHAIN_PX = 20;
/** Клавиши, которыми листают страницу: после них тоже доводим до кадра. */
const SCROLL_KEYS: Record<string, 1 | -1> = {
  ArrowDown: 1,
  PageDown: 1,
  ' ': 1,
  End: 1,
  ArrowUp: -1,
  PageUp: -1,
  Home: -1,
};

type Slot = {
  id: string;
  el: HTMLElement;
  controller: SceneController;
  start: number;
  len: number;
  /** Положение опорных кадров на странице, px. */
  stopYs: number[];
  visible: boolean;
  q: number;
  cutTimer: number;
};

/** Опорный кадр: положение прокрутки в px и номер сцены. */
type Stop = { y: number; index: number };
/**
 * Доводка: путь `from`→`to` (px страницы) играется `dur` мс. `c0`…`c1` — тот же путь во «времени фильма» (секунды),
 * `rin` и `rout` — разгон и торможение (мс).
 */
type Settle = {
  from: number;
  to: number;
  c0: number;
  c1: number;
  t0: number;
  dur: number;
  rin: number;
  rout: number;
  /** Без времени фильма: плавный ход `from`→`to` (выход за последний кадр и возврат оттуда). */
  plain?: boolean;
  /** Это шаг телефона (свайп): страницу ведёт только он, прокрутку чужими руками он не отменяет. */
  step?: boolean;
};
/**
 * Один жест — не больше одного кадра. Жест начинается со входа (колесо, касание, клавиша) и кончается тишиной.
 * Пока он идёт, лента не уезжает дальше соседних опорных кадров (`lo`…`hi`); страница под ней прижимается к стенке.
 */
type Gesture = {
  lo: number;
  hi: number;
  /** Без стенок: ползунок прокрутки, Home/End — человек сам выбирает, куда ехать. */
  free: boolean;
  /** Где была страница, когда жест начался. */
  from: number;
  /** Жест подхватил доводку, которая ещё ехала к `chainTo` в эту сторону (1 или −1); иначе 0. */
  chain: number;
  chainTo: number;
  /** Когда лента упёрлась в стенку (0 — не упирается). */
  wallAt: number;
  /** Усилия ввода за последние полсекунды: когда (мс) и сколько (px) прокрутило колесо или повтор клавиши. */
  pushes: { t: number; f: number }[];
  /** Сколько усилий подряд были «всплеском» над затухающим хвостом. */
  surges: number;
  /** Когда пришло прошлое усилие и до какого момента после заминки потока всплеск не засчитывается (мс). */
  last: number;
  calm: number;
  /** Самое сильное давление за 200 мс с начала жеста (или с последнего открытого кадра), px. */
  peak: number;
  /** Предел темпа ленты, пока жест идёт: за рукой (колесо, палец) — щедрый, на нажатие клавиши — в темпе фильма. */
  pace: number;
};

export function startFilm(): (() => void) | undefined {
  const html = document.documentElement;
  const root = document.querySelector<HTMLElement>('[data-film]');
  if (!root || !html.classList.contains('film-live')) return undefined;

  try {
    return boot(root, html);
  } catch (error) {
    console.error('[film] запуск не удался, показываем обычную колонку', error);
    html.classList.remove('film-live', 'film-ready');
    return undefined;
  }
}

function boot(root: HTMLElement, html: HTMLElement): () => void {
  const track = root.querySelector<HTMLElement>('.film__track')!;
  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  const world = root.querySelector<HTMLElement>('[data-world]')!;
  const hud = root.querySelector<HTMLElement>('[data-hud]')!;
  const ringBar = hud.querySelector<SVGElement>('[data-hud-ring]');
  const ringButton = hud.querySelector<HTMLButtonElement>('[data-hud-toggle]')!;
  const num = hud.querySelector<HTMLElement>('[data-hud-num]');
  const time = hud.querySelector<HTMLElement>('[data-hud-time]');
  const frameNo = hud.querySelector<HTMLElement>('[data-hud-frame]');
  const nameEl = hud.querySelector<HTMLElement>('[data-hud-name]');
  const cta = hud.querySelector<HTMLElement>('[data-hud-cta]');
  const hint = hud.querySelector<HTMLElement>('[data-hud-hint]');
  const list = hud.querySelector<HTMLElement>('[data-hud-list]')!;
  const listLinks = Array.from(
    list.querySelectorAll<HTMLAnchorElement>('a[data-jump]'),
  );

  const slots: Slot[] = sceneList.map((meta, index) => {
    const el = root.querySelector<HTMLElement>(`[data-scene="${meta.id}"]`);
    const factory = FACTORIES[meta.id];
    if (!el || !factory) throw new Error(`нет сцены ${meta.id}`);
    return {
      id: meta.id,
      el,
      controller: factory(el),
      start: sceneList.slice(0, index).reduce((sum, s) => sum + s.len, 0),
      len: meta.len,
      stopYs: [],
      visible: false,
      q: -1,
      cutTimer: 0,
    };
  });

  const metrics: FilmMetrics = { w: 1440, h: 900, u: 14, tall: false };
  const tallQuery = window.matchMedia('(max-aspect-ratio: 1/1)');
  // «единицу кадра» считает CSS (--u зависит от раскладки), поэтому берём её из вёрстки, а не повторяем формулу
  const probe = document.createElement('i');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:absolute;top:0;left:0;width:var(--u);height:0;visibility:hidden;pointer-events:none';
  stage.append(probe);
  let sizeKey = '';
  let trackTop = 0;
  let trackBottom = 0;
  let target = 0;
  let current = 0;
  let activeIndex = -1;
  let raf = 0;
  let lastTime = 0;
  let camX = 0;
  let camY = 0;
  let aimX = 0;
  let aimY = 0;
  let needsRender = true;
  let reduceCamera = false;
  // доводка до опорного кадра
  let stops: Stop[] = [];
  let endY = 0;
  let settle: Settle | null = null;
  let idleTimer = 0;
  let inputDir = 0;
  /** Куда крутили колесо в прошлый раз (не страница): `scroll` приходит раньше обработчика колеса и подменяет `inputDir`. */
  let wheelDir = 0;
  let lastY = window.scrollY;
  let ownY = Number.NaN;
  let ownAt = 0;
  /** Кнопка мыши нажата на полосе прокрутки: пока держим, ничего не доводим. */
  let holding = false;
  let holdTimer = 0;
  /** Пальцы на экране: номер касания → где и когда его видели в последний раз, когда двигался (мс). */
  const fingers = new Map<number, { x: number; y: number; at: number }>();
  /** Касание, которое листает (последнее, что легло на экран): его двигают и страницу под ним, а не только палец. */
  let lastFinger = -1;
  /** Свайп, который ведёт последний палец: где начался, какие соседние кадры были вокруг. */
  let swipe: {
    id: number;
    x: number;
    y: number;
    t: number;
    scroll: number;
    lo: number;
    hi: number;
  } | null = null;
  // один жест — один кадр
  let gesture: Gesture | null = null;
  let pinY = Number.NaN;
  let pinAt = 0;
  let paceCap = Number.POSITIVE_INFINITY;
  // время фильма: накопленные секунды от начала ленты на узлах сетки с шагом TEMPO_STEP экранов
  let clock = new Float64Array(0);
  // где мы были на ленте до смены размеров окна: в экранах от её начала или в px ниже её конца
  let keepIn = Number.NaN;
  let keepBelow = Number.NaN;
  let resizing = false;
  let resizeTimer = 0;
  // телефон: ленту листает движок (STEP_PX), палец, который ведёт свайп: откуда начал и сделал ли уже шаг
  let steps = false;
  let pan: { id: number; x: number; y: number; done: boolean } | null = null;
  const coarseQuery = window.matchMedia('(pointer: coarse)');
  const stepsParam = new URLSearchParams(window.location.search).get('steps');

  /** Мгновенный переход: на старых браузерах значения `instant` нет, там обычный scrollTo и так мгновенный. */
  const jump = (y: number) => {
    try {
      window.scrollTo({ top: y, behavior: 'instant' });
    } catch {
      window.scrollTo(0, y);
    }
  };

  /* ───────────── замеры ───────────── */

  const measure = () => {
    metrics.tall = tallQuery.matches;
    metrics.w = window.innerWidth;
    // высота закреплённого экрана (100svh), а не окна: у телефона окно меняется вместе с адресной строкой
    metrics.h = stage.clientHeight || window.innerHeight;
    metrics.u =
      probe.getBoundingClientRect().width ||
      Math.min(metrics.w / 100, metrics.h / 56.25);
    sizeKey = `${metrics.w}x${metrics.h}x${metrics.tall ? 1 : 0}`;
    trackTop = track.getBoundingClientRect().top + window.scrollY;
    trackBottom = trackTop + track.offsetHeight;
    slots.forEach((slot) => slot.controller.measure?.(metrics));
    buildStops();
    target = screens();
    needsRender = true;
  };

  /** Опорные кадры всех сцен в px страницы — по ним доводим прокрутку и прыгаем по ссылкам. */
  const buildStops = () => {
    const all: Stop[] = [];
    slots.forEach((slot, index) => {
      const m = margin(slot);
      const from = index === 0 ? 0 : m;
      const to = index === slots.length - 1 ? 1 : 1 - m;
      slot.stopYs = slot.controller.stops.map((q) => {
        const s = slot.start + (from + q * (to - from)) * slot.len;
        const y = Math.round(trackTop + s * metrics.h);
        all.push({ y, index });
        return y;
      });
    });
    stops = all.sort((a, b) => a.y - b.y);
    endY = trackTop + totalScreens * metrics.h;
    // для проверок и отладки: где на странице стоят опорные кадры
    root.dataset.filmStops = JSON.stringify(
      stops.map((st) => [st.index, st.y]),
    );
    buildClock();
  };

  /* ───────────── время фильма ───────────── */

  /**
   * Карта темпа: сколько секунд играется каждый кусок ленты. Обычный экран идёт за SECONDS_PER_SCREEN, а участки,
   * которые сцена назвала в `tempo`, — за названное число секунд. От размеров окна карта не зависит (только от
   * длин сцен), но считается там же, где опорные кадры.
   */
  const buildClock = () => {
    const nodes = Math.round(totalScreens / TEMPO_STEP) + 1;
    const pace = new Float64Array(nodes).fill(SECONDS_PER_SCREEN);
    slots.forEach((slot, index) => {
      const m = margin(slot);
      const from = index === 0 ? 0 : m;
      const to = index === slots.length - 1 ? 1 : 1 - m;
      const at = (q: number) =>
        slot.start + (from + q * (to - from)) * slot.len;
      for (const [qa, qb, seconds] of slot.controller.tempo ?? []) {
        const xa = at(qa);
        const xb = at(qb);
        if (xb <= xa || seconds <= 0) continue;
        const rate = seconds / (xb - xa);
        for (
          let k = Math.max(0, Math.ceil(xa / TEMPO_STEP - 1e-9));
          k < nodes && k * TEMPO_STEP <= xb + 1e-9;
          k += 1
        ) {
          pace[k] = rate;
        }
      }
    });
    // резкие границы участков размываем скользящим средним, чтобы скорость ленты не прыгала
    const half = Math.round(TEMPO_BLUR / TEMPO_STEP);
    const sums = new Float64Array(nodes + 1);
    for (let k = 0; k < nodes; k += 1) sums[k + 1] = sums[k] + pace[k];
    const next = new Float64Array(nodes);
    for (let k = 1; k < nodes; k += 1) {
      const lo = Math.max(0, k - 1 - half);
      const hi = Math.min(nodes, k + half);
      const average = (sums[hi] - sums[lo]) / (hi - lo);
      next[k] = next[k - 1] + average * TEMPO_STEP;
    }
    clock = next;
  };

  /** Положение в экранах → секунды фильма. */
  const toClock = (x: number) => {
    const n = clock.length;
    if (n < 2) return x * SECONDS_PER_SCREEN;
    const f = clamp(x / TEMPO_STEP, 0, n - 1.000001);
    const k = Math.floor(f);
    return clock[k] + (f - k) * (clock[k + 1] - clock[k]);
  };

  /** Секунды фильма → положение в экранах. */
  const fromClock = (seconds: number) => {
    const n = clock.length;
    if (n < 2) return seconds / SECONDS_PER_SCREEN;
    if (seconds <= 0) return 0;
    if (seconds >= clock[n - 1]) return (n - 1) * TEMPO_STEP;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (clock[mid] <= seconds) lo = mid;
      else hi = mid;
    }
    const span = clock[hi] - clock[lo] || 1;
    return (lo + (seconds - clock[lo]) / span) * TEMPO_STEP;
  };

  /**
   * Доводка на `seconds` секунд фильма: разгон, ход в нормальном темпе, торможение. Короткий путь не короче
   * SETTLE_MIN_MS — тогда разгон и торможение сжимаются вместе, а хода почти нет.
   */
  const planSettle = (seconds: number) => {
    let rin = SETTLE_RAMP_IN_MS;
    let rout = SETTLE_RAMP_OUT_MS;
    const dur = clamp(
      seconds * 1000 + (rin + rout) / 2,
      SETTLE_MIN_MS,
      SETTLE_MAX_MS,
    );
    if (dur < rin + rout) {
      const k = dur / (rin + rout);
      rin *= k;
      rout *= k;
    }
    return { dur, rin, rout };
  };

  /** Какая доля пути доводки пройдена к моменту `t` мс. */
  const settleProgress = (s: Settle, t: number) => {
    if (t <= 0) return 0;
    if (t >= s.dur) return 1;
    const v = 1 / (s.dur - (s.rin + s.rout) / 2);
    if (t < s.rin) return (v * t * t) / (2 * s.rin);
    if (t < s.dur - s.rout) return v * (s.rin / 2 + (t - s.rin));
    return 1 - (v * (s.dur - t) ** 2) / (2 * s.rout);
  };

  /** Положение прокрутки в экранах от начала ленты. */
  const screens = () => (window.scrollY - trackTop) / metrics.h;

  /**
   * Запоминает, где мы на ленте (в экранах от её начала) или под ней (в px от её низа) — в единицах, которые не
   * зависят от размера окна. Пока окно меняет размер, браузер сам двигает прокрутку (прижимает к новому концу
   * страницы) — тогда помнить нечего, ждём замера.
   */
  const remember = () => {
    if (resizing) return;
    const y = window.scrollY;
    if (y >= trackBottom) {
      keepBelow = y - trackBottom;
      keepIn = Number.NaN;
    } else {
      keepIn = (y - trackTop) / metrics.h;
      keepBelow = Number.NaN;
    }
  };

  /** Окно сменило размер (поворот телефона, другое окно браузера): меряем заново и возвращаемся в тот же момент. */
  const relayout = () => {
    window.clearTimeout(resizeTimer);
    const was = keepIn;
    const below = keepBelow;
    dbg?.count('перемеров');
    gesture = null; // кадры стоят по-новому: прежние стенки уже не про те места
    settle = null; // и доводка едет в px старой раскладки: после замера её цель стоит не там
    pan = null;
    paceCap = Number.POSITIVE_INFINITY;
    measure();
    applySteps();
    if (!Number.isNaN(was)) jump(Math.round(trackTop + was * metrics.h));
    else if (!Number.isNaN(below)) jump(Math.round(trackBottom + below));
    lastY = window.scrollY;
    target = screens();
    current = clamp(target, 0, totalScreens);
    resizing = false;
    remember();
    needsRender = true;
    request();
    armIdle();
  };

  const margin = (slot: Slot) => PAUSE / slot.len;

  /** Прогресс содержимого сцены: первая сцена не имеет входа по прокрутке, последняя — выхода. */
  const contentProgress = (slot: Slot, index: number, s: number) => {
    const p = clamp((s - slot.start) / slot.len);
    const m = margin(slot);
    const from = index === 0 ? 0 : m;
    const to = index === slots.length - 1 ? 1 : 1 - m;
    return clamp((p - from) / (to - from));
  };

  const sceneAt = (s: number) => {
    for (let i = slots.length - 1; i >= 0; i -= 1) {
      if (s >= slots[i].start) return i;
    }
    return 0;
  };

  /* ───────────── показ сцен и склейки ───────────── */

  const setVisible = (slot: Slot, on: boolean, instant = false) => {
    if (slot.visible === on) return;
    slot.visible = on;
    window.clearTimeout(slot.cutTimer);
    const { el } = slot;
    el.classList.remove('is-in', 'is-out');
    if (instant) {
      setClass(el, 'is-on', on);
      return;
    }
    if (on) {
      el.classList.add('is-on', 'is-in');
      slot.cutTimer = window.setTimeout(
        () => el.classList.remove('is-in'),
        CUT_MS,
      );
    } else {
      // уходящая сцена ещё 170 мс «рвётся» и только потом гаснет
      el.classList.add('is-out');
      slot.cutTimer = window.setTimeout(() => {
        el.classList.remove('is-out', 'is-on');
      }, CUT_MS);
    }
  };

  /* ───────────── служебный слой ───────────── */

  const updateHud = (s: number, index: number) => {
    const progress = clamp(s / (totalScreens - 0.0001));
    if (ringBar) setVar(ringBar, '--hp', progress);
    if (num) setText(num, pad2(index + 1));
    const seconds = progress * FILM_SECONDS;
    if (time) {
      setText(
        time,
        `${pad2(Math.floor(seconds / 60))}:${pad2(Math.floor(seconds % 60))}`,
      );
    }
    if (frameNo) {
      setText(
        frameNo,
        String(Math.floor(seconds * FRAMES_PER_SECOND)).padStart(4, '0'),
      );
    }
    if (nameEl)
      setText(nameEl, sceneList[index].name.toLocaleUpperCase('ru-RU'));
    // кнопка «Обсудить проект» появляется после второй сцены, а на финале её заменяет огромная
    const wantCta = index >= 2 && index < slots.length - 1;
    if (cta) setClass(cta, 'is-shown', wantCta);
    if (hint) setClass(hint, 'is-gone', s > 0.08);
    ringButton.setAttribute(
      'aria-label',
      `Сцены: сейчас ${index + 1} из ${slots.length}, открыть список`,
    );
    listLinks.forEach((link, i) => {
      if (i === index) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
  };

  /* ───────────── кадр ───────────── */

  const render = () => {
    const s = clamp(current, 0, totalScreens);
    const index = sceneAt(s);
    activeIndex = index;
    slots.forEach((slot, i) => {
      if (i !== index) {
        if (slot.visible) setVisible(slot, false);
        return;
      }
      const q = contentProgress(slot, i, s);
      const visible =
        (i === 0 || q > VISIBLE_FROM) &&
        (i === slots.length - 1 || q < VISIBLE_TO);
      if (visible !== slot.visible) setVisible(slot, visible);
      if (Math.abs(q - slot.q) > 1e-5 || needsRender) {
        slot.q = q;
        slot.controller.update(q);
      }
    });
    updateHud(s, index);
    needsRender = false;
  };

  /* ───────────── цикл ───────────── */

  const tick = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, lastTime ? (now - lastTime) / 1000 : 0.016);
    lastTime = now;
    let more = false;

    if (settle) {
      // доводка: сами ведём прокрутку по времени фильма (в местах с эффектами она идёт медленнее),
      // сглаживание колеса здесь не нужно
      const elapsed = now - settle.t0;
      const done = elapsed >= settle.dur;
      const y = done
        ? settle.to
        : settle.plain
          ? lerp(settle.from, settle.to, smooth(clamp(elapsed / settle.dur)))
          : trackTop +
            fromClock(
              lerp(settle.c0, settle.c1, settleProgress(settle, elapsed)),
            ) *
              metrics.h;
      ownY = y;
      ownAt = performance.now();
      jump(y);
      // страница не пошла за прыжком (браузер его не принял): в отладочной панели это видно счётчиком
      if (dbg && Math.abs(window.scrollY - y) > 2)
        dbg.count('прыжков не дошло');
      lastY = window.scrollY;
      target = screens();
      // лента идёт за прокруткой почти вплотную; если её держал предел темпа и она отстала, то догоняет, а не прыгает
      current += glide(target - current, dt, FOLLOW);
      if (done) {
        settle = null;
        // страница уже на кадре, а лента, которую держал предел темпа, ещё нет: она доигрывает остаток пути сама
        if (Math.abs(target - current) >= 0.0003) more = true;
        // лента на месте: предел отработал, иначе он достанется следующему прыжку страницы без жеста и лента поползёт
        else paceCap = Number.POSITIVE_INFINITY;
      } else more = true;
    } else {
      const diff = target - current;
      if (Math.abs(diff) < 0.0003) {
        current = target;
        // дошли: пока жест идёт, предел остаётся (следующий рывок снова не должен пролететь), потом снимается
        paceCap =
          gesture && !gesture.free ? gesture.pace : Number.POSITIVE_INFINITY;
      } else {
        current += glide(diff, dt);
        more = true;
      }
    }

    slots.forEach((slot) => {
      if (slot.controller.frame?.(now)) more = true;
    });

    if (!reduceCamera) {
      const k = 1 - Math.exp(-dt / 0.18);
      camX += (aimX - camX) * k;
      camY += (aimY - camY) * k;
      const tiny = Math.abs(camX) < 0.003 && Math.abs(camY) < 0.003;
      world.style.transform = tiny
        ? ''
        : `perspective(1700px) rotateX(${(-camY * TILT_DEG).toFixed(3)}deg) rotateY(${(camX * TILT_DEG).toFixed(3)}deg)`;
      if (Math.abs(aimX - camX) > 0.002 || Math.abs(aimY - camY) > 0.002)
        more = true;
    }

    render();
    if (more) request();
    else lastTime = 0;
  };

  /**
   * Шаг ленты к цели за кадр: мягкое сглаживание, но не быстрее предела темпа (пока он не задан — без предела).
   * Предел считается во времени фильма: там, где идут эффекты, лента проходит экран дольше.
   */
  const glide = (diff: number, dt: number, tau = SMOOTH) => {
    const move = diff * (1 - Math.exp(-dt / tau));
    if (paceCap === Number.POSITIVE_INFINITY) return move;
    const here = toClock(current);
    const step = toClock(current + move) - here;
    const cap = paceCap * dt;
    return Math.abs(step) > cap
      ? fromClock(here + Math.sign(step) * cap) - current
      : move;
  };

  const request = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  /* ───────────── переходы ───────────── */

  /** Прокрутка к сцене: прыгаем на её опорный кадр (собранный), при этом вход сцены проигрывается. */
  const seek = (index: number, stopNo?: number) => {
    const slot = slots[index];
    const y =
      slot.stopYs[stopNo ?? slot.controller.jumpStop ?? 0] ?? slot.stopYs[0];
    settle = null;
    gesture = null;
    paceCap = Number.POSITIVE_INFINITY;
    jump(y);
    lastY = window.scrollY;
    target = (y - trackTop) / metrics.h;
    if (sceneAt(current) !== index) current = slot.start;
    needsRender = true;
    request();
  };

  const seekToCase = (id: string) => {
    const el = root.querySelector<HTMLElement>(
      `[data-case="${CSS.escape(id)}"]`,
    );
    if (!el) return false;
    const index = slots.findIndex((slot) => slot.el.contains(el));
    if (index < 0) return false;
    seek(index, slots[index].controller.stopFor?.(el) ?? undefined);
    return true;
  };

  const seekToSceneId = (id: string) => {
    const index = slots.findIndex((slot) => slot.id === id);
    if (index < 0) return false;
    seek(index);
    return true;
  };

  /** Ссылки вида #scene-mech и #case-tbank работают внутри ленты. */
  const goToHash = (hash: string) => {
    if (hash.startsWith('#case-'))
      return seekToCase(decodeURIComponent(hash.slice(6)));
    if (hash.startsWith('#scene-')) return seekToSceneId(hash.slice(7));
    return false;
  };

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
      'a[href*="#case-"], a[href*="#scene-"]',
    );
    if (!link) return;
    const url = new URL(link.href, window.location.href);
    if (
      url.pathname.replace(/\/index\.html$/, '/') !==
      window.location.pathname.replace(/\/index\.html$/, '/')
    )
      return;
    if (goToHash(url.hash)) {
      event.preventDefault();
      closeList(false);
      history.replaceState(null, '', url.hash);
    }
  };

  /* ───────────── список сцен ───────────── */

  const openList = () => {
    list.hidden = false;
    ringButton.setAttribute('aria-expanded', 'true');
    hud.classList.add('is-list');
    list
      .querySelector<HTMLElement>('a[aria-current="step"]')
      ?.focus({ preventScroll: true });
  };
  function closeList(restoreFocus = true) {
    if (list.hidden) return;
    list.hidden = true;
    ringButton.setAttribute('aria-expanded', 'false');
    hud.classList.remove('is-list');
    if (restoreFocus) ringButton.focus({ preventScroll: true });
  }
  const onRing = () => (list.hidden ? openList() : closeList());
  const onDocumentDown = (event: PointerEvent) => {
    // нажали на полосу прокрутки страницы: пока держим, ничего не доводим
    if (
      event.pointerType === 'mouse' &&
      event.target === document.documentElement &&
      event.clientX >= document.documentElement.clientWidth
    ) {
      onHold();
    }
    if (list.hidden) return;
    const inside = (event.target as Element | null)?.closest('[data-hud-menu]');
    if (!inside) closeList(false);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeList();
    const dir = SCROLL_KEYS[event.key];
    if (dir && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const way = event.key === ' ' && event.shiftKey ? -1 : dir;
      if (!frozen()) {
        if (event.key === 'Home' || event.key === 'End') begin(true);
        else if (!gesture) begin(false, event.repeat ? FOLLOW_RATE : PLAY_RATE);
        else if (event.repeat) push(KEY_FORCE, performance.now());
        else step(way);
      }
      settle = null;
      inputDir = way;
      armIdle();
    }
  };

  /* ───────────── доводка до опорного кадра ───────────── */

  const armIdle = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(settleNow, SETTLE_IDLE_MS);
  };

  /** Прокрутка остановилась между кадрами: едем до ближайшего в сторону движения. */
  const settleNow = () => {
    idleTimer = 0;
    if (settle || stops.length === 0) return;
    // кнопка мыши на полосе прокрутки — человек ещё крутит
    if (holding) return;
    // палец только что двигался или лёг — тоже; палец, который давно лежит неподвижно, не ждём
    const wait = fingerWait();
    if (wait > 0) {
      idleTimer = window.setTimeout(settleNow, wait + 10);
      return;
    }
    // тишина: жест кончился, стенки больше не нужны (и не должны пережить окно, открытое поверх ленты)
    const g = gesture;
    gesture = null;
    // лента уже на месте: предел темпа жеста больше не нужен (если ещё едет, снимет сама, дойдя до цели)
    if (Math.abs(target - current) < 0.0003) paceCap = Number.POSITIVE_INFINITY;
    // открыто окно (форма): страница под ним не должна двигаться
    if (frozen()) return;
    let y = window.scrollY;
    if (g && !g.free) {
      // браузер мог не дать удержать страницу у стенки (инерция пальца на телефоне) и унёс её дальше: лента этого
      // не видела, она стоит у стенки — возвращаем страницу туда без анимации и решаем уже оттуда
      const wall =
        y > g.hi + AT_REST_PX
          ? g.hi
          : y < g.lo - AT_REST_PX
            ? g.lo
            : Number.NaN;
      if (!Number.isNaN(wall)) {
        jump(wall);
        pinY = wall;
        pinAt = performance.now();
        y = wall;
        lastY = wall;
        target = (wall - trackTop) / metrics.h;
        request();
      }
    }
    if (y > endY + AT_REST_PX) return; // ниже ленты — обычная страница
    let prev: Stop | undefined;
    let next: Stop | undefined;
    for (const st of stops) {
      if (st.y <= y) prev = st;
      else {
        next = st;
        break;
      }
    }
    const nearest = [prev, next]
      .filter((st): st is Stop => st !== undefined)
      .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0];
    let pick: Stop | undefined;
    if (
      g &&
      g.chain !== 0 &&
      inputDir === g.chain &&
      (y - g.from) * g.chain >= CHAIN_PX
    ) {
      // человек подхватил доводку на ходу и продолжил в ту же сторону: кадр, к которому она ехала, уже засчитан
      pick =
        g.chain > 0
          ? stops.find((st) => st.y > g.chainTo + AT_REST_PX)
          : [...stops].reverse().find((st) => st.y < g.chainTo - AT_REST_PX);
    } else if (nearest && Math.abs(nearest.y - y) <= AT_REST_PX) {
      return; // уже на кадре
    } else if (nearest && Math.abs(nearest.y - y) <= SNAP_PX) pick = nearest;
    else if (inputDir > 0) pick = next;
    else if (inputDir < 0) pick = prev;
    else pick = nearest;
    if (!pick) return; // дальше в эту сторону кадров нет: обычная прокрутка
    const dist = Math.abs(pick.y - y);
    if (dist <= AT_REST_PX) return;
    const c0 = toClock((y - trackTop) / metrics.h);
    const c1 = toClock((pick.y - trackTop) / metrics.h);
    settle = {
      from: y,
      to: pick.y,
      c0,
      c1,
      t0: performance.now(),
      ...planSettle(Math.abs(c1 - c0)),
    };
    request();
  };

  /* ───────────── один жест — один кадр ───────────── */

  /** Открыто окно (форма): страница под ним не едет, жесты ленты не нужны. */
  const frozen = () => document.body.style.overflow === 'hidden';

  /** Ближайшие опорные кадры по обе стороны от `y` (бесконечность — в ту сторону кадров больше нет). */
  const around = (y: number) => {
    let lo = Number.NEGATIVE_INFINITY;
    let hi = Number.POSITIVE_INFINITY;
    for (const st of stops) {
      if (st.y < y - AT_REST_PX) lo = st.y;
      else if (st.y > y + AT_REST_PX) {
        hi = st.y;
        break;
      }
    }
    return { lo, hi };
  };

  /**
   * Вход (колесо, касание, клавиша) начинает жест: запоминаем соседние кадры, дальше них он ленту не пустит.
   * Если в этот момент ещё ехала доводка, человек для себя уже стоит на кадре, к которому она ехала: стенки — от него.
   */
  const begin = (free = false, pace = FOLLOW_RATE) => {
    if (stops.length === 0) return;
    paceCap = free ? Number.POSITIVE_INFINITY : pace;
    wheelDir = 0;
    // место, где человек был до этого жеста: `lastY`, а не `scrollY` (браузер двигает страницу раньше, чем
    // колесо доходит до обработчика, и первый шаг жеста уже сидит в `scrollY`)
    const { lo, hi } = free
      ? { lo: Number.NEGATIVE_INFINITY, hi: Number.POSITIVE_INFINITY }
      : around(settle ? settle.to : lastY);
    gesture = {
      lo,
      hi,
      free,
      from: lastY,
      chain: settle ? Math.sign(settle.to - settle.from) : 0,
      chainTo: settle ? settle.to : 0,
      wallAt: 0,
      pushes: [],
      surges: 0,
      last: 0,
      calm: 0,
      peak: 0,
      pace,
    };
  };

  /** Следующий шаг в том же жесте: стенки переставляются вокруг `anchor`, лента от них не отрывается. */
  const renew = (anchor: number, pace = FOLLOW_RATE) => {
    const g = gesture;
    if (!g || g.free) return;
    const { lo, hi } = around(anchor);
    g.lo = lo;
    g.hi = hi;
    g.pace = pace;
    paceCap = pace;
    g.from = lastY;
    g.chain = 0;
    g.wallAt = 0;
    g.pushes = [];
    g.surges = 0;
    g.calm = 0;
    g.peak = 0;
  };

  /** Новое нажатие клавиши посреди жеста: тот же кадр, к которому ехали, уже засчитан, берём следующий. */
  const step = (dir: number) => {
    const g = gesture;
    if (!g || g.free) return;
    const wall = dir > 0 ? g.hi : g.lo;
    // нажатие клавиши — готовая команда «к следующему кадру», а не движение руки, за которым надо поспевать
    renew(dir === inputDir && Number.isFinite(wall) ? wall : lastY, PLAY_RATE);
  };

  /**
   * Усилие ввода (шаг колеса, повтор клавиши). Пока лента стоит у стенки, решаем, не открыть ли следующий кадр:
   * человек добавил (новый взмах поверх затухающего «хвоста» инерции) или давит ровно и долго (крутит колесо, держит клавишу).
   * Затухающий хвост одного взмаха не подходит ни под то, ни под другое, поэтому лишних кадров не листает.
   */
  const push = (force: number, now: number) => {
    const g = gesture;
    if (!g || g.free) return;
    if (g.last > 0 && now - g.last >= STALL_MS) g.calm = now + STALL_CALM_MS;
    g.last = now;
    g.pushes.push({ t: now, f: force });
    while (g.pushes.length > 0 && now - g.pushes[0].t > 500) g.pushes.shift();
    // сколько прокрутили в окне «от … до … мс назад»
    const within = (from: number, to: number) =>
      g.pushes.reduce(
        (sum, p) => (p.t > now - to && p.t <= now - from ? sum + p.f : sum),
        0,
      );
    const rate = within(0, 200);
    g.peak = Math.max(g.peak, rate);
    if (!g.wallAt) return;
    const lately = within(0, 80);
    const surge =
      now >= g.calm &&
      now - g.wallAt >= SURGE_AFTER_MS &&
      lately >= SURGE_SUM &&
      lately >= within(80, 160) * SURGE_RATIO &&
      lately >= within(160, 240) * SURGE_RATIO;
    g.surges = surge ? g.surges + 1 : 0;
    const steady =
      rate >= STEADY_SUM &&
      rate >= within(200, 400) * 0.75 &&
      rate >= g.peak * STEADY_KEEP;
    if (g.surges >= 2 || (now - g.wallAt >= HOLD_STEP_MS && steady)) {
      renew(lastY);
    }
  };

  /* ───────────── ввод ───────────── */

  const onScroll = () => {
    let y = window.scrollY;
    const now = performance.now();
    // телефон: пока идёт шаг, страницу ведёт только он (под пальцем браузер её не трогает), чужих рук тут нет
    const driven = steps && settle !== null && settle.step === true;
    const mine =
      driven ||
      (!Number.isNaN(ownY) && Math.abs(y - ownY) <= 1.6 && now - ownAt < 250);
    dbg?.count(mine ? 'прокруток своих' : 'прокруток чужих');
    // эхо нашего же прижима к стенке: движения человека в нём нет
    const echo =
      !Number.isNaN(pinY) && Math.abs(y - pinY) < 0.5 && now - pinAt < 150;
    if (!mine && !echo) {
      // страницу двинули не мы (колесо, касание, клавиша, ползунок): доводку отменяем, запоминаем сторону
      settle = null;
      const dy = y - lastY;
      if (Math.abs(dy) >= 1) inputDir = dy > 0 ? 1 : -1;
      if (holding) armHoldGuard();
      // страницу под пальцем двигает тот, что лёг последним: он не «забыт»
      const finger = fingers.get(lastFinger);
      if (finger) finger.at = now;
      armIdle();
    }
    const g = gesture;
    let hit = false;
    if (g && !g.free && !echo) {
      const wall = y > g.hi ? g.hi : y < g.lo ? g.lo : Number.NaN;
      if (!Number.isNaN(wall)) {
        // дальше соседнего кадра этот жест не пускает: страницу возвращаем к стенке, а не оставляем «запас»
        // за ней, иначе после разворота лента стояла бы на месте, пока не отыграешь весь запас
        jump(wall);
        pinY = wall;
        pinAt = now;
        y = wall;
        if (!g.wallAt) {
          g.wallAt = now;
          hit = true;
        }
      } else if (g.wallAt && y < g.hi - 1 && y > g.lo + 1) {
        g.wallAt = 0; // отошли от стенки
      }
    }
    lastY = y;
    remember();
    target = (y - trackTop) / metrics.h;
    // прыжок через полленты (ползунок, End, ссылка) — склейка, а не пролёт через все сцены по пути
    if (Math.abs(target - current) > JUMP_CUT) current = target;
    // упёрлись в стенку: остаток пути лента проигрывает в обычном темпе, а не за четверть секунды
    else if (hit) paceCap = PLAY_RATE;
    request();
  };
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || Math.abs(event.deltaY) < 0.5) return;
    const dir = event.deltaY > 0 ? 1 : -1;
    if (!frozen()) {
      // строки и страницы (Firefox, мыши с «колёсиком по строкам») приводим к px
      const force =
        Math.abs(event.deltaY) *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? window.innerHeight
            : 1);
      if (!gesture) begin();
      else if (dir !== (wheelDir || inputDir) && force >= FLIP_FORCE)
        renew(lastY);
      push(force, performance.now());
    }
    settle = null;
    inputDir = dir;
    wheelDir = dir;
    armIdle();
  };
  /** Страховка: если «отпустили» мышью не пришло, через пару секунд тишины считаем, что кнопка уже отпущена. */
  const armHoldGuard = () => {
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      if (!holding) return;
      holding = false;
      armIdle();
    }, HOLD_GUARD_MS);
  };
  /** Кнопка мыши на полосе прокрутки — жест без стенок: ползунок едет туда, куда его тянут. */
  const onHold = () => {
    if (!frozen()) begin(true);
    holding = true;
    settle = null;
    armHoldGuard();
  };
  const onRelease = (event: PointerEvent) => {
    // у касания pointerup и pointercancel приходят, когда браузер забрал жест себе (началась прокрутка), а не
    // когда палец поднят: за пальцами следят события касаний, здесь только мышь (полоса прокрутки)
    if (event.pointerType !== 'mouse') return;
    if (!holding) return;
    holding = false;
    window.clearTimeout(holdTimer);
    armIdle();
  };

  /* ───────────── пальцы ───────────── */

  /** Сколько мс ещё ждать: на экране есть палец, который лёг или двигался недавно (0 — таких нет). */
  const fingerWait = () => {
    const now = performance.now();
    const rest = fingers.size > 1 ? FINGER_CROWD_MS : FINGER_REST_MS;
    let wait = 0;
    fingers.forEach((finger) => {
      wait = Math.max(wait, finger.at + rest - now);
    });
    return wait;
  };
  /**
   * Каждое касание начинает жест, сколько бы пальцев уже ни лежало: большой палец держащей руки не должен «съедать»
   * следующие свайпы, оставляя прежние стенки, а потом молча держать доводку.
   */
  const onTouchStart = (event: TouchEvent) => {
    const now = performance.now();
    const list = event.changedTouches;
    for (let i = 0; i < list.length; i += 1) {
      const touch = list[i];
      fingers.set(touch.identifier, {
        x: touch.clientX,
        y: touch.clientY,
        at: now,
      });
      lastFinger = touch.identifier;
    }
    const last = list[list.length - 1];
    dbg?.count(
      event.touches.length > 1 ? 'касаний (несколько пальцев)' : 'касаний',
    );
    if (steps && last && ownsTouch(event.target)) {
      // телефон: страницу под пальцем двигает не браузер, а движок — шаг сделает сам свайп. Доводку не отменяем:
      // следующий шаг продолжит её, а не начнёт с нуля. Ведёт свайп тот палец, что лёг последним (большой палец
      // держащей руки может лежать на экране сколько угодно — он свайпам не мешает)
      pan = {
        id: last.identifier,
        x: last.clientX,
        y: last.clientY,
        done: false,
      };
      return;
    }
    if (!frozen()) begin();
    settle = null;
    swipe =
      last && gesture && !frozen()
        ? {
            id: last.identifier,
            x: last.clientX,
            y: last.clientY,
            t: now,
            scroll: window.scrollY,
            lo: gesture.lo,
            hi: gesture.hi,
          }
        : null;
    armIdle();
  };
  /**
   * Телефон, страховка к `touch-action: none`: если браузер всё-таки начнёт листать страницу под пальцем, ведущим свайп по
   * ленте, отменяем это. Отменяем не с первого движения, а когда палец ушёл дальше обычной «дрожи» нажатия: так тап по
   * кнопке остаётся тапом.
   */
  const onTouchHold = (event: TouchEvent) => {
    if (!steps || !pan || !event.cancelable || !ownsTouch(event.target)) return;
    const touch = event.changedTouches[0];
    if (
      touch &&
      touch.identifier === pan.id &&
      Math.hypot(touch.clientX - pan.x, touch.clientY - pan.y) >= 10
    ) {
      event.preventDefault();
    }
  };
  const onTouchMove = (event: TouchEvent) => {
    dbg?.count('движений');
    if (pan && !pan.done) {
      for (let i = 0; i < event.changedTouches.length; i += 1) {
        if (event.changedTouches[i].identifier === pan.id) {
          panBy(event.changedTouches[i]);
        }
      }
    }
    if (fingers.size === 0) return;
    const now = performance.now();
    const list = event.changedTouches;
    for (let i = 0; i < list.length; i += 1) {
      const touch = list[i];
      const finger = fingers.get(touch.identifier);
      if (
        finger &&
        Math.hypot(touch.clientX - finger.x, touch.clientY - finger.y) >=
          FINGER_MOVE_PX
      ) {
        finger.x = touch.clientX;
        finger.y = touch.clientY;
        finger.at = now;
      }
    }
  };
  const onTouchEnd = (event: TouchEvent) => {
    // забываем поднятые пальцы и те, о которых браузер больше не помнит (потерянное «отпустили»)
    const alive = new Set<number>();
    for (let i = 0; i < event.touches.length; i += 1) {
      alive.add(event.touches[i].identifier);
    }
    fingers.forEach((_, id) => {
      if (!alive.has(id)) fingers.delete(id);
    });
    dbg?.count(event.type === 'touchend' ? 'отпусканий' : 'отмен касания');
    if (pan) {
      for (let i = 0; i < event.changedTouches.length; i += 1) {
        const touch = event.changedTouches[i];
        if (touch.identifier !== pan.id) continue;
        // быстрый взмах мог не прислать движений, а только «отпустили» в новом месте; отменённое касание шага не даёт
        if (event.type === 'touchend') panBy(touch);
        pan = null;
        break;
      }
    }
    const s = swipe;
    if (s) {
      for (let i = 0; i < event.changedTouches.length; i += 1) {
        const touch = event.changedTouches[i];
        if (touch.identifier !== s.id) continue;
        swipe = null;
        const dx = touch.clientX - s.x;
        const dy = touch.clientY - s.y;
        if (
          event.type === 'touchend' &&
          Math.abs(dx) >= SIDE_PX &&
          Math.abs(dx) >= Math.abs(dy) * SIDE_RATIO &&
          performance.now() - s.t <= SIDE_MAX_MS &&
          Math.abs(window.scrollY - s.scroll) <= SIDE_MAX_SCROLL
        ) {
          sideStep(dx < 0 ? 1 : -1, s.lo, s.hi);
        }
      }
    }
    armIdle();
  };
  /**
   * Свайп вбок в сцене с лентой, которая ездит влево (кейсы): влево — следующий кадр, вправо — предыдущий. Едем к
   * соседнему опорному кадру, но только внутри этой сцены: из неё вниз и вверх уводит обычная прокрутка.
   */
  const sideStep = (dir: 1 | -1, lo: number, hi: number) => {
    if (frozen()) return;
    const slot = slots[sceneAt(current)];
    const to = dir > 0 ? hi : lo;
    if (!slot.controller.sideways || !slot.stopYs.includes(to)) return;
    const y = window.scrollY;
    gesture = null;
    paceCap = Number.POSITIVE_INFINITY;
    inputDir = dir;
    const c0 = toClock((y - trackTop) / metrics.h);
    const c1 = toClock((to - trackTop) / metrics.h);
    settle = {
      from: y,
      to,
      c0,
      c1,
      t0: performance.now(),
      ...planSettle(Math.abs(c1 - c0)),
    };
    request();
  };

  /* ───────────── телефон: ленту листает движок ───────────── */

  /** Телефон: физический экран маленький (не окно браузера) и указатель — палец. Планшет и компьютер сюда не попадают. */
  const wantSteps = () => {
    if (stepsParam === '1') return true;
    if (stepsParam === '0') return false;
    const side = Math.min(
      window.screen?.width || Number.POSITIVE_INFINITY,
      window.screen?.height || Number.POSITIVE_INFINITY,
    );
    const small = Number.isFinite(side)
      ? side < PHONE_MAX
      : Math.min(window.innerWidth, window.innerHeight) < PHONE_MAX;
    return coarseQuery.matches && small;
  };

  /** Включает или выключает телефонный режим: класс на <html> отдаёт ленту движку (stage.css). */
  const applySteps = () => {
    const on = wantSteps();
    if (on === steps) return;
    steps = on;
    pan = null;
    html.classList.toggle('film-steps', on);
    // слушатель, который может отменять, вешаем только на телефоне: на планшете и компьютере он замедлял бы старт прокрутки
    if (on)
      track.addEventListener('touchmove', onTouchHold, { passive: false });
    else track.removeEventListener('touchmove', onTouchHold);
  };

  /** Касание началось на ленте (а не на списке сцен, под окном заявки или ниже ленты): его ведёт движок. */
  const ownsTouch = (target: EventTarget | null) =>
    target instanceof Node &&
    track.contains(target) &&
    !frozen() &&
    (list.hidden || !list.contains(target));

  /** Номер опорного кадра, ближайшего к `y`. */
  const nearestStop = (y: number) => {
    let best = 0;
    for (let i = 1; i < stops.length; i += 1) {
      if (Math.abs(stops[i].y - y) < Math.abs(stops[best].y - y)) best = i;
    }
    return best;
  };

  /**
   * Шаг ленты к кадру `to` (px страницы) от того места, где страница сейчас. Идёт доводкой, поэтому темп тот же, что и
   * везде: эффекты сцены проигрываются, а не пролетают. Если лента уже ехала, шаг продолжает её с того места, где она.
   * За концом ленты (выход к обычной странице и возврат оттуда) времени фильма нет: там просто плавный ход.
   */
  const goTo = (to: number) => {
    const y = window.scrollY;
    gesture = null;
    paceCap = Number.POSITIVE_INFINITY;
    inputDir = to > y ? 1 : -1;
    const now = performance.now();
    if (y > endY + AT_REST_PX || to > endY + AT_REST_PX) {
      const dur = clamp((Math.abs(to - y) / metrics.h) * EXIT_MS, 350, EXIT_MS);
      settle = {
        from: y,
        to,
        c0: 0,
        c1: 0,
        t0: now,
        dur,
        rin: 0,
        rout: 0,
        plain: true,
        step: true,
      };
    } else {
      const c0 = toClock((y - trackTop) / metrics.h);
      const c1 = toClock((to - trackTop) / metrics.h);
      settle = {
        from: y,
        to,
        c0,
        c1,
        t0: now,
        ...planSettle(Math.abs(c1 - c0)),
        step: true,
      };
    }
    request();
  };

  /** Свайп вверх (`dir` = 1) или вниз (−1): один шаг к соседнему кадру, считая от того, к которому лента уже едет. */
  const stepFilm = (dir: 1 | -1) => {
    if (stops.length === 0 || frozen()) return;
    const y = window.scrollY;
    const anchor = settle ? settle.to : y;
    const pick =
      dir > 0
        ? stops.find((st) => st.y > anchor + AT_REST_PX)
        : [...stops].reverse().find((st) => st.y < anchor - AT_REST_PX);
    if (!pick) {
      // дальше кадров нет: вниз по ленте некуда, а вверх за последним кадром начинается обычная страница
      if (dir > 0 && anchor < trackBottom - AT_REST_PX) {
        dbg?.say('шаг ↑: за последним кадром, к обычной странице');
        goTo(trackBottom);
      } else dbg?.say('шаг пропущен: дальше кадров нет');
      return;
    }
    const ahead = Math.abs(stops.indexOf(pick) - nearestStop(y));
    if (ahead > STEP_QUEUE) {
      dbg?.count('шагов отброшено (очередь полна)');
      return;
    }
    dbg?.say(
      `шаг ${dir > 0 ? '↑' : '↓'}: к кадру ${stops.indexOf(pick)} (y ${pick.y}), очередь ${ahead}`,
    );
    dbg?.count('шагов');
    goTo(pick.y);
  };

  /** Свайп вбок в сцене с лентой (кейсы): влево — следующий кадр сцены, вправо — предыдущий; из сцены вбок не уходим. */
  const sideFilm = (dir: 1 | -1) => {
    if (stops.length === 0 || frozen()) return;
    const y = window.scrollY;
    const anchor = settle ? settle.to : y;
    const slot = slots[sceneAt((anchor - trackTop) / metrics.h)];
    if (!slot.controller.sideways) {
      dbg?.say('свайп вбок: в этой сцене не листает');
      return;
    }
    const to =
      dir > 0
        ? slot.stopYs.find((sy) => sy > anchor + AT_REST_PX)
        : [...slot.stopYs].reverse().find((sy) => sy < anchor - AT_REST_PX);
    if (to === undefined) return;
    const ahead = Math.abs(
      stops.findIndex((st) => st.y === to) - nearestStop(y),
    );
    if (ahead > STEP_QUEUE) return;
    dbg?.say(`свайп вбок ${dir > 0 ? '←' : '→'}: к кадру сцены (y ${to})`);
    dbg?.count('шагов');
    goTo(to);
  };

  /** Палец, который ведёт свайп, подвинулся: прошёл STEP_PX по главной оси — делаем шаг (один на всё касание). */
  const panBy = (touch: Touch) => {
    const p = pan;
    if (!p || p.done) return;
    const dx = touch.clientX - p.x;
    const dy = touch.clientY - p.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < STEP_PX) return;
    p.done = true;
    if (Math.abs(dy) >= Math.abs(dx)) stepFilm(dy < 0 ? 1 : -1);
    else sideFilm(dx < 0 ? 1 : -1);
  };
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    aimX = (event.clientX / window.innerWidth - 0.5) * 2;
    aimY = (event.clientY / window.innerHeight - 0.5) * 2;
    request();
  };
  const onLeave = () => {
    aimX = 0;
    aimY = 0;
    request();
  };
  /** Фокус с клавиатуры ушёл в невидимую сцену — показываем её. */
  const onFocusIn = (event: FocusEvent) => {
    const el = event.target as Element | null;
    const index = slots.findIndex((slot) => slot.el.contains(el));
    if (index < 0 || index === activeIndex) return;
    const stopNo =
      el instanceof HTMLElement
        ? slots[index].controller.stopFor?.(el)
        : undefined;
    seek(index, stopNo ?? undefined);
  };
  const onResize = () => {
    dbg?.count('resize');
    resizing = true;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      // адресная строка телефона «шевелит» окно при каждой прокрутке, а размер закреплённого экрана не меняется
      const key = `${window.innerWidth}x${stage.clientHeight || window.innerHeight}x${tallQuery.matches ? 1 : 0}`;
      if (key === sizeKey) {
        resizing = false;
        remember();
        return;
      }
      relayout();
    }, 120);
  };
  /** Окно стало выше, чем шире (или наоборот): переключается раскладка, сцены меряем заново сразу. */
  const onLayout = () => {
    resizing = true;
    relayout();
  };

  /* ───────────── отладка на телефоне (?debug) ───────────── */

  const sizeProbe = document.createElement('i');
  sizeProbe.setAttribute('aria-hidden', 'true');
  sizeProbe.style.cssText =
    'position:absolute;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
  const dbg = createDebug(() => {
    if (!sizeProbe.isConnected) stage.append(sizeProbe);
    const y = window.scrollY;
    const at = nearestStop(y);
    const vv = window.visualViewport;
    return [
      `${steps ? 'ТЕЛЕФОН: свайп = шаг' : 'обычная прокрутка'} · указатель ${coarseQuery.matches ? 'палец' : 'мышь'} · касание ленты: ${getComputedStyle(track).touchAction}`,
      `окно ${window.innerWidth}×${window.innerHeight} · визуальное ${vv ? `${Math.round(vv.width)}×${Math.round(vv.height)}` : '—'} · экран ${window.screen.width}×${window.screen.height}`,
      `кадр ленты (100svh) ${stage.clientHeight} · svh ${sizeProbe.offsetHeight} · замер h ${metrics.h}`,
      `scrollY ${y.toFixed(1)} · ближайший кадр ${at}/${stops.length - 1} (y ${stops[at]?.y ?? '—'}) · конец ленты ${Math.round(endY)}`,
      `доводка: ${settle ? `к ${Math.round(settle.to)}${settle.plain ? ' плавно' : ''}${settle.step ? ' (шаг)' : ''}` : 'нет'} · палец: ${pan ? (pan.done ? 'шаг сделан' : 'ведёт') : 'нет'} · стенки: ${gesture && !gesture.free ? 'есть' : 'нет'}`,
    ];
  });

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reload = () => window.location.reload();
  reduceCamera = !window.matchMedia('(hover: hover) and (pointer: fine)')
    .matches;

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('pointerup', onRelease);
  window.addEventListener('pointercancel', onRelease);
  window.addEventListener('resize', onResize);
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  document.addEventListener('click', onClick);
  document.addEventListener('pointerdown', onDocumentDown);
  document.addEventListener('keydown', onKey);
  root.addEventListener('focusin', onFocusIn);
  ringButton.addEventListener('click', onRing);
  motionQuery.addEventListener('change', reload);
  tallQuery.addEventListener('change', onLayout);
  coarseQuery.addEventListener('change', applySteps);

  /* ───────────── старт ───────────── */

  const ready = () => {
    // страховочный таймер уже вернул обычную колонку (шрифты грузились слишком долго): движок не нужен
    if (!html.classList.contains('film-live')) {
      dispose();
      return;
    }
    measure();
    current = target;
    render();
    // телефон: с этого момента ленту листает движок (до него страница прокручивается как обычная)
    applySteps();
    html.classList.add('film-ready');
    if (window.location.hash && goToHash(window.location.hash)) {
      current = target;
      needsRender = true;
    }
    // браузер мог вернуть прокрутку ещё до замера: место, которое «помнили» тогда, считалось по пустым размерам
    remember();
    armIdle();
    request();
  };

  if (document.fonts?.ready) {
    void document.fonts.ready.then(ready);
  } else {
    ready();
  }

  function dispose() {
    window.cancelAnimationFrame(raf);
    window.clearTimeout(idleTimer);
    window.clearTimeout(holdTimer);
    window.clearTimeout(resizeTimer);
    probe.remove();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    track.removeEventListener('touchmove', onTouchHold);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('pointerup', onRelease);
    window.removeEventListener('pointercancel', onRelease);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointer);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('click', onClick);
    document.removeEventListener('pointerdown', onDocumentDown);
    document.removeEventListener('keydown', onKey);
    root.removeEventListener('focusin', onFocusIn);
    ringButton.removeEventListener('click', onRing);
    motionQuery.removeEventListener('change', reload);
    tallQuery.removeEventListener('change', onLayout);
    coarseQuery.removeEventListener('change', applySteps);
    html.classList.remove('film-steps');
    dbg?.dispose();
    sizeProbe.remove();
    slots.forEach((slot) => window.clearTimeout(slot.cutTimer));
  }

  return dispose;
}
