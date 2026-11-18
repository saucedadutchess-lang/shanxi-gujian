import '../style.css';
import './map.css';
import { ERA_GROUPS, type EraGroup } from './era';
import {
  BATCH_DATES,
  FORMS,
  HIGHLIGHTS,
  REGIONS,
  REGION_CITIES,
  boundaries,
  sources,
  units,
  type Fact,
  type Region,
  type Unit,
} from './data';

const $ = <T extends Element>(selector: string) => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`找不到 ${selector}`);
  return el;
};
const SVG = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// ---------- 投影：等距圆柱，经度按山西中部纬度压缩 ----------
const K = Math.cos((37.6 * Math.PI) / 180);
const project = (lng: number, lat: number): [number, number] => [lng * K * 100, -lat * 100];

const map = $<SVGSVGElement>('#map');
const gCities = svgEl('g', { class: 'cities' });
const gProvince = svgEl('g', { class: 'province' });
const gLabels = svgEl('g', { class: 'city-labels' });
const gPoints = svgEl('g', { class: 'points' });
map.append(gCities, gProvince, gLabels, gPoints);

const ringPath = (rings: [number, number][][]) =>
  rings.map((r) => 'M' + r.map(([x, y]) => project(x, y).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z').join('');

const regionOfCity = (city: string) => REGIONS.find((r) => REGION_CITIES[r].includes(city))!;
const REGION_CLASS: Record<Region, string> = { 晋北: 'r-n', 晋中: 'r-c', 晋东南: 'r-se', 晋南: 'r-s' };

const cityPaths = new Map<string, SVGPathElement>();
for (const [name, c] of Object.entries(boundaries.cities)) {
  const path = svgEl('path', { d: ringPath(c.rings), class: `city ${REGION_CLASS[regionOfCity(name)]}` });
  cityPaths.set(name, path);
  gCities.append(path);
  // 标签放在外环顶点的平均位置
  const pts = c.rings[0];
  const [cx, cy] = project(pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length);
  const label = svgEl('text', { x: cx.toFixed(1), y: cy.toFixed(1), class: 'city-label' });
  label.textContent = name.replace(/市$/, '');
  gLabels.append(label);
}
gProvince.append(svgEl('path', { d: ringPath(boundaries.province.rings), class: 'province-line' }));

// 视图范围取省界外包框
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

// ---------- 点位 ----------
const dots = new Map<string, SVGCircleElement>();
const located = units.filter((u) => u.location);
// 整理过的画在最上面
located.sort((a, b) => Number(!!a.curated) - Number(!!b.curated));
for (const u of located) {
  const [x, y] = project(u.location!.lng, u.location!.lat);
  const tier = u.curated?.tier ?? 'B';
  const dot = svgEl('circle', { cx: x.toFixed(2), cy: y.toFixed(2), class: `dot ${REGION_CLASS[u.region]} tier-${tier}${u.curated?.card ? ' has-card' : ''}`, tabindex: 0 });
  dot.dataset.id = u.id;
  const title = svgEl('title');
  title.textContent = `${u.name}（${u.record.era}）`;
  dot.append(title);
  dot.addEventListener('click', (e) => {
    e.stopPropagation();
    select(u.id);
  });
  dot.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(u.id);
    }
  });
  dots.set(u.id, dot);
  gPoints.append(dot);
}

function applyView() {
  map.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  // 点和字在屏幕上保持大小不变
  const s = view.w / FULL.w;
  map.style.setProperty('--s', String(s));
  for (const [id, dot] of dots) {
    const tier = dot.classList.contains('tier-S') ? 2 : dot.classList.contains('tier-A') || dot.classList.contains('has-card') ? 1.5 : 1;
    dot.setAttribute('r', (2.6 * tier * s * (id === selected ? 1.4 : 1)).toFixed(3));
  }
}

