// 到现场必看的方位图：有模型的按模型参数表画平面（柱网、墙、台明、月台、檐口投影）；
// 还没有模型的，按建筑页 JSON 里的实测柱网 plan 画（开间、进深、内柱、门窗、佛坛），再把看点编号标上去。
// 坐标和模型一致：x 向东、z 向南，单位米，原点在殿身中心。图上北在上。
import { COLUMNS, Db, EAVE, SIZES, SQUARE, Wb } from '../nanchan/params';
import * as sm from '../shengmudian/params';
import * as mt from '../muta/params';

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

interface Label {
  x: number;
  z: number;
  text: string;
  anchor?: 'start' | 'middle' | 'end';
}

interface PlanData {
  platform?: Rect;
  yuetai?: Rect;
  eave?: Rect;
  walls: Rect[];
  /** 前檐木装修那一道线（门洞处断开） */
  front: Rect[];
  altar?: Rect[];
  columns: { x: number; z: number; w: number; d: number; square: boolean }[];
  labels: Label[];
  /** 不是矩形的轮廓（八角塔） */
  polys?: { cls: string; pts: [number, number][] }[];
}

/** 建筑页 JSON 里的实测柱网（没有模型时用）。开间从正面看由左到右，进深由前到后 */
export interface GridSpec {
  /** 正面朝哪边 */
  facing: 'S' | 'W' | 'N' | 'E';
  bays: number[];
  depths: number[];
  /** 柱径：[檐柱, 内柱]，米 */
  colDia: [number, number];
  /** 内柱：ring = 内柱一周，退进一间（金箱斗底槽）；none = 殿内无柱 */
  inner: 'ring' | 'none';
  /** 前檐每间是门还是窗 */
  front: ('门' | '窗')[];
  /** 佛坛：占内槽第几到第几根柱之间（从 0 数），从后内柱往前几间深 */
  altar?: { from: number; to: number; depth: number };
  /** 后内柱一列砌扇面墙 */
  fanWall?: boolean;
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
    labels: [{ x: 0, z: Db + o - 0.35, text: '门', anchor: 'middle' }],
  };
}

/**
 * 按实测柱网画：先在“殿身坐标”里算（x 从正面看向右，z 向正面为正），再按朝向转到地图坐标。
 * 墙厚、台明没有测绘数字，墙按示意厚度画在柱中线上，台明和檐口不画。
 */
function grid(g: GridSpec): PlanData {
  const W = g.bays.reduce((a, b) => a + b, 0);
  const D = g.depths.reduce((a, b) => a + b, 0);
  const xs = [-W / 2];
  for (const b of g.bays) xs.push(xs[xs.length - 1] + b);
  const zs = [D / 2]; // 由前到后
  for (const d of g.depths) zs.push(zs[zs.length - 1] - d);
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  // 殿身坐标转地图坐标（x 向东、z 向南）
  const to = (x: number, z: number): [number, number] =>
    g.facing === 'S' ? [x, z] : g.facing === 'N' ? [-x, -z] : g.facing === 'W' ? [-z, x] : [z, -x];
  const box = (x0: number, z0: number, x1: number, z1: number): Rect => {
    const [a, b] = to(x0, z0);
    const [c, d] = to(x1, z1);
    return { x0: Math.min(a, c), z0: Math.min(b, d), x1: Math.max(a, c), z1: Math.max(b, d) };
  };
  const t = 0.8; // 示意墙厚
  const h = t / 2;
  const columns: PlanData['columns'] = [];
  const col = (i: number, j: number, dia: number) => {
    const [x, z] = to(xs[i], zs[j]);
    columns.push({ x, z, w: dia, d: dia, square: false });
  };
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= nz; j++) {
      if (i === 0 || i === nx || j === 0 || j === nz) col(i, j, g.colDia[0]);
      else if (g.inner === 'ring' && (i === 1 || i === nx - 1 || j === 1 || j === nz - 1)) col(i, j, g.colDia[1]);
    }
  const walls = [
    box(-W / 2 - h, -D / 2 - h, W / 2 + h, -D / 2 + h), // 后檐墙
    box(-W / 2 - h, -D / 2, -W / 2 + h, D / 2), // 两山墙
    box(W / 2 - h, -D / 2, W / 2 + h, D / 2),
  ];
  // 前檐：窗间画槛墙加窗那一道，门间留空
  const front = g.front.flatMap((k, i) => (k === '窗' ? [box(xs[i], D / 2 - h * 0.6, xs[i + 1], D / 2 + h * 0.6)] : []));
  const labels: Label[] = [];
  const doors = g.front.map((k, i) => (k === '门' ? i : -1)).filter((i) => i >= 0);
  if (doors.length) {
    const [lx, lz] = to((xs[doors[0]] + xs[doors[doors.length - 1] + 1]) / 2, D / 2 + 1.1);
    labels.push({ x: lx, z: lz, text: '门', anchor: 'middle' });
  }
  const altar: Rect[] = [];
  if (g.altar && g.inner === 'ring') {
    const rear = zs[nz - 1];
    const front0 = rear + g.depths[nz - 1] * g.altar.depth;
    altar.push(box(xs[g.altar.from], rear, xs[g.altar.to], front0));
    const [ax, az] = to((xs[g.altar.from] + xs[g.altar.to]) / 2, (rear + front0) / 2);
    labels.push({ x: ax, z: az + 0.2, text: '佛坛', anchor: 'middle' });
  }
  if (g.fanWall && g.inner === 'ring') walls.push(box(xs[1], zs[nz - 1] - 0.25, xs[nx - 1], zs[nz - 1] + 0.25));
  return { walls, front, altar, columns, labels };
}

