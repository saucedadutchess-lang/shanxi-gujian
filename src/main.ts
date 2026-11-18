import './style.css';
import { createStage } from './stage';
import { Hall } from './roof/hall';
import { ERA_REFS, SOURCES, nearestRef, type EraRef } from './roof/references';
import { effective, eraName, eraReadout, formDesc, formName, formParts, type MorphState } from './roof/params';

const $ = <T extends HTMLElement>(selector: string) => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`找不到 ${selector}`);
  return el;
};

const stage = createStage($<HTMLCanvasElement>('#stage'));
const hall = new Hall();
stage.scene.add(hall.group);
// 开发时把舞台挂到 window 上，方便在控制台里摆相机、对照照片检查模型
if (import.meta.env.DEV) Object.assign(window, { __stage: stage });

const formSlider = $<HTMLInputElement>('#form');
const formTrack = $<HTMLElement>('.form-track');
const eraSlider = $<HTMLInputElement>('#era');
/** 攒尖：从庑殿把正脊缩没的第二根滑块，点了攒尖才出现 */
const ridgeSlider = $<HTMLInputElement>('#ridge');
const ridgeTrack = $<HTMLElement>('.ridge-track');
let spireMode = false;

/** 两个开关：目标值是 0 或 1，当前值平滑地追过去 */
type Branch = 'dbl' | 'jp';
const branchTarget: Record<Branch, number> = { dbl: 0, jp: 0 };
const branchValue: Record<Branch, number> = { dbl: 0, jp: 0 };
/** 每个开关的动画用一个独立的对象做标识，新动画开始时停掉同一开关上的旧动画 */
const branchOwner: Record<Branch, object> = { dbl: {}, jp: {} };
const branchButtons = [...document.querySelectorAll<HTMLButtonElement>('.switch')];
const formButtons = [...document.querySelectorAll<HTMLButtonElement>('.forms button')];

/**
 * 形制滑块 0、1、2、3 正对着庑殿、歇山、悬山、硬山四个按钮。
 * t 是山面从多高开始变成三角形（0 庑殿，1 悬山），g 是两端出挑收回多少（1 硬山）。
 * 分段折线让每个形制的名字正好在两个按钮的半路上切换：
 * 庑殿和歇山的分界 t = 0.12 落在 0.5，歇山和悬山的分界 t = 0.9 落在 1.5，悬山和硬山的分界 g = 0.5 落在 2.5。
 */
const T_KNOTS: [number, number][] = [[0, 0], [0.5, 0.12], [1, 0.45], [1.5, 0.9], [2, 1]];
function sliderToShape(v: number) {
  let t = 1;
  for (let i = 1; i < T_KNOTS.length; i++) {
    const [v0, t0] = T_KNOTS[i - 1];
    const [v1, t1] = T_KNOTS[i];
    if (v <= v1) {
      t = t0 + ((t1 - t0) * (v - v0)) / (v1 - v0);
      break;
    }
  }
  return { t: Math.max(0, t), g: Math.min(1, Math.max(0, v - 2)) };
}

function readState(): MorphState {
  const { t, g } = sliderToShape(Number(formSlider.value));
  return {
    t,
    g,
    era: Number(eraSlider.value) / 100,
    ...branchValue,
    zj: Number(ridgeSlider.value),
  };
}

