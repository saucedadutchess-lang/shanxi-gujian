// 古建入门：三把钥匙（认形制、读等级、拆结构），文字在 data/intro.json，每条带类型和出处。
// 交互都复用现成的：屋顶变形器嵌 index.html?embed，两座模型嵌 nanchan.html / foguang.html 的 ?bare 模式，
// 用 postMessage 控制拆开和高亮（指令见 src/model/viewer.ts）。
import '../style.css';
import '../map/map.css';
import '../building/building.css';
import './intro.css';
import intro from '../../data/intro.json';
import nanchanPage from '../../data/buildings/nanchan.json';
import foguangPage from '../../data/buildings/foguang.json';
import nanchanModel from '../../data/models/nanchan.json';
import foguangModel from '../../data/models/foguang.json';
import { sources, units, type Source, type Unit } from '../map/data';
import { renderThumb } from '../map/thumbs';
import type { MorphState } from '../roof/params';

interface Item {
  text: string;
  kind: string;
  src: string[];
  where: string;
  check?: string;
}
interface ModelPart {
  name: string;
  layer: string;
  src: string[];
  desc: string;
}

const REPO = 'https://github.com/saucedadutchess-lang/shanxi-gujian';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const root = document.querySelector<HTMLElement>('#page')!;
const NC = nanchanModel.parts as Record<string, ModelPart>;
const FG = foguangModel.parts as Record<string, ModelPart>;

// ---------- 出处：正文里写短名，页尾列全 ----------
const used: string[] = [];
const short = (sid: string) => {
  if (!used.includes(sid)) used.push(sid);
  const s = sources[sid];
  if (!s.author) return `《${s.title}》`;
  const names = s.author.split('、');
  return `${names[0]}${names.length > 1 ? '等' : ''}${s.date ? ' ' + s.date : ''}`;
};
const refs = (src: string[], where?: string) =>
  `${src.map((s) => `<a href="#src-${esc(s)}">${esc(short(s))}</a>`).join('；')}${where ? `，${esc(where)}` : ''}`;
const meta = (f: { kind?: string; src: string[]; where?: string; check?: string }) =>
  `<span class="fact-meta">${f.kind ? `<span class="kind" data-kind="${esc(f.kind)}">${esc(f.kind)}</span>` : ''}${refs(f.src, f.where)}${
    f.check ? `<span class="check">${esc(f.check)}</span>` : ''
  }</span>`;
const fact = (f: Item) => `<p>${esc(f.text)}${meta(f)}</p>`;
const onsite = (t: string) => `<p class="in-onsite"><b>到现场</b>${esc(t)}</p>`;

const sections: [string, string][] = [];
const add = (sid: string, n: string, title: string, html: string) => {
  sections.push([sid, title]);
  return `<section class="bp-sec in-sec" id="${sid}"><h2>${n ? `<span class="in-n">${n}</span>` : ''}${esc(title)}</h2>${html}</section>`;
};

// ---------- 一、认形制 ----------
const F = intro.form;
/** 每种形制在山西的实例：从人工整理过的单位里挑，S 级在前 */
function examples(form: string) {
  const rank = (u: Unit) => ({ S: 0, A: 1, B: 2 })[u.curated?.tier ?? u.curated?.suggested ?? 'B'] ?? 3;
  return units
    .filter((u) => u.curated?.buildings?.some((b) => b.form?.value.includes(form)))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 4)
    .map((u) => {
      // 写到具体哪座殿：单位名去掉括号里的说明，单体名已经在单位名里的不重复
      const b = u.curated!.buildings!.find((x) => x.form?.value.includes(form))!;
      const unitName = u.name.replace(/（.*）/, '');
      const bName = b.name.replace(/（.*）/, '');
      return { id: u.id, label: unitName.endsWith(bName) ? unitName : `${unitName}${bName}` };
    });
}
const SHAPE_STATE: Record<string, Partial<MorphState>> = {
  庑殿: { t: 0, g: 0 },
  歇山: { t: 0.45, g: 0 },
  悬山: { t: 1, g: 0 },
  硬山: { t: 1, g: 1 },
  攒尖: { t: 0, g: 0, zj: 1 },
  重檐: { t: 0.45, g: 0, dbl: 1 },
};
const shapes = F.shapes
  .map((s) => {
    const ex = examples(s.form);
    return `<li>
      <img data-shape="${esc(s.form)}" alt="${esc(s.form)}顶示意" />
      <h4>${esc(s.form)}</h4>
      <p>${esc(s.text)}</p>
      <p class="in-ex">${ex.length ? `山西：${ex.map((u) => `<a href="./map.html#${esc(u.id)}">${esc(u.label)}</a>`).join('、')}` : '<span class="todo">还没有整理山西的实例</span>'}</p>
    </li>`;
  })
  .join('');
