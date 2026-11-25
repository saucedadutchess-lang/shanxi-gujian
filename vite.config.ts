import { defineConfig } from 'vite';

// base 用相对路径，这样部署在 GitHub Pages 的子路径下也能正常加载
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      // 多页：屋顶变形器、地图、建筑页（?id= 选哪座）、南禅寺、佛光寺模型
      input: {
        index: 'index.html',
        map: 'map.html',
        nanchan: 'nanchan.html',
        foguang: 'foguang.html',
        shengmudian: 'shengmudian.html',
        muta: 'muta.html',
        building: 'building.html',
        intro: 'intro.html',
      },
    },
  },
});
