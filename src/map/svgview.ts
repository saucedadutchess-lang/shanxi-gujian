// 平面示意图：OSM 边界简化的轮廓加圆点。立体地形加载不了（比如显卡不支持 WebGL）时也用它。
import { REGIONS, REGION_CITIES, boundaries, units, type Region, type Unit } from './data';
import { pointRadius, rankOf, type MapView, type PointState } from './view';

const SVG = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

// 投影：等距圆柱，经度按山西中部纬度压缩
const K = Math.cos((37.6 * Math.PI) / 180);
const project = (lng: number, lat: number): [number, number] => [lng * K * 100, -lat * 100];

const regionOfCity = (city: string) => REGIONS.find((r) => REGION_CITIES[r].includes(city))!;
export const REGION_CLASS: Record<Region, string> = { 晋北: 'r-n', 晋中: 'r-c', 晋东南: 'r-se', 晋南: 'r-s' };

export function createSvgView(map: SVGSVGElement): MapView {
  const gCities = svgEl('g', { class: 'cities' });
  const gProvince = svgEl('g', { class: 'province' });
  const gLabels = svgEl('g', { class: 'city-labels' });
  const gPoints = svgEl('g', { class: 'points' });
  map.append(gCities, gProvince, gLabels, gPoints);

  const ringPath = (rings: [number, number][][]) =>
    rings.map((r) => 'M' + r.map(([x, y]) => project(x, y).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z').join('');

  const cityPaths = new Map<string, SVGPathElement>();
  for (const [name, c] of Object.entries(boundaries.cities)) {
    const path = svgEl('path', { d: ringPath(c.rings), class: `city ${REGION_CLASS[regionOfCity(name)]}` });
    cityPaths.set(name, path);
    gCities.append(path);
    const pts = c.rings[0];
    const [cx, cy] = project(pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length);
    const label = svgEl('text', { x: cx.toFixed(1), y: cy.toFixed(1), class: 'city-label' });
    label.textContent = name.replace(/市$/, '');
    gLabels.append(label);
  }
  gProvince.append(svgEl('path', { d: ringPath(boundaries.province.rings), class: 'province-line' }));

  const all = boundaries.province.rings.flat().map(([x, y]) => project(x, y));
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const PAD = 12;
  const FULL = {
    x: Math.min(...xs) - PAD,
    y: Math.min(...ys) - PAD,
    w: Math.max(...xs) - Math.min(...xs) + PAD * 2,
    h: Math.max(...ys) - Math.min(...ys) + PAD * 2,
  };
  let view = { ...FULL };
  let ver = 0;
  let selected: string | null = null;

  const located = units.filter((u) => u.location).sort((a, b) => Number(!!a.curated) - Number(!!b.curated));
  const dots = new Map<string, SVGCircleElement>();
  const byId = new Map(located.map((u) => [u.id, u]));
  let hoverCb: (id: string | null, x: number, y: number) => void = () => {};
  let pickCb: (id: string | null) => void = () => {};
  const wrapPos = (e: MouseEvent) => {
    const r = map.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  for (const u of located) {
    const [x, y] = project(u.location!.lng, u.location!.lat);
    const rank = rankOf(u);
    const dot = svgEl('circle', { cx: x.toFixed(2), cy: y.toFixed(2), class: `dot ${REGION_CLASS[u.region]} rank-${rank === 'S?' ? 'Ss' : rank}`, tabindex: 0 });
    dot.setAttribute('aria-label', u.name);
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      pickCb(u.id);
    });
    dot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pickCb(u.id);
      }
    });
    dot.addEventListener('pointerenter', (e) => hoverCb(u.id, ...wrapPos(e)));
    dot.addEventListener('pointerleave', () => hoverCb(null, 0, 0));
    dot.addEventListener('focus', () => {
      const p = screenPos(u.id);
      if (p) hoverCb(u.id, p.x, p.y);
    });
    dot.addEventListener('blur', () => hoverCb(null, 0, 0));
    dots.set(u.id, dot);
    gPoints.append(dot);
  }

  function apply() {
    map.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    const s = view.w / FULL.w;
    map.style.setProperty('--s', String(s));
    for (const [id, dot] of dots) dot.setAttribute('r', (pointRadius(byId.get(id)!) * 0.8 * s * (id === selected ? 1.4 : 1)).toFixed(3));
    ver++;
  }

  function zoomAt(factor: number, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
    const w = Math.min(FULL.w * 1.2, Math.max(FULL.w / 12, view.w * factor));
    const f = w / view.w;
    view = { x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f, w, h: view.h * f };
    apply();
  }
  const toMap = (e: { clientX: number; clientY: number }) => {
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(map.getScreenCTM()!.inverse());
    return [pt.x, pt.y] as const;
  };
  map.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const [x, y] = toMap(e);
      zoomAt(Math.exp(e.deltaY * 0.0015), x, y);
    },
    { passive: false },
  );
  let drag: { x: number; y: number; moved: boolean } | null = null;
  map.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).classList.contains('dot')) return;
    const [x, y] = toMap(e);
    drag = { x, y, moved: false };
    map.setPointerCapture(e.pointerId);
  });
  map.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [x, y] = toMap(e);
    view.x -= x - drag.x;
    view.y -= y - drag.y;
    drag.moved = true;
    apply();
  });
  map.addEventListener('pointerup', () => {
    if (drag && !drag.moved) pickCb(null);
    drag = null;
  });

  function screenPos(id: string) {
    const dot = dots.get(id);
    if (!dot || dot.classList.contains('hidden') || map.style.display === 'none') return null;
    const ctm = map.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))).matrixTransform(ctm);
    const r = map.getBoundingClientRect();
    return { x: p.x - r.left, y: p.y - r.top, r: Number(dot.getAttribute('r')) * ctm.a };
  }

  apply();
  return {
    el: map,
    show(on) {
      map.style.display = on ? '' : 'none';
      ver++;
    },
    setPoints(states: Map<string, PointState>) {
      for (const [id, dot] of dots) {
        const st = states.get(id)!;
        dot.classList.toggle('hidden', !st.shown);
        dot.classList.toggle('unlit', !st.lit);
      }
      ver++;
    },
    setSelected(id) {
      if (selected) dots.get(selected)?.classList.remove('selected');
      selected = id;
      if (id) dots.get(id)?.classList.add('selected');
      apply();
    },
    setRegions(picked) {
      for (const [city, path] of cityPaths) path.classList.toggle('dim', picked.size > 0 && !picked.has(regionOfCity(city)));
    },
    fitTo(list: Unit[]) {
      const pts = list.filter((u) => u.location).map((u) => project(u.location!.lng, u.location!.lat));
      if (!pts.length) return;
      const px = pts.map((p) => p[0]);
      const py = pts.map((p) => p[1]);
      const pad = 15;
      let w = Math.max(...px) - Math.min(...px) + pad * 2;
      let h = Math.max(...py) - Math.min(...py) + pad * 2;
      const ratio = FULL.w / FULL.h;
      if (w / h > ratio) h = w / ratio;
      else w = h * ratio;
      const cx = (Math.max(...px) + Math.min(...px)) / 2;
      const cy = (Math.max(...py) + Math.min(...py)) / 2;
      view = { x: cx - w / 2, y: cy - h / 2, w, h };
      apply();
    },
    reset() {
      view = { ...FULL };
      apply();
    },
    zoom(f) {
      zoomAt(f);
    },
    screenPos,
    detail: () => Math.min(1, Math.max(0, (FULL.w / view.w - 1) / 2.5)),
    version: () => ver,
    onHover(cb) {
      hoverCb = cb;
    },
    onPick(cb) {
      pickCb = cb;
    },
  };
}
