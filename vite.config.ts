import { defineConfig } from 'vite';

// base './' : le build fonctionne aussi bien sur GitHub Pages (sous-dossier) qu'en local.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
});
