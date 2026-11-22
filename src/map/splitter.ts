// 地图和详情栏之间的分隔线：拖动改宽度，双击恢复，键盘左右键也能调；宽度记在本机，下次打开还是那样。
const KEY = 'guanjin.map.panelWidth';
export const DEFAULT_WIDTH = 380;
const MIN = 300;
/** 地图至少留这么宽 */
const MAP_MIN = 0.38;

export function setupSplitter(main: HTMLElement, splitter: HTMLElement) {
  /** 想要的宽度；窗口太窄时实际宽度 width 会小一些，窗口放宽后回到想要的宽度 */
  let wanted = Number(localStorage.getItem(KEY)) || DEFAULT_WIDTH;
  let width = wanted;
  /** 点“放大”之前的宽度，再点一次回到这里 */
  let beforeWide: number | null = null;
  const listeners: (() => void)[] = [];

  const max = () => Math.max(MIN, main.clientWidth * (1 - MAP_MIN));
  function set(w: number, save = true) {
    width = Math.round(Math.min(max(), Math.max(MIN, w)));
    if (save) wanted = width;
    main.style.setProperty('--panel-w', `${width}px`);
    splitter.setAttribute('aria-valuenow', String(Math.round((width / main.clientWidth) * 100)));
    if (save) localStorage.setItem(KEY, String(width));
    for (const cb of listeners) cb();
  }
  splitter.setAttribute('aria-valuemin', String(Math.round((MIN / Math.max(1, main.clientWidth)) * 100)));
  splitter.setAttribute('aria-valuemax', String(Math.round((1 - MAP_MIN) * 100)));

  let drag: { x: number; w: number } | null = null;
  splitter.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = { x: e.clientX, w: width };
    splitter.setPointerCapture(e.pointerId);
    main.classList.add('resizing');
  });
  splitter.addEventListener('pointermove', (e) => {
    if (!drag) return;
    beforeWide = null;
    set(drag.w - (e.clientX - drag.x));
  });
  const end = () => {
    drag = null;
    main.classList.remove('resizing');
  };
  splitter.addEventListener('pointerup', end);
  splitter.addEventListener('pointercancel', end);
  splitter.addEventListener('dblclick', () => {
    beforeWide = null;
    set(DEFAULT_WIDTH);
    localStorage.removeItem(KEY);
  });
  splitter.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 80 : 24;
    const next: Record<string, number> = {
      ArrowLeft: width + step,
      ArrowRight: width - step,
      Home: max(),
      End: MIN,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    beforeWide = null;
    set(next[e.key]);
  });
  // 窗口变窄时，详情栏不能把地图挤得太小
  window.addEventListener('resize', () => set(beforeWide === null ? wanted : main.clientWidth * 0.55, false));
  set(wanted, false);

  return {
    /** 在“放大详情”（约一半宽）和原来的宽度之间切换，返回切换后是否放大 */
    toggleWide() {
      if (beforeWide === null) {
        beforeWide = width;
        set(Math.max(width, main.clientWidth * 0.55), false);
        return true;
      }
      const back = beforeWide;
      beforeWide = null;
      set(back, false);
      return false;
    },
    isWide: () => beforeWide !== null,
    onChange(cb: () => void) {
      listeners.push(cb);
    },
  };
}
