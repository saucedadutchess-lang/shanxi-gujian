import { defineConfig } from 'vite';

// base 用相对路径，这样部署在 GitHub Pages 的子路径下也能正常加载
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      // 多页：屋顶变形器和地图各一页
      input: {
        index: 'index.html',
        map: 'map.html',
        nanchan: 'nanchan.html',
      },
    },
  },
});
