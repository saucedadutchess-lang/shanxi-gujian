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

const formSlider = $<HTMLInputElement>('#form');
const eraSlider = $<HTMLInputElement>('#era');

/** 三个分支开关：目标值是 0 或 1，当前值平滑地追过去 */
type Branch = 'dbl' | 'jp' | 'zj';
const branchTarget: Record<Branch, number> = { dbl: 0, jp: 0, zj: 0 };
const branchValue: Record<Branch, number> = { dbl: 0, jp: 0, zj: 0 };
const branchButtons = [...document.querySelectorAll<HTMLButtonElement>('.switch')];
const formButtons = [...document.querySelectorAll<HTMLButtonElement>('.forms button')];

/** 形制滑块 0–100 是庑殿到悬山，100–130 是把两端出挑收回，变成硬山 */
function readState(): MorphState {
  const v = Number(formSlider.value);
  return {
    t: Math.min(v, 100) / 100,
    g: Math.max(0, v - 100) / 30,
    era: Number(eraSlider.value) / 100,
    ...branchValue,
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
  const shape = effective({ ...state, ...branchTarget, dbl: 0, jp: 0 });
  const isSpire = branchTarget.zj === 1;
  const allowed: Record<Branch, boolean> = {
    zj: true,
    jp: !isSpire && shape.t >= 0.12,
    dbl: isSpire || shape.t < 0.9,
  };
  const current = base === '四角攒尖' ? '攒尖' : base;
  for (const button of formButtons) {
    button.setAttribute('aria-pressed', String(button.textContent === current));
  }
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

// 拖动滑块时如果正在攒尖，先退出攒尖
formSlider.addEventListener('input', () => {
  if (branchTarget.zj === 1) setBranch('zj', 0);
  requestRender();
});
eraSlider.addEventListener('input', requestRender);

function ease(k: number) {
  return k * k * (3 - 2 * k);
}

/** 在一段时间里反复调用 step(0→1)，每一帧重新生成模型 */
function animate(duration: number, step: (k: number) => void) {
  const start = performance.now();
  const tick = (now: number) => {
    const k = Math.min(1, (now - start) / duration);
    step(ease(k));
    requestRender();
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** 点刻度标签时，滑块平滑地滑过去，让人看到变形的过程 */
for (const button of document.querySelectorAll<HTMLButtonElement>('.ticks button')) {
  const slider = $<HTMLInputElement>(`#${button.dataset.for}`);
  const value = Number(button.dataset.value);
  button.style.left = `${(value / Number(slider.max)) * 100}%`;
  button.addEventListener('click', () => {
    const from = Number(slider.value);
    animate(700, (k) => (slider.value = String(from + (value - from) * k)));
  });
}

function setBranch(key: Branch, to: number) {
  branchTarget[key] = to;
  const from = branchValue[key];
  animate(900, (k) => (branchValue[key] = from + (to - from) * k));
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
  const cls = { liang1944: 'src-solid', yzfs: 'src-solid', qing: 'src-solid', derived: 'src-derived', assumed: 'src-assumed' };
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
      if (branchTarget.zj !== 1) setBranch('zj', 1);
      return;
    }
    if (branchTarget.zj === 1) setBranch('zj', 0);
    const from = Number(formSlider.value);
    const to = Number(form);
    animate(700, (k) => (formSlider.value = String(from + (to - from) * k)));
  });
}

buildRefTable();
render();