function render() {
  const state = readState();
  hall.update(state);

  const { base, extras } = formParts(state);
  $('#form-name').textContent = formName(state);
  $('#form-parts').textContent = extras.length ? `${base} ＋ ${extras.join(' ＋ ')}` : '';
  $('#form-desc').textContent = formDesc(state);
  $('#era-name').textContent = eraName(state.era);
  $('#era-basis').textContent = nearestRef(state.era)?.basis ?? '两个参照点之间的插值';
  const readout = eraReadout(state.era);
  $('#era-slope').textContent = readout.slope;
  $('#era-eave').textContent = readout.eave;
  $('#era-bracket').textContent = readout.bracket;

  // 有些组合在实物中不存在：卷棚不用于庑殿和攒尖，重檐不用于悬山和硬山。
  // 用不了的开关变灰并写明原因；已经打开的自动关掉。
  const shape = effective({ ...state, zj: spireMode ? 1 : 0, dbl: 0, jp: 0 });
  const allowed: Record<Branch, boolean> = {
    jp: !spireMode && shape.t >= 0.12,
    dbl: spireMode || shape.t < 0.9,
  };
  const current = base === '四角攒尖' ? '攒尖' : base;
  for (const button of formButtons) {
    button.setAttribute('aria-pressed', String(button.textContent === current));
  }
  // 攒尖时由第二根滑块管，第一根的圆钮变灰；读屏软件读出当前形制
  formTrack.classList.toggle('idle', spireMode);
  formSlider.setAttribute('aria-valuetext', current);
  ridgeSlider.setAttribute('aria-valuetext', current);
  for (const button of branchButtons) {
    const key = button.dataset.branch as Branch;
    if (!allowed[key] && branchTarget[key] === 1) setBranch(key, 0);
    button.disabled = !allowed[key];
    button.setAttribute('aria-checked', String(branchTarget[key] === 1));
    const desc = button.querySelector<HTMLElement>('.sw-desc');
    if (desc?.dataset.off) {
      desc.dataset.on ??= desc.textContent ?? '';
      desc.textContent = allowed[key] ? desc.dataset.on : desc.dataset.off;
    }
  }
}

/** 一帧里不管有几处要求重画，模型只重新生成一次 */
let renderQueued = false;
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

/** 进入或退出攒尖：进入时第一根滑块回到庑殿、正脊缩没；退出时正脊长回来 */
function setSpire(on: boolean) {
  spireMode = on;
  ridgeTrack.hidden = !on;
  if (on) {
    slideTo(formSlider, 0);
    slideTo(ridgeSlider, 1);
  } else if (Number(ridgeSlider.value) > 0) {
    slideTo(ridgeSlider, 0);
  }
  requestRender();
}

// 拖动滑块时：停掉这个滑块上正在播的动画，免得动画和手抢；如果正在攒尖，先退出攒尖
formSlider.addEventListener('input', () => {
  stopSlide(formSlider);
  if (spireMode) setSpire(false);
  requestRender();
});
ridgeSlider.addEventListener('input', () => {
  stopSlide(ridgeSlider);
  requestRender();
});
// 正脊拖回最左端松手，就回到庑殿，收起第二根滑块
ridgeSlider.addEventListener('change', () => {
  if (Number(ridgeSlider.value) < 0.02) {
    ridgeSlider.value = '0';
    setSpire(false);
  }
});
eraSlider.addEventListener('input', () => {
  stopSlide(eraSlider);
  requestRender();
});
// 用键盘时，方向键一次跳到相邻的形制，不必按几十下
formSlider.addEventListener('keydown', (event) => {
  const v = Number(formSlider.value);
  const next: Record<string, number> = {
    ArrowRight: Math.floor(v + 1e-6) + 1,
    ArrowUp: Math.floor(v + 1e-6) + 1,
    ArrowLeft: Math.ceil(v - 1e-6) - 1,
    ArrowDown: Math.ceil(v - 1e-6) - 1,
    Home: 0,
    End: 3,
  };
  if (!(event.key in next)) return;
  event.preventDefault();
  if (spireMode) setSpire(false);
  slideTo(formSlider, Math.min(3, Math.max(0, next[event.key])));
});
// 按下滑块时也停：按住不动时还没有 input 事件
for (const slider of [formSlider, eraSlider, ridgeSlider]) slider.addEventListener('pointerdown', () => stopSlide(slider));

function ease(k: number) {
  return k * k * (3 - 2 * k);
}

/**
 * 在一段时间里反复调用 step(0→1)，每一帧重新生成模型。
 * 同一个对象上再开一段动画时，先停掉旧的，避免两段动画轮流改同一个值、来回抖。
 */