// ---------- 缩放和拖动 ----------
function zoomAt(factor: number, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
  const w = Math.min(FULL.w * 1.2, Math.max(FULL.w / 12, view.w * factor));
  const f = w / view.w;
  view = { x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f, w, h: view.h * f };
  applyView();
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
  applyView();
});
map.addEventListener('pointerup', () => {
  if (drag && !drag.moved) select(null);
  drag = null;
});
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-zoom]')) {
  b.addEventListener('click', () => {
    if (b.dataset.zoom === 'in') zoomAt(0.7);
    else if (b.dataset.zoom === 'out') zoomAt(1 / 0.7);
    else {
      view = { ...FULL };
      applyView();
    }
  });
}

function fitTo(list: Unit[]) {
  const pts = list.filter((u) => u.location).map((u) => project(u.location!.lng, u.location!.lat));
  if (!pts.length) return;
  const px = pts.map((p) => p[0]);
  const py = pts.map((p) => p[1]);
  const pad = 15;
  let w = Math.max(...px) - Math.min(...px) + pad * 2;
  let h = Math.max(...py) - Math.min(...py) + pad * 2;
  // 保持和全省视图相同的长宽比
  const ratio = FULL.w / FULL.h;
  if (w / h > ratio) h = w / ratio;
  else w = h * ratio;
  const cx = (Math.max(...px) + Math.min(...px)) / 2;
  const cy = (Math.max(...py) + Math.min(...py)) / 2;
  view = { x: cx - w / 2, y: cy - h / 2, w, h };
  applyView();
}

// ---------- 筛选 ----------
const CATEGORIES = [...new Set(units.map((u) => u.record.category))];
const state = {
  year: 1912,
  region: new Set<Region>(),
  era: new Set<EraGroup>(),
  cat: new Set<string>(),
  form: new Set<string>(),
  hl: new Set<string>(),
};

function chips<T extends string>(container: string, options: readonly T[], set: Set<T>, count: (v: T) => number, onChange?: () => void) {
  const el = $<HTMLElement>(container);
  for (const v of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `${esc(v)} <span class="n">${count(v)}</span>`;
    b.addEventListener('click', () => {
      if (set.has(v)) set.delete(v);
      else set.add(v);
      b.setAttribute('aria-pressed', String(set.has(v)));
      onChange?.();
      update();
    });
    el.append(b);
  }
}
chips('#f-region', REGIONS, state.region, (v) => units.filter((u) => u.region === v).length, () => {
  const picked = units.filter((u) => state.region.has(u.region));
  if (picked.length) fitTo(picked);
  else {
    view = { ...FULL };
    applyView();
  }
});
chips('#f-era', ERA_GROUPS, state.era, (v) => units.filter((u) => u.era.group === v).length);
chips('#f-cat', CATEGORIES, state.cat, (v) => units.filter((u) => u.record.category === v).length);
chips('#f-form', FORMS, state.form, (v) => units.filter((u) => u.forms.has(v)).length);
chips('#f-hl', HIGHLIGHTS, state.hl, (v) => units.filter((u) => u.highlights.has(v)).length);

const anyOf = (wanted: Set<string>, have: Set<string>) => [...wanted].some((v) => have.has(v));
function matches(u: Unit) {
  if (state.region.size && !state.region.has(u.region)) return false;
  if (state.era.size && !state.era.has(u.era.group)) return false;
  if (state.cat.size && !state.cat.has(u.record.category)) return false;
  if (state.form.size && !anyOf(state.form, u.forms)) return false;
  if (state.hl.size && !anyOf(state.hl, u.highlights)) return false;
  return true;
}
/** 拖到最右端（1912）才算进民国以后的 */
const isLit = (u: Unit) => u.litYear <= state.year || state.year >= 1912;