const formSec = add(
  'form',
  '一',
  '认形制：先看屋顶',
  `<p class="bp-lead">${esc(F.lead)}</p>
  <ul class="in-shapes">${shapes}</ul>
  <p class="in-small"><span class="tag">示意</span>小图用屋顶变形器的示意殿堂画，不是哪一座建筑。${esc(F.shapesSrc.text)}${meta(F.shapesSrc)}</p>
  <h3>动手拖一拖</h3>
  <p>前四种其实是连续变过去的：拖“基本形”滑块，看山面从多高开始变成三角形。再拖“时代”滑块看屋面和斗拱怎么变。</p>
  <div class="in-frame in-roof"><iframe src="./index.html?embed" title="屋顶变形器" loading="lazy"></iframe></div>
  <h3>屋面陡不陡，斗拱大不大</h3>
  <p class="bp-lead">${esc(F.era.lead)}</p>
  ${F.era.facts.map(fact).join('')}
  ${onsite(F.onsite)}`,
);

// ---------- 二、读等级 ----------
const G = intro.grade;
const NG = nanchanPage.keys.grade;
const compareRows = NG.rows
  .map((r) => `<tr><th>${esc(r.label)}</th><td>${esc(r.a)}</td><td>${esc(r.b)}</td><td>${meta(r as unknown as Item)}</td></tr>`)
  .join('');
const gradeSec = add(
  'grade',
  '二',
  '读等级：这座房子地位多高',
  `<p class="bp-lead">${esc(G.lead)}</p>
  <h3>材：一切尺寸的基本单位</h3>
  ${fact(G.rule)}
  <table class="bp-grade in-tiers"><thead><tr><th>材等</th><th>用在什么房子上</th></tr></thead>
  <tbody>${G.tiers.rows.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</tbody></table>
  <p class="in-small">${esc(G.tiers.text)}${meta(G.tiers)}</p>
  <h3>斗拱出几跳</h3>
  ${fact(G.puzuo)}
  <div class="in-count">
    <div class="in-frame in-model" id="count-box"><button type="button" class="bp-model-open" data-open="foguang">打开佛光寺东大殿模型<small>要读入不少贴图，比较占内存</small></button></div>
    <div class="in-count-side">
      <p>${esc(G.count.text)}</p>
      <div class="in-btns" role="group" aria-label="高亮构件">${G.count.parts
        .map(([k, label]) => `<button type="button" data-part="${esc(k)}" disabled>${esc(label)}</button>`)
        .join('')}</div>
      <p class="in-part" id="count-part" aria-live="polite"></p>
    </div>
  </div>
  <h3>两座唐代殿放在一起</h3>
  <p>${esc(G.compare)}</p>
  <table class="bp-grade"><thead><tr><th></th><th>南禅寺大殿</th><th>${esc(NG.with)}</th><th>出处</th></tr></thead><tbody>${compareRows}</tbody></table>
  <p class="in-note">${esc(G.note)}</p>
  ${onsite(G.onsite)}`,
);

// ---------- 三、拆结构 ----------
const S = intro.structure;
const inner = NG.rows.find((r) => r.label === '殿内柱子')!;
const FS = foguangPage.keys.structure;
const structSec = add(
  'structure',
  '三',
  '拆结构：房子是怎么搭起来的',
  `<p class="bp-lead">${esc(S.lead)}</p>
  <p>${esc(S.how)}</p>
  <div class="in-struct">
    <div class="in-frame in-model" id="struct-box"><button type="button" class="bp-model-open" data-open="nanchan">打开南禅寺大殿模型<small>要读入不少贴图，比较占内存</small></button></div>
    <div class="in-struct-side">
      <div class="row"><label for="in-explode">拆开</label><output id="in-explode-out">合拢</output></div>
      <input type="range" id="in-explode" min="0" max="1" step="0.01" value="0" disabled />
      <ol class="in-layers">${S.layers
        .map(([layer, part]) => {
          const p = NC[part];
          return `<li><button type="button" data-layer="${esc(layer)}" data-part="${esc(part)}">${esc(layer)}</button>
            <div class="in-layer-desc"><p><b>${esc(p.name)}</b>：${esc(p.desc)}</p><span class="fact-meta">南禅寺模型参数表 · ${refs(p.src)}</span></div></li>`;
        })
        .join('')}</ol>
      <p class="in-part" id="struct-part" aria-live="polite"></p>
    </div>
  </div>
  <h3>殿里有没有柱子</h3>
  <p>${esc(S.contrast)}</p>
  <div class="in-two">
    <div><h4>南禅寺大殿</h4><p>殿里${esc(inner.a.replace(/^没有，/, '没有柱子，'))}：四椽栿从前檐一跨架到后檐，上面是平梁和大叉手。</p>${meta(inner as unknown as Item)}</div>
    <div><h4>佛光寺东大殿</h4><p>${esc(FS.text)}</p>${FS.facts.slice(1, 2).map(fact).join('')}</div>
  </div>
  ${onsite(S.onsite)}`,
);

