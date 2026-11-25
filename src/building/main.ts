// 建筑页：一座 S 级建筑一页，内容在 data/buildings/<id>.json，页面用 building.html?id=<id> 打开。
// 顺序按 CLAUDE.md：名片三句话、时间轴、故事、三把钥匙（认形制、读等级、拆结构）、到现场必看、实用信息。
// 每条文字都带类型和出处，出处缺了 scripts/check-data.mjs 让构建失败。
import '../style.css';
import '../map/map.css';
import './building.css';
import { sources, units, type Source, type Unit } from '../map/data';
import { galleryBlock, openPhoto, wireGallery } from '../map/photos';
import { renderThumb, thumbFor } from '../map/thumbs';
import { hasPlan, planSvg, type GridSpec } from './plan';

type Kind = '史料记载' | '民间传说' | '学界推断';
interface Item {
  text: string;
  kind: Kind;
  src: string[];
  where: string;
}
interface Page {
  id: string;
  unitId: string;
  buildingId: string;
  name: string;
  place: string;
  model?: string;
  /** 没有模型时，到现场必看的方位图按这里的实测柱网画 */
  plan?: GridSpec & Item;
  /** 一页讲几座殿时，每座一张方位图；看点用 hall 指明在第几张（从 0 数） */
  plans?: (GridSpec & Item & { title: string })[];
  review: string;
  timeline: (Item & { date: string })[];
  stories: { title: string; paras: Item[] }[];
  keys: {
    form?: { text: string; facts: Item[] };
    grade?: {
      text: string;
      rule: Item;
      with: string;
      rows: { label: string; a: string; b: string; src: string[]; kind: Kind; where?: string }[];
    };
    structure?: { text: string; facts?: Item[]; pending?: string };
  };
  onsite?: { note: string; items: (Item & { n: number; title: string; at?: [number, number]; hall?: number; photo?: string })[] };
  practical: { address?: Item; pending?: string };
}

const REPO = 'https://github.com/saucedadutchess-lang/shanxi-gujian';
const pages = Object.values(import.meta.glob<Page>('../../data/buildings/*.json', { eager: true, import: 'default' }));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const root = document.querySelector<HTMLElement>('#page')!;

const id = new URLSearchParams(location.search).get('id') ?? '';
const page = pages.find((p) => p.id === id);
if (!page) {
  root.innerHTML = `<section class="bp-missing"><h1>没有这座建筑的页面</h1><p>已经写好的：${pages
    .map((p) => `<a href="?id=${esc(p.id)}">${esc(p.name)}</a>`)
    .join('、')}</p></section>`;
} else render(page);

