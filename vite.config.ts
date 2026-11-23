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
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/three/')) return 'vendor-three';
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'vendor-charts';
          if (id.includes('/jspdf/') || id.includes('/html2canvas/') || id.includes('/dompurify/')) {
            return 'vendor-pdf';
          }
          if (id.includes('/framer-motion/') || id.includes('/gsap/')) return 'vendor-motion';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
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
