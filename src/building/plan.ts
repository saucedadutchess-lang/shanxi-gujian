// 到现场必看的方位图：按模型参数表画平面（柱网、墙、台明、月台、檐口投影），再把看点编号标上去。
// 坐标和模型一致：x 向东、z 向南，单位米，原点在殿身中心。图上北在上。
import { COLUMNS, Db, EAVE, SIZES, SQUARE, Wb } from '../nanchan/params';

export interface Marker {
  n: number;
  at: [number, number];
  title: string;
}

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

interface PlanData {
  platform: Rect;
  yuetai?: Rect;
  eave: Rect;
  walls: Rect[];
  /** 前檐木装修那一道线（门洞处断开） */
  front: Rect[];
  columns: { x: number; z: number; w: number; d: number; square: boolean }[];
}

/** 南禅寺大殿：取 src/nanchan/params.ts 算好的尺寸，和模型画法一致 */
function nanchan(): PlanData {
  const o = SIZES.platformOut;
  const [wt] = SIZES.wall;
  const inset = 0.35; // 墙里皮在柱中以内，和 model.ts 一致
  const outset = wt - inset;
  const [yd] = SIZES.yuetai;
  const door = SIZES.door[0];
  return {
    platform: { x0: -(Wb + o), z0: -(Db + o), x1: Wb + o, z1: Db + o },
    yuetai: { x0: -(Wb + o), z0: Db + o, x1: Wb + o, z1: Db + o + yd },
    eave: { x0: -(Wb + EAVE), z0: -(Db + EAVE), x1: Wb + EAVE, z1: Db + EAVE },
    walls: [
      { x0: -(Wb + outset), z0: -(Db + outset), x1: Wb + outset, z1: -(Db - inset) },
      { x0: -(Wb + outset), z0: -(Db + inset), x1: -(Wb - inset), z1: Db + 0.2 },
      { x0: Wb - inset, z0: -(Db + inset), x1: Wb + outset, z1: Db + 0.2 },
    ],
    front: [
      { x0: -(Wb - inset), z0: Db - 0.05, x1: -door / 2, z1: Db + 0.12 },
      { x0: door / 2, z0: Db - 0.05, x1: Wb - inset, z1: Db + 0.12 },
    ],
    columns: COLUMNS.map((c) => {
      const [w, d] = Array.isArray(c.dia) ? c.dia : [c.dia, c.dia];
      return { x: c.x, z: c.z, w, d, square: SQUARE.has(c.id) };
    }),
  };
}

const PLANS: Record<string, () => PlanData> = { nanchan };
export const hasPlan = (model?: string) => !!model && model in PLANS;

const f = (v: number) => v.toFixed(2);
const rect = (r: Rect, cls: string) =>
  `<rect class="${cls}" x="${f(r.x0)}" y="${f(r.z0)}" width="${f(r.x1 - r.x0)}" height="${f(r.z1 - r.z0)}"/>`;

/** 画成 SVG 字符串；标记带 data-n，页面上用来和列表联动 */
export function planSvg(model: string, markers: Marker[]) {
  const p = PLANS[model]();
  const pad = 1.6;
  const all = [p.platform, p.eave, ...(p.yuetai ? [p.yuetai] : [])];
  const x0 = Math.min(...all.map((r) => r.x0), ...markers.map((m) => m.at[0])) - pad;
  const x1 = Math.max(...all.map((r) => r.x1), ...markers.map((m) => m.at[0])) + pad;
  const z0 = Math.min(...all.map((r) => r.z0), ...markers.map((m) => m.at[1])) - pad - 1.2;
  const z1 = Math.max(...all.map((r) => r.z1), ...markers.map((m) => m.at[1])) + pad;
  const cols = p.columns
    .map((c) =>
      c.square
        ? `<rect class="col sq" x="${f(c.x - c.w / 2)}" y="${f(c.z - c.d / 2)}" width="${f(c.w)}" height="${f(c.d)}"/>`
        : `<circle class="col" cx="${f(c.x)}" cy="${f(c.z)}" r="${f(c.w / 2)}"/>`,
    )
    .join('');
  const marks = markers
    .map(
      (m) =>
        `<g class="mk" data-n="${m.n}" transform="translate(${f(m.at[0])} ${f(m.at[1])})" tabindex="0" role="button" aria-label="看点 ${m.n}：${m.title}"><circle r="0.62"/><text dy="0.24">${m.n}</text></g>`,
    )
    .join('');
  // 比例尺 5 米、指北针，放在左上角
  const sx = x0 + 0.6;
  const sz = z0 + 0.9;
  return `<svg class="plan" viewBox="${f(x0)} ${f(z0)} ${f(x1 - x0)} ${f(z1 - z0)}" role="img" aria-label="平面方位图">
    ${p.yuetai ? rect(p.yuetai, 'yuetai') : ''}
    ${rect(p.platform, 'platform')}
    ${rect(p.eave, 'eave')}
    ${p.walls.map((w) => rect(w, 'wall')).join('')}
    ${p.front.map((w) => rect(w, 'front')).join('')}
    ${cols}
    <text class="lbl" x="${f(p.platform.x1 - 0.3)}" y="${f(p.platform.z0 + 0.7)}" text-anchor="end">台明</text>
    <text class="lbl" x="${f(p.eave.x1 - 0.2)}" y="${f(p.eave.z0 - 0.25)}" text-anchor="end">檐口投影</text>
    ${p.yuetai ? `<text class="lbl" x="${f(p.yuetai.x1 - 0.3)}" y="${f(p.yuetai.z1 - 0.4)}" text-anchor="end">月台</text>` : ''}
    <text class="lbl" x="0" y="${f(p.platform.z1 - 0.35)}" text-anchor="middle">门</text>
    <g class="scale"><path d="M${f(sx)} ${f(sz)}h5"/><path d="M${f(sx)} ${f(sz - 0.15)}v0.3M${f(sx + 5)} ${f(sz - 0.15)}v0.3"/><text x="${f(sx + 2.5)}" y="${f(sz - 0.3)}" text-anchor="middle">5 米</text></g>
    <g class="north" transform="translate(${f(x1 - 0.9)} ${f(z0 + 1.1)})"><path d="M0 -0.8L0.35 0.3L0 0.1L-0.35 0.3Z"/><text y="-1">北</text></g>
    ${marks}
  </svg>`;
}
