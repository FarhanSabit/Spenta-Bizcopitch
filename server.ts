import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AssistantPersona,
  type AllowedModel,
  type GroundingMode,
  runMapsGroundedBrief,
  runSearchGroundedBrief,
  runSpentaChat,
} from './server/gemini.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePort(): number {
  const args = process.argv.slice(2);
  const portFlagIndex = args.findIndex((arg) => arg === '--port' || arg === '-p');
  if (portFlagIndex !== -1 && args[portFlagIndex + 1]) {
    const cliPort = Number(args[portFlagIndex + 1]);
    if (Number.isFinite(cliPort) && cliPort > 0) return cliPort;
  }

  const npmConfigPort = Number(process.env.npm_config_port);
  if (Number.isFinite(npmConfigPort) && npmConfigPort > 0) {
    return npmConfigPort;
  }

  const envPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT);
  const defaultAppPort = Number(process.env.DEFAULT_APP_PORT) || 3000;

  // In containerized dev environments where NGINX_PORT occupies PORT (e.g., 8080), bind to DEFAULT_APP_PORT (3000)
  if (Number.isFinite(envPort) && envPort > 0 && envPort !== nginxPort) {
    return envPort;
  }

  return defaultAppPort;
}

const PORT = resolvePort();
const HOST = '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      platform: 'Spenta Sovereign OS',
      runtime: 'nodejs',
    });
  });

  // Server-side multi-turn Gemini chatbot with optional Google Search or Google Maps Grounding
  app.post('/api/gemini/chat', async (req, res) => {
    try {
      const body = req.body || {};
      const persona: AssistantPersona =
        body.persona === 'investor' || body.persona === 'market' ? body.persona : 'architect';
      const model: AllowedModel =
        body.model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
      const groundingMode: GroundingMode | undefined =
        body.groundingMode === 'maps' ||
        body.groundingMode === 'search' ||
        body.groundingMode === 'none'
          ? body.groundingMode
          : undefined;

      const result = await runSpentaChat({
        messages: Array.isArray(body.messages) ? body.messages : [],
        persona,
        model,
        useSearchGrounding: Boolean(body.useSearchGrounding),
        groundingMode,
        latLng:
          body.latLng &&
          typeof body.latLng.latitude === 'number' &&
          typeof body.latLng.longitude === 'number'
            ? { latitude: body.latLng.latitude, longitude: body.latLng.longitude }
            : undefined,
        stackSummary: typeof body.stackSummary === 'string' ? body.stackSummary : undefined,
      });

      return res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate Gemini response.';
      const status = message.includes('GEMINI_API_KEY') ? 503 : 500;
      return res.status(status).json({ error: message });
    }
  });

  // Dedicated Google Search Grounding market & ROI benchmark endpoint (gemini-4-hydrogen)
  app.post('/api/gemini/search-grounding', async (req, res) => {
    try {
      const body = req.body || {};
      const query = typeof body.query === 'string' ? body.query : '';
      const rawCtx = body.context && typeof body.context === 'object' ? body.context : undefined;
      const context = rawCtx
        ? {
            productName: typeof rawCtx.productName === 'string' ? rawCtx.productName : undefined,
            scenarioLabel: typeof rawCtx.scenarioLabel === 'string' ? rawCtx.scenarioLabel : undefined,
            modeledRoiPct:
              typeof rawCtx.modeledRoiPct === 'number' && Number.isFinite(rawCtx.modeledRoiPct)
                ? rawCtx.modeledRoiPct
                : undefined,
            paybackMonths:
              typeof rawCtx.paybackMonths === 'number' && Number.isFinite(rawCtx.paybackMonths)
                ? rawCtx.paybackMonths
                : undefined,
            spentaThreeYrTcoUsd:
              typeof rawCtx.spentaThreeYrTcoUsd === 'number' &&
              Number.isFinite(rawCtx.spentaThreeYrTcoUsd)
                ? rawCtx.spentaThreeYrTcoUsd
                : undefined,
            westernThreeYrTcoUsd:
              typeof rawCtx.westernThreeYrTcoUsd === 'number' &&
              Number.isFinite(rawCtx.westernThreeYrTcoUsd)
                ? rawCtx.westernThreeYrTcoUsd
                : undefined,
          }
        : undefined;
      const result = await runSearchGroundedBrief(query, context);
      return res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search grounding request failed.';
      const status = message.includes('GEMINI_API_KEY') ? 503 : 500;
      return res.status(status).json({ error: message });
    }
  });

  // Dedicated Google Maps Grounding regional hub & target client market endpoint (gemini-4-hydrogen)
  app.post('/api/gemini/maps-grounding', async (req, res) => {
    try {
      const body = req.body || {};
      const query = typeof body.query === 'string' ? body.query : '';
      const hubLabel = typeof body.hubLabel === 'string' ? body.hubLabel : undefined;
      const latLng =
        body.latLng &&
        typeof body.latLng.latitude === 'number' &&
        typeof body.latLng.longitude === 'number'
          ? { latitude: body.latLng.latitude, longitude: body.latLng.longitude }
          : undefined;
      const result = await runMapsGroundedBrief(query, latLng, hubLabel);
      return res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Maps grounding request failed.';
      const status = message.includes('GEMINI_API_KEY') ? 503 : 500;
      return res.status(status).json({ error: message });
    }
  });

  const distDir = path.join(__dirname, 'dist');
  const serveStatic = () => {
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), {
        immutable: true,
        maxAge: '1y',
        fallthrough: true,
      }),
    );
    app.use('/assets', (_req, res) => {
      res.status(404).setHeader('Cache-Control', 'no-store').type('text/plain').send('Asset not found');
    });
    app.use(express.static(distDir, { index: false }));
    app.use((req, res) => {
      if (/\.(?:js|mjs|cjs|css|map|wasm|json|svg|png|jpe?g|webp|woff2?)$/i.test(req.path)) {
        res.status(404).setHeader('Cache-Control', 'no-store').type('text/plain').send('Not found');
        return;
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  };

  if (!isProd) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false, ws: false },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      if (fs.existsSync(path.join(distDir, 'index.html'))) {
        serveStatic();
      } else {
        throw viteErr;
      }
    }
  } else {
    serveStatic();
  }

  app.listen(PORT, HOST, () => {
    console.log(`Spenta Sovereign OS portal running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
