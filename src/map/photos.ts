// 实拍照片：名片里的轮播和全屏看图。
// 照片来自维基共享资源，授权允许转载（公有领域、CC0、CC BY、CC BY-SA），缩小后存在 public/photos/。
// CC BY / BY-SA 要求署名：名片里不占位置，全屏看图时在说明里小字写。清单和授权由 scripts/check-data.mjs 检查。
import photosJson from '../../data/photos.json';

export interface Photo {
  /** public/photos/ 下的路径（大图）；小图在同名加 -s */
  file: string;
  w: number;
  h: number;
  /** 拍的是什么 */
  caption: string;
  /** 类别：全景、立面、屋顶、斗拱、梁架、彩塑、壁画、题记、细部、环境、历史（老照片、方志插图） */
  kind: string;
  /** 拍摄年份（照片说明的是那一年的现状） */
  date?: string;
  author: string;
  license: string;
  /** 维基共享资源上的原图页面 */
  source: string;
}

const BASE = import.meta.env.BASE_URL + 'photos/';
const data = (photosJson as unknown as { units: Record<string, Photo[]> }).units;
export const photosOf = (unitId: string): Photo[] => data[unitId] ?? [];
const small = (f: string) => f.replace(/\.jpg$/, '-s.jpg');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 名片里的轮播：一张大图、左右箭头、一排小图 */
export function galleryBlock(unitId: string) {
  const list = photosOf(unitId);
  if (!list.length) return '';
  return `<figure class="gallery" data-gallery="${esc(unitId)}">
    <div class="g-main">
      <button type="button" class="g-open" title="全屏看图"><img alt="" /></button>
      <button type="button" class="g-prev" aria-label="上一张">‹</button>
      <button type="button" class="g-next" aria-label="下一张">›</button>
      <span class="g-count"></span>
    </div>
    <figcaption><span class="tag real">实拍</span><span class="g-cap"></span></figcaption>
    <div class="g-strip">${list
      .map((p, i) => `<button type="button" data-i="${i}" title="${esc(p.caption)}"><img loading="lazy" src="${BASE + small(p.file)}" alt="${esc(p.caption)}" /></button>`)
      .join('')}</div>
  </figure>`;
}

/** 给名片里的轮播接上事件 */
export function wireGallery(root: HTMLElement) {
  const found = root.querySelector<HTMLElement>('[data-gallery]');
  if (!found) return;
  const fig = found;
  const list = photosOf(fig.dataset.gallery!);
  const img = fig.querySelector<HTMLImageElement>('.g-open img')!;
  const strip = [...fig.querySelectorAll<HTMLButtonElement>('.g-strip button')];
  let i = 0;
  function show(n: number) {
    i = (n + list.length) % list.length;
    const p = list[i];
    img.src = BASE + p.file;
    img.alt = p.caption;
    fig.querySelector('.g-cap')!.textContent = p.caption + (p.date ? `（${p.date}）` : '');
    fig.querySelector('.g-count')!.textContent = `${i + 1} / ${list.length}`;
    strip.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
    // 只横向滚动小图条，不用 scrollIntoView：窗口矮时它会把整页往下拽
    const bar = strip[i].closest<HTMLElement>('.g-strip');
    if (bar) {
      const r = strip[i].getBoundingClientRect(), c = bar.getBoundingClientRect();
      if (r.left < c.left) bar.scrollLeft -= c.left - r.left;
      else if (r.right > c.right) bar.scrollLeft += r.right - c.right;
    }
  }
  fig.querySelector('.g-prev')!.addEventListener('click', () => show(i - 1));
  fig.querySelector('.g-next')!.addEventListener('click', () => show(i + 1));
  for (const b of strip) b.addEventListener('click', () => show(Number(b.dataset.i)));
  fig.querySelector('.g-open')!.addEventListener('click', () => openLightbox(list, i, show));
  show(0);
}

// ---------- 全屏看图 ----------
let box: HTMLElement | null = null;
function openLightbox(list: Photo[], start: number, onIndex: (i: number) => void) {
  box?.remove();
  const el = document.createElement('div');
  box = el;
  el.className = 'lightbox';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '看照片');
  el.innerHTML = `
    <img alt="" />
    <button type="button" class="lb-prev" aria-label="上一张">‹</button>
    <button type="button" class="lb-next" aria-label="下一张">›</button>
    <button type="button" class="lb-close" aria-label="关闭（Esc）">×</button>
    <div class="lb-cap"><p class="lb-title"></p><p class="lb-credit"></p></div>`;
  document.body.append(el);
  const img = el.querySelector('img')!;
  let i = start;
  function show(n: number) {
    i = (n + list.length) % list.length;
    const p = list[i];
    img.src = BASE + p.file;
    img.alt = p.caption;
    el.querySelector('.lb-title')!.textContent = `${i + 1} / ${list.length}　${p.caption}${p.date ? `（${p.date}）` : ''}`;
    el.querySelector('.lb-credit')!.innerHTML = `${esc(p.author)} · ${esc(p.license)} · <a href="${esc(p.source)}" target="_blank" rel="noopener">维基共享资源原图</a>`;
    onIndex(i);
    // 预读下一张
    const next = list[(i + 1) % list.length];
    new Image().src = BASE + next.file;
  }
  function close() {
    el.remove();
    window.removeEventListener('keydown', key, true);
    if (box === el) box = null;
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(i - 1);
    else if (e.key === 'ArrowRight') show(i + 1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
  window.addEventListener('keydown', key, true);
  el.querySelector('.lb-prev')!.addEventListener('click', () => show(i - 1));
  el.querySelector('.lb-next')!.addEventListener('click', () => show(i + 1));
  el.querySelector('.lb-close')!.addEventListener('click', close);
  // 点黑底关闭；左右滑动换张
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  let sx: number | null = null;
  img.addEventListener('pointerdown', (e) => (sx = e.clientX));
  img.addEventListener('pointerup', (e) => {
    if (sx !== null && Math.abs(e.clientX - sx) > 40) show(e.clientX < sx ? i + 1 : i - 1);
    sx = null;
  });
  img.draggable = false;
  show(i);
  el.querySelector<HTMLButtonElement>('.lb-close')!.focus();
}

/** 直接打开某张照片的全屏看图（建筑页的看点小图用），可以左右翻同一单位的其他照片 */
export function openPhoto(unitId: string, file: string) {
  const list = photosOf(unitId);
  const i = list.findIndex((p) => p.file === file);
  if (i >= 0) openLightbox(list, i, () => {});
}