/** 晋祠圣母殿：殿朝东，模型的 +z 是东、+x 是北 */
function shengmudian(): PlanData {
  const r = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0: z0, z0: -x1, x1: z1, z1: -x0 });
  const { Wo, Do, Wb: W, Db: D, XS, ZS } = sm;
  const [of, os] = sm.SIZES.platformOut;
  const h = sm.SIZES.wall[0] / 2;
  const [sw, sd] = sm.SIZES.shrine;
  return {
    platform: r(-Wo - os, Wo + os, -Do - of, Do + of),
    eave: r(-sm.ROOF_L.W, sm.ROOF_L.W, -sm.ROOF_L.D, sm.ROOF_L.D),
    walls: [r(-W - h, W + h, -D - h, -D + h), r(-W - h, -W + h, -D + h, ZS.C), r(W - h, W + h, -D + h, ZS.C)],
    front: [r(XS[1], XS[2], ZS.C - 0.2, ZS.C + 0.2), r(XS[5], XS[6], ZS.C - 0.2, ZS.C + 0.2)],
    altar: [r(-sw / 2, sw / 2, 0.25 - sd, 0.25)],
    // 不落地的童柱不画
    columns: sm.COLUMNS.filter((c) => c.foot === 0).map((c) => ({ x: c.z, z: -c.x, w: c.dia, d: c.dia, square: false })),
    labels: [{ x: ZS.C + 1.1, z: 0.2, text: '门' }, { x: -2.2, z: 0.2, text: '神龛' }, { x: ZS.B, z: 0.2, text: '前廊' }],
  };
}

/** 应县木塔：南面朝 +z，坐标和地图一致 */
function muta(): PlanData {
  const T8 = mt.T8;
  const at = (k: number, t: number, n: number): [number, number] => {
    const a = (k * Math.PI) / 4;
    return [Math.sin(a) * n + Math.cos(a) * t, Math.cos(a) * n - Math.sin(a) * t];
  };
  const oct = (a: number) => [0, 1, 2, 3, 4, 5, 6, 7].map((k) => at(k, a * T8, a));
  const [sq, po] = mt.SIZES.plat;
  const polys: NonNullable<PlanData['polys']> = [
    { cls: 'yuetai', pts: [[-sq / 2, -sq / 2], [sq / 2, -sq / 2], [sq / 2, sq / 2], [-sq / 2, sq / 2]] },
    { cls: 'platform', pts: oct(po / 2) },
    { cls: 'eave', pts: oct(mt.FUJIE.eave) },
  ];
  for (const [[a0, a1], door] of [[mt.SIZES.wallOut, 3.2], [mt.SIZES.wallIn, 3]] as [number[], number][])
    for (let k = 0; k < 8; k++) {
      const seg = (p: [number, number][]) => polys.push({ cls: 'wall', pts: p.map(([t, n]) => at(k, t, n)) });
      if (k % 4 === 0) {
        seg([[-a0 * T8, a0], [-door / 2, a0], [-door / 2, a1], [-a1 * T8, a1]]);
        seg([[door / 2, a0], [a0 * T8, a0], [a1 * T8, a1], [door / 2, a1]]);
      } else seg([[-a0 * T8, a0], [a0 * T8, a0], [a1 * T8, a1], [-a1 * T8, a1]]);
    }
  polys.push({ cls: 'altar', pts: oct(2.6) });
  const columns: PlanData['columns'] = [];
  const put = (side: number, ts: number[], d: number) => {
    for (let k = 0; k < 8; k++) for (const t of ts) {
      const [x, z] = at(k, t, mt.apo(side));
      columns.push({ x, z, w: d, d, square: false });
    }
  };
  const t1 = mt.TIERS[0];
  put(mt.FUJIE.foot, [-mt.FUJIE.ming / 2, mt.FUJIE.ming / 2, mt.FUJIE.foot / 2], 0.52);
  put(t1.foot, [-t1.ming / 2, t1.ming / 2, t1.foot / 2], mt.SIZES.dia[1]);
  put(mt.INNER[0].foot, [mt.INNER[0].foot / 2], mt.SIZES.dia[1]);
  return { walls: [], front: [], columns, polys, labels: [{ x: 0, z: 13.4, text: '门' }, { x: 0, z: -12.7, text: '门' }] };
}

const PLANS: Record<string, () => PlanData> = { nanchan, shengmudian, muta };
export const hasPlan = (model?: string, spec?: GridSpec) => !!spec || (!!model && model in PLANS);