// ---------- 试一试 ----------
const T = intro.tryit;
const trySec = add(
  'try',
  '',
  '试一试',
  `${fact(T)}<p><a class="bp-go" href="./building.html?id=nanchan">到南禅寺大殿的建筑页看三把钥匙怎么用 →</a>　<a class="bp-go" href="./building.html?id=foguang">佛光寺东大殿 →</a></p>`,
);

// ---------- 出处、勘误 ----------
const issue = `${REPO}/issues/new?title=${encodeURIComponent('勘误：古建入门')}&body=${encodeURIComponent(
  '页面：古建入门（intro.html）\n\n哪一条有问题：\n\n应该是：\n\n依据（书名、页码或链接）：\n',
)}`;
const body = formSec + gradeSec + structSec + trySec;
const biblio = add(
  'sources',
  '',
  '出处',
  `<ol class="bp-biblio">${used
    .map((sid) => {
      const s: Source = sources[sid];
      const title = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">《${esc(s.title)}》</a>` : `《${esc(s.title)}》`;
      return `<li id="src-${esc(sid)}">${s.author ? esc(s.author) + '，' : ''}${title}${s.publisher ? '，' + esc(s.publisher) : ''}${s.date && !s.publisher?.includes(s.date) ? '，' + esc(s.date) : ''}${
        s.note ? `<span class="bp-note">${esc(s.note)}</span>` : ''
      }</li>`;
    })
    .join('')}</ol>
  <div class="bp-errata" id="errata"><h3>我发现了错误</h3>
    <p>${esc(intro.review)}发现说法有错，或者有更好的出处，请<a href="${esc(issue)}" target="_blank" rel="noopener">在 GitHub 上提一条勘误</a>（需要 GitHub 账号），写明哪一条、应该是什么、依据是什么。</p></div>`,
);

const hero = `<header class="in-hero" id="top">
  <h1>古建入门</h1>
  <p class="bp-lead">${esc(intro.lead)}</p>
  <ol class="in-keys">
    <li><a href="#form"><b>一</b>认形制<small>什么顶，哪个时代</small></a></li>
    <li><a href="#grade"><b>二</b>读等级<small>开几间，用多大的材，出几跳</small></a></li>
    <li><a href="#structure"><b>三</b>拆结构<small>柱、斗拱、梁、槫、椽怎么叠起来</small></a></li>
  </ol>
  <p class="bp-review">${esc(intro.review)}<a href="#errata">我发现了错误</a></p>
