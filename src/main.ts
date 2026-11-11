import './style.css';
import { createStage } from './stage';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('找不到 #stage 画布');

createStage(canvas);