function render(p: Page) {
  const unit = units.find((u) => u.id === p.unitId)!;
  const card = unit.curated!.card!;
  const building = unit.curated!.buildings!.find((b) => b.id === p.buildingId)!;
  document.title = `${p.name}｜观晋`;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('.site-nav a'))
    if (a.search === `?id=${p.id}`) a.setAttribute('aria-current', 'page');

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

  const sections: [string, string][] = [];
  const add = (sid: string, title: string, html: string) => {
    sections.push([sid, title]);
    return `<section class="bp-sec" id="${sid}"><h2>${esc(title)}</h2>${html}</section>`;
  };

  // ---------- 名片 ----------
  const tier = unit.curated?.tier ? `<span class="bp-tier">${esc(unit.curated.tier)} 级</span>` : '';
  const hero = `<header class="bp-hero" id="card">
    <div class="bp-hero-text">
      <p class="bp-kicker">${esc(p.place)} · ${esc(unit.name)} · 第${esc(String(unit.record.batch))}批国保 ${tier}</p>
      <h1>${esc(p.name)}</h1>
      <p class="bp-sub">${esc(building.year?.label ?? '')}${building.year?.check ? `（${esc(building.year.check)}）` : ''}${building.form ? ' · ' + esc(building.form.value.join('、')) : ''}</p>
      <dl class="bp-three">
        ${(
          [
            ['是什么', card.what],
            ['特点', card.feature],
            ['价值', card.value],
          ] as const
        )
          .map(([k, f]) => `<div><dt>${k}</dt><dd><p>${esc(f.text)}</p>${meta(f)}</dd></div>`)
          .join('')}
      </dl>
      <p class="bp-review">${esc(p.review)}<a href="#errata">我发现了错误</a></p>
    </div>
    <div class="bp-hero-photo">${galleryBlock(unit.id)}</div>
  </header>`;

  // ---------- 时间轴 ----------
  const timeline = add(
    'timeline',
    '时间轴',
    `<ol class="bp-tl">${p.timeline
      .map((t) => `<li data-kind="${esc(t.kind)}"><time>${esc(t.date)}</time><div><p>${esc(t.text)}</p>${meta(t)}</div></li>`)
      .join('')}</ol>`,
  );

  // ---------- 故事 ----------
  const stories = add(
    'stories',
    '故事与典故',
    `<p class="bp-legend">每段末尾标明是<span class="kind" data-kind="史料记载">史料记载</span>、<span class="kind" data-kind="民间传说">民间传说</span>还是<span class="kind" data-kind="学界推断">学界推断</span>（研究者的推测或假说）。</p>
    <div class="bp-stories">${p.stories
      .map((s) => `<article><h3>${esc(s.title)}</h3>${s.paras.map((x) => `<p>${esc(x.text)}${meta(x)}</p>`).join('')}</article>`)
      .join('')}</div>`,
  );

  // ---------- 三把钥匙 ----------
  const k = p.keys;
  const thumb = thumbFor(unit);
  const formKey = k.form
    ? `<div class="bp-key" id="key-form"><h3><span>一</span>认形制</h3>
      <div class="bp-form">
        ${thumb ? `<figure><img data-thumb alt="${esc(thumb.caption)}" /><figcaption><span class="tag">示意</span>${esc(thumb.caption)}</figcaption></figure>` : ''}
        <div><p class="bp-lead">${esc(k.form.text)}</p>${k.form.facts.map((x) => `<p>${esc(x.text)}${meta(x)}</p>`).join('')}
        <p><a class="bp-go" href="./index.html">到屋顶变形器里拖一拖：庑殿、歇山、悬山怎么互相变过去 →</a></p></div>
      </div></div>`
    : '';
  const g = k.grade;
  const gradeKey = g
    ? `<div class="bp-key" id="key-grade"><h3><span>二</span>读等级</h3>
      <p class="bp-lead">${esc(g.text)}</p>
      <p>${esc(g.rule.text)}${meta(g.rule)}</p>
      <table class="bp-grade"><thead><tr><th></th><th>${esc(p.name)}</th><th>${esc(g.with)}</th><th>出处</th></tr></thead>
      <tbody>${g.rows
        .map(
          (r) =>
            `<tr><th>${esc(r.label)}</th><td>${esc(r.a)}</td><td>${esc(r.b)}</td><td>${meta(r)}</td></tr>`,
        )
        .join('')}</tbody></table></div>`
    : '';
  const modelPage = p.model ? `./${p.model}.html` : null;
  const structKey = k.structure
    ? `<div class="bp-key" id="key-structure"><h3><span>三</span>拆结构</h3>
      <p class="bp-lead">${esc(k.structure.text)}</p>
      ${(k.structure.facts ?? []).map((x) => `<p>${esc(x.text)}${meta(x)}</p>`).join('')}
      ${
        modelPage
          ? `<div class="bp-model" id="model-box"><button type="button" class="bp-model-open">在这里打开 3D 模型<small>要读入不少贴图，比较占内存，用完可以刷新页面</small></button></div>
             <p class="bp-go-row"><a class="bp-go" href="${modelPage}">在新页面全屏打开 →</a></p>`
          : `<p class="todo">${esc(k.structure.pending ?? '3D 模型还在做，做好后放在这里。')}</p>`
      }</div>`
    : '';
  const keys = add('keys', '三把钥匙', `<p class="bp-go-row"><a class="bp-go" href="./intro.html">第一次看？先读古建入门：三把钥匙各是什么、怎么用 →</a></p>` + formKey + gradeKey + structKey);

  // ---------- 到现场必看 ----------
  const os = p.onsite;
  const planned = !!p.plans || hasPlan(p.model, p.plan);
  const markersOf = (hall?: number) => (os?.items ?? []).flatMap((o) => (o.at && (hall === undefined || (o.hall ?? 0) === hall) ? [{ n: o.n, at: o.at, title: o.title }] : []));
  const planHtml = () =>
    p.plans
      ? p.plans.map((s, i) => `<h4>${esc(s.title)}</h4>${planSvg(undefined, markersOf(i), s)}<p class="bp-plan-src">${esc(s.text)}${meta(s)}</p>`).join('')
      : planSvg(p.model, markersOf(), p.plan);
  const onsite = os
    ? add(
        'onsite',
        '到现场必看',
        `<div class="bp-onsite"${planned ? '' : ' style="grid-template-columns:minmax(0,1fr)"'}>
        ${planned ? `<figure class="bp-plan">${planHtml()}<figcaption><span class="tag">示意</span>${esc(os.note)}${p.plan ? meta(p.plan) : ''}</figcaption></figure>` : ''}
        <ol class="bp-spots">${os.items
          .map(
            (o) => `<li data-n="${o.n}" id="spot-${o.n}"><b class="n">${o.n}</b><div><h3>${esc(o.title)}</h3><p>${esc(o.text)}</p>${meta(o)}</div>${
              o.photo
                ? `<button type="button" class="bp-spot-photo" data-photo="${esc(o.photo)}" title="看照片"><img loading="lazy" src="${import.meta.env.BASE_URL}photos/${esc(o.photo.replace(/\.jpg$/, '-s.jpg'))}" alt="" /></button>`
                : ''
            }</li>`,
          )
          .join('')}</ol></div>`,
      )
    : '';

  // ---------- 实用信息 ----------
  const near = nearby(unit, 8, 60);
  const practical = add(
    'practical',
    '实用信息',
    `<div class="bp-practical">
      <div>
        ${p.practical.address ? `<h3>地址</h3><p>${esc(p.practical.address.text)}${meta(p.practical.address)}</p>` : ''}
        <h3>开放时间、门票、交通</h3><p class="todo">${esc(p.practical.pending ?? '待核实。')}</p>
      </div>
      <div>
        <h3>附近的国保</h3>
        ${
          near.length
            ? `<ol class="bp-near">${near
                .map(
                  ({ u, km }) =>
                    `<li><a href="./map.html#${esc(u.id)}">${esc(u.name)}</a>${u.curated?.tier || u.curated?.suggested ? `<span class="bp-tier sm">${esc((u.curated.tier ?? u.curated.suggested) + (u.curated.tier ? '' : '（建议）'))}</span>` : ''}<span class="bp-near-meta">${esc(u.record.era)} · ${esc(u.record.county)} · ${km.toFixed(0)} 公里</span></li>`,
                )
                .join('')}</ol>
              <p class="bp-note">直线距离，按 Wikidata 坐标算，不是路程。点名字到地图上看名片。</p>`
            : '<p class="todo">60 公里内没有别的国保。</p>'
        }
      </div>
    </div>`,
  );

  // ---------- 出处、勘误 ----------
  const issue = `${REPO}/issues/new?title=${encodeURIComponent(`勘误：${p.name}`)}&body=${encodeURIComponent(
    `页面：${p.name}（building.html?id=${p.id}）\n\n哪一条有问题：\n\n应该是：\n\n依据（书名、页码或链接）：\n`,
  )}`;
  const body = timeline + stories + keys + onsite + practical;
  const biblio = add(
    'sources',
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
      <p>${esc(p.review)}发现年代、尺寸、说法有错，或者有更好的出处，请<a href="${esc(issue)}" target="_blank" rel="noopener">在 GitHub 上提一条勘误</a>（需要 GitHub 账号），写明哪一条、应该是什么、依据是什么。</p></div>`,
  );

  const toc = `<nav class="bp-toc" aria-label="本页目录"><a href="#card">名片</a>${sections
    .map(([sid, t]) => `<a href="#${sid}">${esc(t)}</a>`)
    .join('')}</nav>`;
  root.innerHTML = `${hero}<div class="bp-body">${toc}<div class="bp-main">${body}${biblio}</div></div>`;

  wireGallery(root);
  wire(p, unit, thumb?.state);
}

/** 直线距离最近的几处国保 */
function nearby(u: Unit, n: number, maxKm: number) {
  if (!u.location) return [];
  const { lat, lng } = u.location;
  const rad = Math.PI / 180;
  const dist = (b: Unit) => {
    const dLat = (b.location!.lat - lat) * rad;
    const dLng = (b.location!.lng - lng) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(b.location!.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
  };
  return units
    .filter((b) => b.id !== u.id && b.location)
    .map((b) => ({ u: b, km: dist(b) }))
    .filter((x) => x.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

function wire(p: Page, unit: Unit, thumbState: Parameters<typeof renderThumb>[0] | undefined) {
  // 认形制的示意小图
  const img = root.querySelector<HTMLImageElement>('img[data-thumb]');
  if (img && thumbState) renderThumb(thumbState).then((url) => (img.src = url));

  // 拆结构：点了才读模型（另一个 WebGL 页面，很占内存）
  const box = root.querySelector<HTMLElement>('#model-box');
  box?.querySelector('button')?.addEventListener('click', () => {
    box.classList.add('open');
    box.innerHTML = `<iframe src="./${p.model}.html?embed" title="${esc(p.name)}三维模型" loading="eager"></iframe>`;
  });

  // 看点照片
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-photo]')) b.addEventListener('click', () => openPhoto(unit.id, b.dataset.photo!));

  // 方位图标记和看点列表互相指
  const marks = new Map([...root.querySelectorAll<SVGGElement>('.mk')].map((m) => [m.dataset.n!, m]));
  const spots = new Map([...root.querySelectorAll<HTMLLIElement>('.bp-spots li')].map((li) => [li.dataset.n!, li]));
  const light = (n: string | null) => {
    for (const [k, m] of marks) m.classList.toggle('on', k === n);
    for (const [k, li] of spots) li.classList.toggle('on', k === n);
  };
  for (const [n, li] of spots) {
    li.addEventListener('mouseenter', () => light(n));
    li.addEventListener('mouseleave', () => light(null));
  }
  for (const [n, m] of marks) {
    const go = () => {
      light(n);
      spots.get(n)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    m.addEventListener('mouseenter', () => light(n));
    m.addEventListener('mouseleave', () => light(null));
    m.addEventListener('click', go);
    m.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
  }

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
}
