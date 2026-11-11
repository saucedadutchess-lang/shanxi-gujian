import { defineConfig } from 'vite';

// base 用相对路径，这样部署在 GitHub Pages 的子路径下也能正常加载
export default defineConfig({
  base: './',
});
