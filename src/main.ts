import './style.css';
import { createStage } from './stage';
import { Hall } from './roof/hall';
import { FORM_DESC, eraName, eraReadout, formName, type MorphState } from './roof/params';

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

/** 形制滑块 0–100 是庑殿到悬山，100–130 是把两端出挑收回，变成硬山 */
function readState(): MorphState {
  const v = Number(formSlider.value);
  return {
    t: Math.min(v, 100) / 100,
    g: Math.max(0, v - 100) / 30,
    era: Number(eraSlider.value) / 100,
  };
}

function render() {
  const state = readState();
  hall.update(state);

  const name = formName(state);
  $('#form-name').textContent = name;
  $('#form-desc').textContent = FORM_DESC[name];

  $('#era-name').textContent = eraName(state.era);
  const readout = eraReadout(state.era);
  $('#era-slope').textContent = readout.slope;
  $('#era-eave').textContent = readout.eave;
  $('#era-bracket').textContent = readout.bracket;
}

formSlider.addEventListener('input', render);
eraSlider.addEventListener('input', render);

/** 点刻度标签时，滑块平滑地滑过去，让人看到变形的过程 */
function glide(slider: HTMLInputElement, target: number) {
  const from = Number(slider.value);
  const start = performance.now();
  const duration = 700;
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / duration);
    const eased = k * k * (3 - 2 * k);
    slider.value = String(from + (target - from) * eased);
    render();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

for (const button of document.querySelectorAll<HTMLButtonElement>('.ticks button')) {
  const slider = $<HTMLInputElement>(`#${button.dataset.for}`);
  const value = Number(button.dataset.value);
  const max = Number(slider.max);
  button.style.left = `${(value / max) * 100}%`;
  button.addEventListener('click', () => glide(slider, value));
}

render();
