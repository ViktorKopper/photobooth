import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// GitHub Pages works best with relative asset paths unless you know your final repo name.
// If you deploy to https://USERNAME.github.io/REPO/, './' avoids broken /assets paths.
export default defineConfig({
  base: './',
  plugins: [basicSsl()],
  server: {
    https: true
  },
  preview: {
    https: true
  }
});
