import '../style.css';
import './map.css';
import { ERA_GROUPS, type EraGroup } from './era';
import { galleryBlock, photosOf, wireGallery } from './photos';
import { setupSplitter } from './splitter';
import { createSvgView } from './svgview';
import { EXAGGERATION, createTerrainView } from './terrain3d';
import { renderThumb, thumbFor } from './thumbs';
import { SPIN_VIEWS, mountTurntable, unmountTurntable } from './turntable';
import type { MorphState } from '../roof/params';
import { RANK_LABEL, REGION_COLOR, rankOf, shortName, type MapView, type PointState } from './view';
import {
  BATCH_DATES,
  FORMS,
  HIGHLIGHTS,
  REGIONS,
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
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// ---------- 两种画法 ----------
const wrap = $<HTMLElement>('#map-wrap');
const svgView = createSvgView($<SVGSVGElement>('#map'));
let terrainView: MapView | null = null;
let view: MapView = svgView;
const located = units.filter((u) => u.location);
const byId = new Map(units.map((u) => [u.id, u]));
$<HTMLElement>('#exag').textContent = String(EXAGGERATION);
/** 标签和悬浮卡的状态：最近一次的筛选结果、悬浮的点；labelsVersion 设成 -1 表示要重排 */
let lastStates = new Map<string, PointState>();
let labelsVersion = -1;
let hovered: string | null = null;

const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-mode]')];
function setMode(mode: '3d' | '2d') {
  const next = mode === '3d' && terrainView ? terrainView : svgView;
  for (const b of modeButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === (next === svgView ? '2d' : '3d')));
  wrap.classList.toggle('mode-3d', next !== svgView);
  if (next === view) return;
  view.show(false);
  view = next;
  view.show(true);
  wireView(view);
  syncView();
}
for (const b of modeButtons) b.addEventListener('click', () => setMode(b.dataset.mode as '3d' | '2d'));

function wireView(v: MapView) {
  v.onPick((id) => select(id));
  v.onHover((id, x, y) => hover(id, x, y));
}
/** 换画法后把筛选、选中、片区都同步过去 */
function syncView() {
  view.setPoints(pointStates());
  view.setRegions(state.region);
  view.setSelected(selected);
  const picked = units.filter((u) => state.region.has(u.region));
  if (picked.length) view.fitTo(picked);
  labelsVersion = -1;
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-rotate]')) {
  b.addEventListener('click', () => view.rotate?.(Number(b.dataset.rotate)));
}
const tiltBtn = $<HTMLButtonElement>('#tilt');
tiltBtn.addEventListener('click', () => {
  const top = view.toggleTilt?.() ?? false;
  tiltBtn.setAttribute('aria-pressed', String(top));
  tiltBtn.textContent = top ? '斜看' : '俯视';
});
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-zoom]')) {
  b.addEventListener('click', () => {
    if (b.dataset.zoom === 'in') view.zoom(0.7);
    else if (b.dataset.zoom === 'out') view.zoom(1 / 0.7);
    else {
      view.reset();
      tiltBtn.setAttribute('aria-pressed', 'false');
      tiltBtn.textContent = '俯视';
    }
  });
}

// ---------- 分隔线 ----------
const splitter = setupSplitter($<HTMLElement>('#map-main'), $<HTMLElement>('#splitter'));
// 宽度变了，平面图的点在屏幕上的位置跟着变，标签要重排
new ResizeObserver(() => (labelsVersion = -1)).observe(wrap);
// 拖过分隔线以后，名片上的“放大”按钮回到“放大”
splitter.onChange(() => {
  const b = document.querySelector<HTMLButtonElement>('#card .widen');
  if (!b) return;
  b.setAttribute('aria-pressed', String(splitter.isWide()));
  b.textContent = splitter.isWide() ? '还原' : '放大';
});