// ---------- 时间轴 ----------
const TICKS: [string, number][] = [
  ['唐', 618],
  ['北宋', 960],
  ['金', 1115],
  ['元', 1271],
  ['明', 1368],
  ['清', 1644],
  ['民国', 1912],
];
const yearSlider = $<HTMLInputElement>('#year');
const yearName = $<HTMLOutputElement>('#year-name');
const MIN = Number(yearSlider.min);
const MAX = Number(yearSlider.max);
const ticksEl = $<HTMLElement>('#era-ticks');
for (const [name, y] of TICKS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = name;
  b.style.left = `${((y - MIN) / (MAX - MIN)) * 100}%`;
  b.addEventListener('click', () => setYear(y));
  ticksEl.append(b);
}
function eraOfYear(y: number) {
  if (y >= 1912) return '全部（含民国以后）';
  let name = '唐以前';
  for (const [n, start] of TICKS) if (y >= start) name = n;
  if (y >= 907 && y < 960) name = '五代';
  // 辽和北宋并立
  if (y >= 916 && y < 1125 && name !== '金') name = y >= 960 ? '北宋、辽' : '五代、辽';
  if (name === '金') name = y < 1127 ? '北宋、金' : '南宋、金';
  return `${y} 年 · ${name}`;
}
function setYear(y: number) {
  state.year = y;
  yearSlider.value = String(y);
  update();
}
yearSlider.addEventListener('input', () => {
  stopPlay();
  setYear(Number(yearSlider.value));
});

let playing: number | null = null;
const playBtn = $<HTMLButtonElement>('#play');
function stopPlay() {
  if (playing !== null) cancelAnimationFrame(playing);
  playing = null;
  playBtn.textContent = '▶ 从唐开始播放';
}
playBtn.addEventListener('click', () => {
  if (playing !== null) return stopPlay();
  playBtn.textContent = '■ 停止';
  const start = performance.now();
  const from = 618;
  const dur = 14000;
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / dur);
    setYear(Math.round(from + (MAX - from) * k));
    if (k < 1) playing = requestAnimationFrame(step);
    else stopPlay();
  };
  playing = requestAnimationFrame(step);
});

