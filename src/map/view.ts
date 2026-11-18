// 地图有两种画法：立体地形（terrain3d.ts）和平面示意图（svgview.ts）。
// 筛选、名片、标签和悬浮卡由 main.ts 统一管理，两种画法只负责把点画出来、告诉 main 点在屏幕上的哪里。
import type { Region, Unit } from './data';

export interface PointState {
  /** 符合筛选 */
  shown: boolean;
  /** 时间轴上已经亮起 */
  lit: boolean;
}

export interface MapView {
  /** 视图的根元素，切换时显示或隐藏 */
  readonly el: HTMLElement | SVGElement;
  show(on: boolean): void;
  setPoints(states: Map<string, PointState>): void;
  setSelected(id: string | null): void;
  /** 有片区筛选时，其余片区变淡 */
  setRegions(picked: Set<Region>): void;
  fitTo(list: Unit[]): void;
  reset(): void;
  zoom(factor: number): void;
  /** 点在地图容器里的位置（像素）；看不见时返回 null */
  screenPos(id: string): { x: number; y: number; r: number } | null;
  /** 0 = 看全省，1 = 放得很大。用来决定显示多少标签 */
  detail(): number;
  /** 视图变化（拖动、缩放、动画）后加一，标签据此重排 */
  version(): number;
  onHover(cb: (id: string | null, x: number, y: number) => void): void;
  onPick(cb: (id: string | null) => void): void;
}

/** 名录名字太长的（如五台山建筑群），标签只取括号前面 */
export const shortName = (name: string) => name.replace(/（.*$/, '');

export const REGION_COLOR: Record<Region, string> = {
  晋北: '#5f7d8c',
  晋中: '#a0763a',
  晋东南: '#6f8a4e',
  晋南: '#9c3b2e',
};

/** 点的大小：S 级最大，写了名片的中等，其余国保最小（屏幕像素，半径） */
export const pointRadius = (u: Unit) => (u.curated?.tier === 'S' ? 6.5 : u.curated?.card ? 4.8 : 3.2);
