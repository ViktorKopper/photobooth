import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// GitHub Pages works best with relative asset paths unless you know your final repo name.
// If you deploy to https://USERNAME.github.io/REPO/, './' avoids broken /assets paths.
export default defineConfig({
  base: './',
  plugins: [basicSsl()],
  build: {
    // Vendor code changes far less often than app code. Splitting it out
    // means editing the booth doesn't invalidate the cached Firebase and
    // QR chunks — a real saving for a PWA that gets reopened constantly.
    // Firestore lands in its own chunk that the entry point never
    // statically imports, so it only downloads once a booth is opened.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@firebase/firestore')) return 'firebase-firestore';
          if (id.includes('@firebase/auth')) return 'firebase-auth';
          if (id.includes('@firebase/storage')) return 'firebase-storage';
          if (id.includes('node_modules/qrcode')) return 'qrcode';
          return undefined;
        }
      }
    }
  },
  server: {
    https: true
  },
  preview: {
    https: true
  }
});