// ---------- 更新 ----------
const countEl = $<HTMLElement>('#count');
const listSection = $<HTMLElement>('#list-section');
const listEl = $<HTMLOListElement>('#list');
function update() {
  yearName.value = eraOfYear(state.year);
  let shown = 0;
  let lit = 0;
  for (const u of located) {
    const dot = dots.get(u.id)!;
    const m = matches(u);
    const l = isLit(u);
    dot.classList.toggle('hidden', !m);
    dot.classList.toggle('unlit', !l);
    if (m) shown++;
    if (m && l) lit++;
  }
  const filtered = Object.values(state).some((v) => v instanceof Set && v.size);
  countEl.textContent = filtered
    ? `筛出 ${shown} 处，其中 ${lit} 处在这个年份已经亮起`
    : `共 ${units.length} 条名录，${located.length} 处标在图上；现在亮着 ${lit} 处`;
  for (const [city, path] of cityPaths) path.classList.toggle('dim', state.region.size > 0 && !state.region.has(regionOfCity(city)));

  // 有筛选时列出结果，按亮起的先后排
  const list = filtered ? units.filter(matches).sort((a, b) => a.litYear - b.litYear) : [];
  listSection.hidden = !list.length;
  $<HTMLElement>('#list-title').textContent = `筛出的单位（按年代先后，${list.length} 处）`;
  listEl.replaceChildren(
    ...list.slice(0, 300).map((u) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span class="nm">${esc(u.name)}</span><span class="meta">${esc(u.record.era)} · ${esc(u.record.county)}</span>`;
      if (!u.location) b.title = '暂无坐标，图上没有这一处';
      b.addEventListener('click', () => select(u.id));
      li.append(b);
      return li;
    }),
  );
}

// ---------- 名片 ----------
const card = $<HTMLElement>('#card');
let selected: string | null = null;

const srcRefs = (f: Fact) =>
  f.src
    .map((id) => {
      const s = sources[id];
      const title = s.author ? `${s.author}《${s.title}》` : `《${s.title}》`;
      return s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title);
    })
    .join('；');
const factMeta = (f: Fact) =>
  `<span class="fact-meta">${f.kind ? `<span class="kind">${esc(f.kind)}</span>` : ''}${srcRefs(f)}${f.check ? `<span class="check">${esc(f.check)}</span>` : ''}</span>`;

function select(id: string | null) {
  if (selected) dots.get(selected)?.classList.remove('selected');
  selected = id;
  applyView();
  if (!id) {
    card.hidden = true;
    return;
  }
  const u = units.find((x) => x.id === id)!;
  dots.get(id)?.classList.add('selected');
  const c = u.curated;
  const r = u.record;
  const three = c?.card
    ? `<ol class="three">
        <li><span class="q">是什么</span>${esc(c.card.what.text)}${factMeta(c.card.what)}</li>
        <li><span class="q">特点</span>${esc(c.card.feature.text)}${factMeta(c.card.feature)}</li>
        <li><span class="q">价值</span>${esc(c.card.value.text)}${factMeta(c.card.value)}</li>
      </ol>`
    : `<p class="todo">名片三句话还没写。下面是名录里的信息。</p>`;
  // 一座单体的几项事实可能出处不同，合在一起列，待核的地方逐条带上
  const mergedMeta = (facts: (Fact | undefined)[]) => {
    const fs = facts.filter((x): x is Fact => !!x);
    return factMeta({
      src: [...new Set(fs.flatMap((x) => x.src))],
      kind: fs.every((x) => x.kind === fs[0]?.kind) ? fs[0]?.kind : undefined,
      check: fs.map((x) => x.check).filter(Boolean).join('；') || undefined,
    });
  };
  const buildings = c?.buildings?.length
    ? `<h4>单体</h4><ul class="buildings">${c.buildings
        .map(
          (b) =>
            `<li><b>${esc(b.name)}</b>${b.year ? `　${esc(b.year.label)}${/\d/.test(b.year.label) ? '' : `（${b.year.value}）`}` : ''}${b.form ? `　${esc(b.form.value.join('、'))}` : ''}${
              b.highlights ? `　看点：${esc(b.highlights.value.join('、'))}` : ''
            }${mergedMeta([b.year, b.form, b.highlights])}</li>`,
        )
        .join('')}</ul>`
    : '';
  const unitHighlights = c?.highlights
    ? `<p class="unit-hl">看点：${esc(c.highlights.value.join('、'))}${factMeta(c.highlights)}</p>`
    : '';
  const loc = u.location
    ? `${u.location.lat.toFixed(4)}, ${u.location.lng.toFixed(4)}（<a href="https://www.wikidata.org/wiki/${esc(u.location.wikidata)}" target="_blank" rel="noopener">Wikidata ${esc(
        u.location.wikidata,
      )}</a>，${esc(u.location.precision)}${u.location.note ? `；${esc(u.location.note)}` : ''}）`
    : '暂无坐标，图上没有标出';
  card.innerHTML = `
    <button type="button" class="close" aria-label="关闭">×</button>
    <p class="card-kicker">${esc(u.region)} · ${esc(r.category)}${c?.tier ? ` · <span class="badge">${esc(c.tier)} 级</span>` : ''}</p>
    <h2>${esc(u.name)}</h2>
    ${three}
    ${buildings}
    ${unitHighlights}
    <h4>名录信息</h4>
    <dl class="info">
      <dt>批次</dt><dd>第${'一二三四五六七八'[r.batch - 1]}批（${BATCH_DATES[r.batch]}公布）</dd>
      <dt>年代</dt><dd>${esc(r.era)}</dd>
      <dt>类别</dt><dd>${esc(r.category)}</dd>
      <dt>所在地</dt><dd>${esc(r.prefecture)} ${esc(r.county)}</dd>
      ${r.note ? `<dt>备注</dt><dd>${esc(r.note)}</dd>` : ''}
      <dt>国保编号</dt><dd>${u.id.startsWith('sx-') ? '未对上' : esc(u.id)}</dd>
      <dt>坐标</dt><dd>${loc}</dd>
    </dl>
    <p class="fact-src">名录信息出处：${factMeta(r)}</p>`;
  card.hidden = false;
  card.querySelector('.close')!.addEventListener('click', () => select(null));
  card.scrollIntoView({ block: 'nearest' });
}

// ---------- 起步 ----------
const unlocated = units.filter((u) => !u.location);
$<HTMLElement>('#unlocated').textContent = unlocated.length
  ? `暂无坐标、图上没有标出的 ${unlocated.length} 条：${unlocated.map((u) => u.name).join('、')}。`
  : '';
applyView();
update();