// ---------- 筛选 ----------
const RANK_GROUPS = ['S 级', 'A 级', '其余'] as const;
type RankGroup = (typeof RANK_GROUPS)[number];
const rankGroup = (u: Unit): RankGroup => {
  const r = rankOf(u);
  return r === 'S' || r === 'S?' ? 'S 级' : r === 'A' ? 'A 级' : '其余';
};
const CATEGORIES = [...new Set(units.map((u) => u.record.category))];
const state = {
  year: 1912,
  region: new Set<Region>(),
  rank: new Set<RankGroup>(),
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
  view.setRegions(state.region);
  if (picked.length) view.fitTo(picked);
  else view.reset();
});
chips('#f-rank', RANK_GROUPS, state.rank, (v) => units.filter((u) => rankGroup(u) === v).length);
chips('#f-era', ERA_GROUPS, state.era, (v) => units.filter((u) => u.era.group === v).length);
chips('#f-cat', CATEGORIES, state.cat, (v) => units.filter((u) => u.record.category === v).length);
chips('#f-form', FORMS, state.form, (v) => units.filter((u) => u.forms.has(v)).length);
chips('#f-hl', HIGHLIGHTS, state.hl, (v) => units.filter((u) => u.highlights.has(v)).length);

const anyOf = (wanted: Set<string>, have: Set<string>) => [...wanted].some((v) => have.has(v));
function matches(u: Unit) {
  if (state.region.size && !state.region.has(u.region)) return false;
  if (state.rank.size && !state.rank.has(rankGroup(u))) return false;
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
function pointStates() {
  return new Map<string, PointState>(located.map((u) => [u.id, { shown: matches(u), lit: isLit(u) }]));
}
const countEl = $<HTMLElement>('#count');
const listSection = $<HTMLElement>('#list-section');
const listEl = $<HTMLOListElement>('#list');
function update() {
  yearName.value = eraOfYear(state.year);
  const states = pointStates();
  let shown = 0;
  let lit = 0;
  for (const st of states.values()) {
    if (st.shown) shown++;
    if (st.shown && st.lit) lit++;
  }
  view.setPoints(states);
  lastStates = states;
  labelsVersion = -1;
  const filtered = Object.values(state).some((v) => v instanceof Set && v.size);
  countEl.textContent = filtered
    ? `筛出 ${shown} 处，其中 ${lit} 处在这个年份已经亮起`
    : `共 ${units.length} 条名录，${located.length} 处标在图上；现在亮着 ${lit} 处`;

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

// 名片里的出处：正文只放角标，名片底部“出处”里列全。
// 类型只标例外（民间传说等），史料记载是常态，不打标签。
const srcTitle = (id: string) => {
  const s = sources[id];
  const title = s.author ? `${s.author}《${s.title}》` : `《${s.title}》`;
  return s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title);
};
const factMeta = (f: Fact) =>
  `<span class="fact-meta">${f.kind ? `<span class="kind">${esc(f.kind)}</span>` : ''}${f.src.map(srcTitle).join('；')}${f.check ? `<span class="check">${esc(f.check)}</span>` : ''}</span>`;
/** 一张名片里用到的出处按出现顺序编号；ref 给一条事实出角标，block 是底部的出处列表 */
function citer() {
  const list: string[] = [];
  const checks: string[] = [];
  const ref = (f: Fact | undefined, label: string) => {
    if (!f) return '';
    const ns = f.src.map((s) => {
      if (!list.includes(s)) list.push(s);
      return list.indexOf(s) + 1;
    });
    if (f.check) checks.push(`${label}：${f.check}`);
    const tag = f.kind && f.kind !== '史料记载' ? `<span class="kind-x">${esc(f.kind)}</span>` : '';
    return `${tag}<sup class="ref"><a href="#card-src" data-ref title="看出处">${ns.join(',')}</a></sup>`;
  };
  const block = () =>
    list.length
      ? `<details class="fold" id="card-src"><summary>出处（${list.length}）</summary><ol class="src-list">${list.map((s) => `<li>${srcTitle(s)}</li>`).join('')}</ol>${
          checks.length ? `<p class="src-check">待核：${checks.map(esc).join('；')}</p>` : ''
        }</details>`
      : '';
  return { ref, block };
}
/** 几条事实合成一条（单体的年代、形制、看点），出处取并集 */
const merge = (facts: (Fact | undefined)[]): Fact | undefined => {
  const fs = facts.filter((x): x is Fact => !!x);
  if (!fs.length) return undefined;
  return {
    src: [...new Set(fs.flatMap((x) => x.src))],
    kind: fs.find((x) => x.kind && x.kind !== '史料记载')?.kind ?? fs[0].kind,
    check: fs.map((x) => x.check).filter(Boolean).join('；') || undefined,
  };
};

// 写了建筑页的单位、按测绘尺寸建了模型的单位（值是 data/models/ 下的模型名，页面是同名 html）
const BUILDING_PAGES: Record<string, string> = {
  '1-0079-3-032': './building.html?id=nanchan',
  '1-0080-3-033': './building.html?id=foguang',
  '1-0085-3-038': './building.html?id=shengmudian',
  '1-0071-3-024': './building.html?id=muta',
};
const MODEL_PAGES: Record<string, string> = { '1-0079-3-032': 'nanchan', '1-0080-3-033': 'foguang', '1-0085-3-038': 'shengmudian', '1-0071-3-024': 'muta' };

/** 示意殿堂的参数换成屋顶变形器的网址，进去就摆好这个形制和年代 */
function morphHref(s: MorphState) {
  const form = s.zj ? '攒尖' : s.g ? '硬山' : s.t >= 1 ? '悬山' : s.t > 0 ? '歇山' : '庑殿';
  return `./index.html?form=${encodeURIComponent(form)}&era=${s.era.toFixed(2)}${s.dbl ? '&dbl=1' : ''}`;
}

function select(id: string | null) {
  selected = id;
  view.setSelected(id);
  hover(null, 0, 0);
  labelsVersion = -1;
  if (!id) {
    card.hidden = true;
    unmountTurntable();
    return;
  }
  const u = byId.get(id)!;
  const c = u.curated;
  const r = u.record;
  const cite = citer();
  const page = BUILDING_PAGES[u.id];
  const model = MODEL_PAGES[u.id];
  const t3 = thumbFor(u);
  const hasPhotos = photosOf(u.id).length > 0;
  // 有复原模型的嵌模型页的精简模式（同一套光照、阴影、地面）；其余用示意殿堂的转台
  const spin = !!model || !!t3;

  // ---- 图像区：实拍照片和 3D 共用一块，有两样时上面切换 ----
  const spinBlock = spin
    ? `<figure class="media-3d"${hasPhotos ? ' hidden' : ''}>
        ${
          model
            ? `<div class="spin-box model-box loading"><span class="spin-hint">拖动旋转 · 捏合缩放</span><span class="spin-wait">正在读入模型…</span>
                <a class="spin-open" href="./${model}.html">拆开完整模型 →</a></div>`
            : `<div class="spin-box"><canvas tabindex="0" aria-label="三维示意，拖动或按方向键转动，加减号缩放"></canvas>
                <span class="spin-hint">拖动旋转 · 捏合缩放</span><span class="spin-wait">正在生成…</span>
                <div class="spin-views" role="group" aria-label="视角">${Object.entries(SPIN_VIEWS)
                  .map(([k, v]) => `<button type="button" data-spin-view="${k}">${v.label}</button>`)
                  .join('')}</div></div>`
        }
        <figcaption>${
          model
            ? '<span class="tag tag-model">依据图纸复原</span>按已发表的尺寸生成的模型，彩塑、残损没有做'
            : `<span class="tag">示意</span>${esc(t3!.caption)}。屋顶变形器按形制和年代摆的通用殿堂，不是这座建筑的模型`
        }</figcaption></figure>`
    : '';
  const media =
    hasPhotos || spin
      ? `<div class="media">${
          hasPhotos && spin
            ? `<div class="media-tabs" role="tablist" aria-label="看照片还是 3D"><button type="button" role="tab" data-tab="photo" aria-selected="true">实拍照片</button><button type="button" role="tab" data-tab="3d" aria-selected="false">${model ? '3D 复原' : '3D 示意'}</button></div>`
            : ''
        }${hasPhotos ? `<div class="media-photo">${galleryBlock(u.id)}</div>` : ''}${spinBlock}</div>`
      : '';

  const three = c?.card
    ? `<ol class="three">
        <li><span class="q">是什么</span>${esc(c.card.what.text)}${cite.ref(c.card.what, '是什么')}</li>
        <li><span class="q">特点</span>${esc(c.card.feature.text)}${cite.ref(c.card.feature, '特点')}</li>
        <li><span class="q">价值</span>${esc(c.card.value.text)}${cite.ref(c.card.value, '价值')}</li>
      </ol>`
    : `<p class="todo">名片三句话还没写。名录里的信息在下面“名录与坐标”里。</p>`;

  // ---- 入口：建筑页是主按钮；没有建筑页时名片就是终点，只给去认形制的次按钮 ----
  const morph = t3 && !model ? `<a class="btn" href="${morphHref(t3.state)}">到屋顶变形器认形制 →</a>` : '';
  const actions = page
    ? `<div class="card-actions"><a class="btn primary" href="${page}">打开建筑页 →<small>时间轴、故事、三把钥匙、到现场必看</small></a>${
        model ? `<a class="btn" href="./${model}.html">拆开 3D 模型</a>` : ''
      }</div>`
    : `${c?.tier === 'S' ? '<p class="card-soon">S 级，建筑页编写中。</p>' : ''}${morph ? `<div class="card-actions">${morph}</div>` : ''}`;

  // 有建筑页的，单体、看点交给建筑页
  const buildings =
    !page && c?.buildings?.length
      ? `<h4>单体</h4><ul class="buildings">${c.buildings
          .map(
            (b) =>
              `<li><b>${esc(b.name)}</b>${b.year ? `　${esc(b.year.label)}${/\d/.test(b.year.label) ? '' : `（${b.year.value}）`}` : ''}${b.form ? `　${esc(b.form.value.join('、'))}` : ''}${
                b.highlights ? `　看点：${esc(b.highlights.value.join('、'))}` : ''
              }${cite.ref(merge([b.year, b.form, b.highlights]), b.name)}</li>`,
          )
          .join('')}</ul>`
      : '';
  const unitHighlights = !page && c?.highlights ? `<p class="unit-hl">看点：${esc(c.highlights.value.join('、'))}${cite.ref(c.highlights, '看点')}</p>` : '';
  const loc = u.location
    ? `${u.location.lat.toFixed(4)}, ${u.location.lng.toFixed(4)}（<a href="https://www.wikidata.org/wiki/${esc(u.location.wikidata)}" target="_blank" rel="noopener">Wikidata ${esc(
        u.location.wikidata,
      )}</a>，${esc(u.location.precision)}${u.location.note ? `；${esc(u.location.note)}` : ''}）`
    : '暂无坐标，图上没有标出';
  card.innerHTML = `
    <button type="button" class="close" aria-label="关闭">×</button>
    <button type="button" class="widen" aria-pressed="${splitter.isWide()}" title="把详情栏放大到约半屏，再点一次还原">${splitter.isWide() ? '还原' : '放大'}</button>
    <p class="card-kicker">${esc(u.region)} · ${esc(r.category)}${rankOf(u) !== 'B' ? ` · <span class="badge${c?.tier ? '' : ' soft'}">${esc(RANK_LABEL[rankOf(u)])}</span>` : ''}</p>
    <h2>${esc(u.name)}</h2>
    <p class="card-sub">${esc(r.era)} · ${esc(r.prefecture)}${esc(r.county)}</p>
    ${media}
    ${three}
    ${actions}
    ${buildings}
    ${unitHighlights}
    ${cite.block()}
    <details class="fold"><summary>名录与坐标</summary>
    <dl class="info">
      <dt>批次</dt><dd>第${'一二三四五六七八'[r.batch - 1]}批（${BATCH_DATES[r.batch]}公布）</dd>
      <dt>年代</dt><dd>${esc(r.era)}</dd>
      <dt>类别</dt><dd>${esc(r.category)}</dd>
      <dt>所在地</dt><dd>${esc(r.prefecture)} ${esc(r.county)}</dd>
      ${r.note ? `<dt>备注</dt><dd>${esc(r.note)}</dd>` : ''}
      <dt>国保编号</dt><dd>${u.id.startsWith('sx-') ? '未对上' : esc(u.id)}</dd>
      <dt>坐标</dt><dd>${loc}</dd>
    </dl>
    <p class="fact-src">名录信息出处：${factMeta(r)}</p></details>`;
  card.hidden = false;
  wireGallery(card);

  // 图像区切换；3D 第一次露出来时才生成
  const spinFig = card.querySelector<HTMLElement>('.media-3d');
  let mounted = false;
  const show3d = () => {
    if (mounted || !spinFig || !spin) return;
    mounted = true;
    const box = spinFig.querySelector<HTMLElement>('.spin-box')!;
    if (model) {
      // iframe 跟着名片走：换单位、关名片时随名片内容一起移除，三维画面也就释放了
      const f = document.createElement('iframe');
      f.src = `./${model}.html?mini`;
      f.title = `${u.name}三维复原模型`;
      box.prepend(f);
    } else mountTurntable(box, { kind: 'hall', state: t3!.state });
  };
  unmountTurntable();
  if (spinFig && !spinFig.hidden) show3d();
  for (const tab of card.querySelectorAll<HTMLButtonElement>('.media-tabs [data-tab]')) {
    tab.addEventListener('click', () => {
      const is3d = tab.dataset.tab === '3d';
      for (const t of card.querySelectorAll('.media-tabs [data-tab]')) t.setAttribute('aria-selected', String(t === tab));
      card.querySelector<HTMLElement>('.media-photo')!.hidden = is3d;
      spinFig!.hidden = !is3d;
      if (is3d) show3d();
    });
  }
  // 角标：展开底部的出处
  for (const a of card.querySelectorAll<HTMLAnchorElement>('[data-ref]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const d = card.querySelector<HTMLDetailsElement>('#card-src');
      if (!d) return;
      d.open = true;
      d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
  card.querySelector('.close')!.addEventListener('click', () => select(null));
  const widen = card.querySelector<HTMLButtonElement>('.widen')!;
  widen.addEventListener('click', () => {
    splitter.toggleWide();
  });
  card.scrollTop = 0;
  card.scrollIntoView({ block: 'nearest' });
}

// 名片里嵌的模型页读好、被拖动时会告诉这里，收起“正在读入”和操作提示
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  const box = card.querySelector<HTMLElement>('.model-box');
  if (!box) return;
  if (e.data?.type === 'model-ready') box.classList.remove('loading');
  if (e.data?.type === 'model-interacted') box.classList.add('spun');
});

// ---------- 起步 ----------
const unlocated = units.filter((u) => !u.location);
$<HTMLElement>('#unlocated').textContent = unlocated.length
  ? `暂无坐标、图上没有标出的 ${unlocated.length} 条：${unlocated.map((u) => u.name).join('、')}。`
  : '';
wireView(svgView);
update();
requestAnimationFrame(layoutLabels);

// 立体地形要先读高程图；显卡不支持 WebGL 或读取失败时留在平面图
createTerrainView(wrap)
  .then((v) => {
    terrainView = v;
    v.show(false);
    svgView.show(true);
    setMode('3d');
  })
  .catch((e) => {
    console.warn('立体地形没有加载成功，用平面示意图', e);
    for (const b of modeButtons) b.disabled = b.dataset.mode === '3d';
    $<HTMLElement>('#map-hint').textContent = '立体地形没有加载成功，现在是平面示意图';
  });

// ---------- 示意小图 ----------
/** 悬浮卡里的示意小图 */
function thumbBlock(u: Unit) {
  const t = thumbFor(u);
  if (!t) return '';
  return `<figure class="hover-thumb"><img alt="${esc(t.caption)}（示意）" data-thumb="${esc(u.id)}" /><figcaption><span class="tag">示意</span>${esc(t.caption)}</figcaption></figure>`;
}
function fillThumbs(root: HTMLElement) {
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-thumb]')) {
    const t = thumbFor(byId.get(img.dataset.thumb!)!);
    if (!t) continue;
    renderThumb(t.state)
      .then((url) => {
        if (img.isConnected) img.src = url;
      })
      .catch((e) => console.warn('示意小图渲染失败', e));
  }
}