</header>`;
const toc = `<nav class="bp-toc" aria-label="本页目录"><a href="#top">开头</a>${sections
  .map(([sid, t]) => `<a href="#${sid}">${esc(t.split('：')[0])}</a>`)
  .join('')}</nav>`;
root.innerHTML = `${hero}<div class="bp-body">${toc}<div class="bp-main">${body}${biblio}</div></div>`;

// ---------- 交互 ----------
// 形制小图：一张张排队画，共用一个离屏画布
(async () => {
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-shape]')) {
    const st: MorphState = { t: 0, g: 0, era: 0.4, dbl: 0, jp: 0, zj: 0, ...SHAPE_STATE[img.dataset.shape!] };
    img.src = await renderThumb(st);
  }
})();

/** 嵌进来的模型页：点了才读；读好后启用旁边的按钮 */
const frames: Record<string, HTMLIFrameElement | null> = { nanchan: null, foguang: null };
const send = (which: string, msg: Record<string, unknown>) => frames[which]?.contentWindow?.postMessage(msg, location.origin);
const ready = new Set<string>();
const NAMES: Record<string, string> = { nanchan: '南禅寺大殿', foguang: '佛光寺东大殿' };
for (const b of root.querySelectorAll<HTMLButtonElement>('[data-open]')) {
  b.addEventListener('click', () => {
    const which = b.dataset.open!;
    const box = b.parentElement!;
    box.classList.add('open');
    box.innerHTML = `<iframe src="./${which}.html?bare" title="${NAMES[which]}三维模型"></iframe>`;
    frames[which] = box.querySelector('iframe');
  });
}
const countBox = root.querySelector<HTMLElement>('#count-box')!;
const structBox = root.querySelector<HTMLElement>('#struct-box')!;
const explode = root.querySelector<HTMLInputElement>('#in-explode')!;
const explodeOut = root.querySelector<HTMLOutputElement>('#in-explode-out')!;
const countPart = root.querySelector<HTMLElement>('#count-part')!;
const structPart = root.querySelector<HTMLElement>('#struct-part')!;

window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  const which = Object.keys(frames).find((k) => frames[k]?.contentWindow === e.source);
  if (!which) return;
  const d = e.data as { type: string; part?: string | null; name?: string; layer?: string; desc?: string };
  if (d.type === 'model-ready' && !ready.has(which)) {
    ready.add(which);
    if (which === 'foguang') {
      for (const b of countBox.parentElement!.querySelectorAll<HTMLButtonElement>('[data-part]')) b.disabled = false;
      send('foguang', { cmd: 'view', view: 'eave' });
    } else {
      explode.disabled = false;
      // 读好之前点过的层、拖过的滑块，补发一次
      const cur = structBox.parentElement!.querySelector<HTMLButtonElement>('[data-layer][aria-pressed="true"]');
      send('nanchan', { cmd: 'layer', layer: cur?.dataset.layer ?? null });
      send('nanchan', { cmd: 'explode', k: Number(explode.value) });
    }
  }
  if (d.type === 'model-part') {
    const out = which === 'foguang' ? countPart : structPart;
    out.innerHTML = d.part ? `<b>${esc(d.name ?? '')}</b>（${esc(d.layer ?? '')}层）：${esc(d.desc ?? '')}` : '';
    if (which === 'nanchan') markLayer(d.layer ?? null);
  }
});

// 数出跳：高亮佛光寺的一类构件
for (const b of countBox.parentElement!.querySelectorAll<HTMLButtonElement>('[data-part]')) {
  b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    for (const o of countBox.parentElement!.querySelectorAll('[data-part]')) o.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-pressed', String(on));
    const part = on ? b.dataset.part! : null;
    send('foguang', { cmd: 'part', part });
    countPart.innerHTML = part ? `<b>${esc(FG[part].name)}</b>：${esc(FG[part].desc)}` : '';
  });
}

// 拆结构：点层名高亮那一层；没打开模型时先打开
function markLayer(layer: string | null) {
  for (const o of structBox.parentElement!.querySelectorAll<HTMLButtonElement>('[data-layer]')) {
    const on = o.dataset.layer === layer;
    o.setAttribute('aria-pressed', String(on));
    o.parentElement!.classList.toggle('on', on);
  }
}
for (const b of structBox.parentElement!.querySelectorAll<HTMLButtonElement>('[data-layer]')) {
  b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    const layer = on ? b.dataset.layer! : null;
    markLayer(layer);
    structPart.textContent = '';
    if (!frames.nanchan) structBox.querySelector<HTMLButtonElement>('[data-open]')?.click();
    send('nanchan', { cmd: 'layer', layer });
  });
}
explode.addEventListener('input', () => {
  const k = Number(explode.value);
  send('nanchan', { cmd: 'explode', k });
  explodeOut.textContent = k < 0.02 ? '合拢' : k > 0.98 ? '全部拆开' : '拆开中';
});

// 目录跟着滚动高亮
const links = new Map([...root.querySelectorAll<HTMLAnchorElement>('.bp-toc a')].map((a) => [a.hash.slice(1), a]));
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      for (const [k, a] of links) k === e.target.id ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current');
    }
  },
  { rootMargin: '-30% 0px -60% 0px' },
);
for (const k of links.keys()) {
  const el = document.getElementById(k);
  if (el) io.observe(el);
}