const running = new Map<object, number>();
function animate(owner: object, duration: number, step: (k: number) => void) {
  const start = performance.now();
  const token = (running.get(owner) ?? 0) + 1;
  running.set(owner, token);
  const tick = (now: number) => {
    if (running.get(owner) !== token) return;
    const k = Math.min(1, (now - start) / duration);
    step(ease(k));
    requestRender();
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function stopSlide(slider: HTMLInputElement) {
  running.set(slider, (running.get(slider) ?? 0) + 1);
}

/** 滑块平滑地滑到某个值，让人看到变形的过程。距离越远用时越长 */
function slideTo(slider: HTMLInputElement, value: number) {
  const from = Number(slider.value);
  const span = Number(slider.max) - Number(slider.min);
  const duration = 300 + 500 * Math.min(1, Math.abs(value - from) / span);
  animate(slider, duration, (k) => (slider.value = String(from + (value - from) * k)));
}

/** 时代刻度：放在滑块对应的位置上，点了滑过去 */
for (const button of document.querySelectorAll<HTMLButtonElement>('.ticks button')) {
  const slider = $<HTMLInputElement>(`#${button.dataset.for}`);
  const value = Number(button.dataset.value);
  button.style.left = `${(value / Number(slider.max)) * 100}%`;
  button.addEventListener('click', () => slideTo(slider, value));
}

function setBranch(key: Branch, to: number) {
  branchTarget[key] = to;
  const from = branchValue[key];
  animate(branchOwner[key], 900, (k) => (branchValue[key] = from + (to - from) * k));
}

for (const button of branchButtons) {
  const key = button.dataset.branch as Branch;
  button.addEventListener('click', () => setBranch(key, branchTarget[key] === 1 ? 0 : 1));
}

/** 把三个参照点的尺寸列成表，每个数字标出是实测、换算还是假定 */
function buildRefTable() {
  const rows: [string, Exclude<keyof EraRef, 'at' | 'name' | 'basis'>, (v: number) => string][] = [
    ['开间', 'bay', (v) => `${v.toFixed(2)} 米`],
    ['檐柱高', 'colH', (v) => `${v.toFixed(2)} 米`],
    ['柱径', 'colD', (v) => `${Math.round(v * 100)} 厘米`],
    ['斗拱每层高', 'tier', (v) => `${Math.round(v * 100)} 厘米`],
    ['斗拱出跳', 'jumps', (v) => `${v} 跳`],
    ['每跳长', 'jump', (v) => `${Math.round(v * 100)} 厘米`],
    ['出檐', 'eave', (v) => `${v.toFixed(2)} 米`],
    ['其中飞椽', 'fly', (v) => (v ? `${v.toFixed(2)} 米` : '无')],
    ['檐口坡度', 'slopeEave', (v) => v.toFixed(2)],
    ['屋脊坡度', 'slopeRidge', (v) => v.toFixed(2)],
    ['悬山出际', 'chuji', (v) => `${v.toFixed(2)} 米`],
    ['台基高', 'platformH', (v) => `${v.toFixed(2)} 米`],
    ['椽径', 'rafterD', (v) => `${Math.round(v * 100)} 厘米`],
    ['鸱尾、正吻高', 'finialH', (v) => `${v.toFixed(2)} 米`],
  ];
  const cls = { liang1944: 'src-solid', qinghua2011: 'src-solid', yzfs: 'src-solid', qing: 'src-solid', derived: 'src-derived', assumed: 'src-assumed' };
  const table = $<HTMLTableElement>('#ref-table');
  const head = table.createTHead().insertRow();
  for (const text of ['', ...ERA_REFS.map((ref) => ref.name)]) {
    const th = document.createElement('th');
    th.textContent = text;
    head.append(th);
  }
  const body = table.createTBody();
  for (const [label, key, format] of rows) {
    const tr = body.insertRow();
    tr.insertCell().textContent = label;
    for (const ref of ERA_REFS) {
      const span = document.createElement('span');
      span.textContent = format(ref[key].v);
      span.className = cls[ref[key].src];
      span.title = `${ref[key].note}\n（${SOURCES[ref[key].src]}）`;
      tr.insertCell().append(span);
    }
  }
}

// 点基本形：清掉已加的变化，再变到那个形制
for (const button of formButtons) {
  button.addEventListener('click', () => {
    for (const key of ['dbl', 'jp'] as const) {
      if (branchTarget[key] === 1) setBranch(key, 0);
    }
    const form = button.dataset.form;
    if (form === 'zj') {
      setSpire(true);
      return;
    }
    if (spireMode) setSpire(false);
    slideTo(formSlider, Number(form));
  });
}

buildRefTable();
render();