const f = (v: number) => v.toFixed(2);
const rect = (r: Rect, cls: string) =>
  `<rect class="${cls}" x="${f(r.x0)}" y="${f(r.z0)}" width="${f(r.x1 - r.x0)}" height="${f(r.z1 - r.z0)}"/>`;

/** 画成 SVG 字符串；标记带 data-n，页面上用来和列表联动 */
export function planSvg(model: string | undefined, markers: Marker[], spec?: GridSpec) {
  const p = spec ? grid(spec) : PLANS[model!]();
  const polyBox = (p.polys ?? []).map(({ pts }): Rect => ({ x0: Math.min(...pts.map((q) => q[0])), x1: Math.max(...pts.map((q) => q[0])), z0: Math.min(...pts.map((q) => q[1])), z1: Math.max(...pts.map((q) => q[1])) }));
  const all = [...polyBox, p.platform, p.eave, p.yuetai, ...p.walls].filter((r): r is Rect => !!r);
  const ex0 = Math.min(...all.map((r) => r.x0), ...markers.map((m) => m.at[0]));
  const ex1 = Math.max(...all.map((r) => r.x1), ...markers.map((m) => m.at[0]));
  const ez0 = Math.min(...all.map((r) => r.z0), ...markers.map((m) => m.at[1]));
  const ez1 = Math.max(...all.map((r) => r.z1), ...markers.map((m) => m.at[1]));
  // 字号、标记、留白按图的大小放大，南禅寺（约 16 米）是 1
  const k = Math.max(1, Math.max(ex1 - ex0, ez1 - ez0) / 16);
  const pad = 1.6 * k;
  const x0 = ex0 - pad;
  const x1 = ex1 + pad;
  const z0 = ez0 - pad - 1.2 * k;
  const z1 = ez1 + pad;
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
        `<g class="mk" data-n="${m.n}" transform="translate(${f(m.at[0])} ${f(m.at[1])}) scale(${f(Math.max(1, k * 0.8))})" tabindex="0" role="button" aria-label="看点 ${m.n}：${m.title}"><circle r="0.62"/><text dy="0.24">${m.n}</text></g>`,
    )
    .join('');
  // 比例尺（5 米或 10 米）、指北针，放在上方两角
  const sl = k > 1.5 ? 10 : 5;
  const sx = x0 + 0.6 * k;
  const sz = z0 + 0.9 * k;
  const fs = `style="font-size:${f(0.5 * k)}px"`;
  const lbl = (r: Rect | undefined, text: string, x: (r: Rect) => number, z: (r: Rect) => number) =>
    r ? `<text class="lbl" ${fs} x="${f(x(r))}" y="${f(z(r))}" text-anchor="end">${text}</text>` : '';
  return `<svg class="plan" viewBox="${f(x0)} ${f(z0)} ${f(x1 - x0)} ${f(z1 - z0)}" role="img" aria-label="平面方位图">
    ${p.yuetai ? rect(p.yuetai, 'yuetai') : ''}
    ${p.platform ? rect(p.platform, 'platform') : ''}
    ${p.eave ? rect(p.eave, 'eave') : ''}
    ${(p.polys ?? []).map((q) => `<polygon class="${q.cls}" points="${q.pts.map((v) => `${f(v[0])},${f(v[1])}`).join(' ')}"/>`).join('')}
    ${(p.altar ?? []).map((a) => rect(a, 'altar')).join('')}
    ${p.walls.map((w) => rect(w, 'wall')).join('')}
    ${p.front.map((w) => rect(w, 'front')).join('')}
    ${cols}
    ${lbl(p.platform, '台明', (r) => r.x1 - 0.3, (r) => r.z0 + 0.7)}
    ${lbl(p.eave, '檐口投影', (r) => r.x1 - 0.2, (r) => r.z0 - 0.25)}
    ${lbl(p.yuetai, '月台', (r) => r.x1 - 0.3, (r) => r.z1 - 0.4)}
    ${p.labels.map((l) => `<text class="lbl" ${fs} x="${f(l.x)}" y="${f(l.z)}" text-anchor="${l.anchor ?? 'middle'}">${l.text}</text>`).join('')}
    <g class="scale"><path style="stroke-width:${f(0.06 * k)}" d="M${f(sx)} ${f(sz)}h${sl}"/><path style="stroke-width:${f(0.06 * k)}" d="M${f(sx)} ${f(sz - 0.15 * k)}v${f(0.3 * k)}M${f(sx + sl)} ${f(sz - 0.15 * k)}v${f(0.3 * k)}"/><text ${fs} x="${f(sx + sl / 2)}" y="${f(sz - 0.3 * k)}" text-anchor="middle">${sl} 米</text></g>
    <g class="north" transform="translate(${f(x1 - 0.9 * k)} ${f(z0 + 1.1 * k)}) scale(${f(k)})"><path d="M0 -0.8L0.35 0.3L0 0.1L-0.35 0.3Z"/><text y="-1">北</text></g>
    ${marks}
  </svg>`;
}
