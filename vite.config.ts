import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function disableHmrWebSocketPlugin(): Plugin {
  let hmrDisabled = false;
  return {
    name: 'disable-hmr-websocket',
    apply: 'serve',
    enforce: 'post',
    configResolved(resolved) {
      hmrDisabled = resolved.server.hmr === false || resolved.server.ws === false;
    },
    transform(code, id) {
      if (hmrDisabled && id.replace(/\\/g, '/').includes('/vite/dist/client/client.mjs')) {
        return {
          code: code.replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR disabled: WebSocket connect suppressed */',
          ),
          map: null,
        };
      }
      return undefined;
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), disableHmrWebSocketPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // 3D Engine & Controls (Loaded on demand with 3D canvas tabs)
          if (id.includes('/three/addons/') || id.includes('/three/examples/')) {
            return 'vendor-three-addons';
          }
          if (id.includes('/three/')) {
            return 'vendor-three-core';
          }

          // Charts & Data Visualization (Split into recharts, d3/victory, and state management)
          if (id.includes('/recharts/')) {
            return 'vendor-recharts';
          }
          if (id.includes('/d3-') || id.includes('/victory-vendor/')) {
            return 'vendor-charts-d3';
          }
          if (
            id.includes('/@reduxjs/toolkit/') ||
            id.includes('/react-redux/') ||
            id.includes('/immer/') ||
            id.includes('/reselect/')
          ) {
            return 'vendor-charts-state';
          }

          // PDF Generation & Document Export (Granular split for print & export modules)
          if (id.includes('/jspdf/')) {
            return 'vendor-pdf-jspdf';
          }
          if (id.includes('/fflate/') || id.includes('/fast-png/')) {
            return 'vendor-pdf-compression';
          }
          if (id.includes('/html2canvas/')) {
            return 'vendor-pdf-html2canvas';
          }
          if (id.includes('/canvg/')) {
            return 'vendor-pdf-canvg';
          }
          if (id.includes('/dompurify/')) {
            return 'vendor-pdf-dompurify';
          }

          // Animations & Motion
          if (id.includes('/framer-motion/')) {
            return 'vendor-framer-motion';
          }
          if (id.includes('/gsap/')) {
            return 'vendor-gsap';
          }

          // Icons
          if (id.includes('/lucide-react/')) {
            return 'vendor-icons';
          }

          // React Core Framework
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }

          return undefined;
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    hmr: false,
    ws: false,
  },
});