// ---------- 悬浮卡 ----------
const hoverEl = $<HTMLElement>('#hover');
function hover(id: string | null, x: number, y: number) {
  if (id === selected) id = null;
  if (id !== hovered) {
    hovered = id;
    labelsVersion = -1;
    if (!id) {
      hoverEl.hidden = true;
      return;
    }
    const u = byId.get(id)!;
    const what = u.curated?.card?.what.text;
    hoverEl.innerHTML = `
      ${thumbBlock(u)}
      <p class="hc-kicker"><i style="background:${REGION_COLOR[u.region]}"></i>${esc(u.region)} · ${esc(u.record.county)} · ${esc(u.record.category)}</p>
      <h4>${esc(u.name)}</h4>
      <p class="hc-era">${esc(u.record.era)}${rankOf(u) !== 'B' ? ` · ${esc(RANK_LABEL[rankOf(u)])}` : ''}</p>
      ${what ? `<p class="hc-what">${esc(what)}</p>` : '<p class="hc-todo">名片还没写，点开看名录信息</p>'}
      <p class="hc-hint">点击看详情</p>`;
    fillThumbs(hoverEl);
    hoverEl.hidden = false;
  }
  if (!id) return;
  // 放在点的右边，靠边时换到左边或下边
  const w = hoverEl.offsetWidth;
  const h = hoverEl.offsetHeight;
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  let left = x + 16;
  if (left + w > W - 8) left = x - 16 - w;
  let top = y - h / 2;
  top = Math.max(8, Math.min(H - h - 40, top));
  hoverEl.style.transform = `translate(${Math.round(Math.max(8, left))}px, ${Math.round(top)}px)`;
}

