import './style.css';
import { createStage } from './stage';
import { Hall } from './roof/hall';
import { effective, eraName, eraReadout, formDesc, formName, type MorphState } from './roof/params';

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
const branchButtons = [...document.querySelectorAll<HTMLButtonElement>('.branches button')];

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

  $('#form-name').textContent = formName(state);
  $('#form-desc').textContent = formDesc(state);
  $('#era-name').textContent = eraName(state.era);
  const readout = eraReadout(state.era);
  $('#era-slope').textContent = readout.slope;
  $('#era-eave').textContent = readout.eave;
  $('#era-bracket').textContent = readout.bracket;

  // 有些组合在实物中不存在：卷棚不用于庑殿和攒尖，重檐不用于悬山和硬山
  const target: MorphState = { ...state, ...branchTarget };
  const base = effective({ ...target, dbl: 0, jp: 0 });
  const allowed: Record<Branch, boolean> = {
    zj: true,
    jp: base.zj < 0.5 && base.t >= 0.12,
    dbl: base.zj > 0.5 || base.t < 0.9,
  };
  formSlider.disabled = branchTarget.zj === 1;
  for (const button of branchButtons) {
    const key = button.dataset.branch as Branch;
    button.disabled = !allowed[key];
    button.setAttribute('aria-pressed', String(branchTarget[key] === 1 && allowed[key]));
  }
}

formSlider.addEventListener('input', render);
eraSlider.addEventListener('input', render);

function ease(k: number) {
  return k * k * (3 - 2 * k);
}

/** 在一段时间里反复调用 step(0→1)，每一帧重新生成模型 */
function animate(duration: number, step: (k: number) => void) {
  const start = performance.now();
  const tick = (now: number) => {
    const k = Math.min(1, (now - start) / duration);
    step(ease(k));
    render();
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
    if (slider.disabled) return;
    const from = Number(slider.value);
    animate(700, (k) => (slider.value = String(from + (value - from) * k)));
  });
}

for (const button of branchButtons) {
  const key = button.dataset.branch as Branch;
  button.addEventListener('click', () => {
    branchTarget[key] = branchTarget[key] === 1 ? 0 : 1;
    const from = branchValue[key];
    const to = branchTarget[key];
    animate(900, (k) => (branchValue[key] = from + (to - from) * k));
  });
}

render();
