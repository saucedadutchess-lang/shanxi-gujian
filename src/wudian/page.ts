// 四座单檐庑殿殿（华严寺大雄宝殿、善化寺大雄宝殿、永乐宫三清殿、万荣稷王庙大殿）的模型页共用：
// 读参数表、生成模型、配好视角，交给 src/model/viewer.ts。
import * as THREE from 'three';
import { startViewer } from '../model/viewer';
import type { ModelTable } from '../model/kit';
import { buildHall, derive } from './hall';

export interface WudianPage {
  name: string;
  table: ModelTable;
  /** 柱号说明里“第几缝”的方向，例如“自西向东” */
  order: string;
  /** 斜看从哪个角（从正面看：-1 左前角，1 右前角）和这个角叫什么 */
  corner: [number, string];
  basisDesc: Record<string, string>;
}

export function startWudian(cfg: WudianPage) {
  const h = derive(cfg.table);
  const H = h.platform[0];
  const { Wb, Db, colH } = h;
  const size = Math.max(Wb, Db);
  const top = h.yR[h.yR.length - 1];
  startViewer({
    name: cfg.name,
    build: () => buildHall(h),
    table: cfg.table,
    fen: h.F.fen / 1000,
    basisDesc: cfg.basisDesc,
    pose(v) {
      const s = cfg.corner[0];
      switch (v) {
        case 'front':
          return { p: new THREE.Vector3(0, H + 2, Db + size * 2.6 + 6), t: new THREE.Vector3(0, H + top * 0.42, 0) };
        case 'corner':
          return { p: new THREE.Vector3(s * (Wb + size * 2.2), H + top * 0.75, Db + size * 2.6), t: new THREE.Vector3(0, H + top * 0.38, 0) };
        case 'eave':
          return { p: new THREE.Vector3(s * (Wb + 4), H + colH * 0.55, Db + h.EAVE + 6), t: new THREE.Vector3(s * (Wb - 3), H + colH + 1, Db - 1) };
        case 'inside':
          return { p: new THREE.Vector3(0.6, H + 1.6, Db - 1.2), t: new THREE.Vector3(-Wb * 0.25, H + top * 0.55, -Db * 0.6), fov: 72 };
        case 'top':
          return { p: new THREE.Vector3(s * (Wb + size), H + top + size * 1.3, Db + size * 1.6), t: new THREE.Vector3(0, H + top * 0.4, 0) };
      }
    },
    columnInfo(colId) {
      const c = h.COLUMNS.find((k) => k.id === colId)!;
      const where = c.inner ? `第 ${c.i} 缝，离中线 ${Math.abs(c.z).toFixed(1)} 米（${c.z >= 0 ? '前' : '后'}）· 内柱` : `${h.ROWS[c.r]} 行第 ${c.i} 缝（${cfg.order}）· ${c.corner ? '角柱' : '檐柱'}`;
      return `<b>${c.inner ? '内柱' : colId}</b> ${where} · 柱头标高约 ${Math.round(c.top * 1000)} 毫米 · 下径 ${Math.round(c.dia * 1000)} 毫米`;
    },
    photoPoses: {},
    maxDistance: size * 6 + 40,
    miniBack: 1.1,
    shadowSpan: size * 1.6 + 10,
  });
}

/** 四座殿共用的“依据”说明，前一句各自不同 */
export const basisDesc = (measured: string): Record<string, string> => ({
  实测: measured,
  材分推算: '由材广按《营造法式》比例推出',
  修缮做法: '后代修缮时定下的做法',
  推测: '资料里没有，按《营造法式》或照片估计',
});