// ---------- 标签 ----------
// 写了名片的一直显示名字；放大到片区以后显示全部；悬浮和选中的总是显示。互相压住的，按优先级藏掉
const labelsEl = $<HTMLElement>('#labels');
const labelEls = new Map<string, HTMLElement>();
const RANK_PRIORITY = { S: 2, 'S?': 2.5, A: 3, B: 4 } as const;
const priority = (u: Unit) => (u.id === selected ? 0 : u.id === hovered ? 1 : RANK_PRIORITY[rankOf(u)]);
const ordered = [...located].sort((a, b) => priority(a) - priority(b));
function layoutLabels() {
  requestAnimationFrame(layoutLabels);
  const v = view.version();
  if (v === labelsVersion) return;
  labelsVersion = v;
  const detail = view.detail();
  const states = lastStates;
  ordered.sort((a, b) => priority(a) - priority(b));
  const placed: [number, number, number, number][] = [];
  const used = new Set<string>();
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  for (const u of ordered) {
    const pr = priority(u);
    if (pr === 4 && detail < 0.35) continue;
    const st = states.get(u.id);
    if (!st?.shown || (!st.lit && pr > 1)) continue;
    const p = view.screenPos(u.id);
    if (!p || p.x < 0 || p.y < 0 || p.x > W || p.y > H) continue;
    let el = labelEls.get(u.id);
    if (!el) {
      el = document.createElement('span');
      const rk0 = rankOf(u);
      el.className = `label${rk0 === 'S' ? ' rank-s' : rk0 === 'S?' ? ' rank-ss' : ''}${rk0 === 'B' ? '' : ' strong'}`;
      el.textContent = shortName(u.name);
      labelEls.set(u.id, el);
      labelsEl.append(el);
      el.style.display = 'none';
    }
    const w = el.dataset.w ? Number(el.dataset.w) : measure(el);
    const pill = el.classList.contains('rank-s') || el.classList.contains('rank-ss');
    const h = pill ? 22 : 16;
    const gap = p.r + (pill ? 6 : 4);
    // 依次试右边、左边、上边、下边，都被压住就藏起来（选中和悬浮的总是显示在右边）
    const spots: [number, number][] = [
      [p.x + gap, p.y - h / 2],
      [p.x - gap - w, p.y - h / 2],
      [p.x - w / 2, p.y - gap - h],
      [p.x - w / 2, p.y + gap],
    ];
    const hits = (b: number[]) => placed.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    let spot: [number, number] | undefined = spots[0];
    if (pr > 1) spot = spots.find(([sx, sy]) => !hits([sx - 2, sy, sx + w + 2, sy + h]));
    if (!spot) continue;
    const [x, y] = spot;
    placed.push([x - 2, y, x + w + 2, y + h]);
    used.add(u.id);
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    el.classList.toggle('strong', pr <= 3);
    el.classList.toggle('sel', pr === 0);
    el.style.display = '';
  }
  for (const [id, el] of labelEls) if (!used.has(id)) el.style.display = 'none';
}
function measure(el: HTMLElement) {
  el.style.display = '';
  const w = el.offsetWidth;
  el.dataset.w = String(w);
  return w;
}

// ---------- 图例 ----------
$<HTMLElement>('#lg-regions').innerHTML = REGIONS.map((r) => `<li><i class="pt mid" style="background:${REGION_COLOR[r]}"></i>${esc(r)}</li>`).join('');
$<HTMLElement>('#lg-note').innerHTML = `<span class="credit-3d">地形高度放大 ${EXAGGERATION} 倍；</span>S 级、A 级的名字一直显示，放大后显示全部`;
// 地图区域矮的时候图例先收起来，免得挡住晋南
if (wrap.clientHeight < 700) $<HTMLDetailsElement>('#legend').open = false;

// ---------- 从别的页面带“#单位 id”进来（如建筑页的“附近”），直接打开它的名片 ----------
function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (byId.has(id)) select(id);
}
openFromHash();
window.addEventListener('hashchange', openFromHash);
