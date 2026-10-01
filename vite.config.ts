import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Serves /api/* in development with the exact handler Netlify runs in production
 * (server/router.ts), so there is no separate mock for local work.
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          const { handleApi } = (await server.ssrLoadModule('/server/router.ts')) as typeof import('./server/router');
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(key, value);
          }
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0;
          const response = await handleApi(
            new Request(new URL(req.url, `http://${req.headers.host}`), {
              method: req.method,
              headers,
              body: hasBody ? Buffer.concat(chunks) : undefined,
            }),
          );
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          next(error as Error);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: { configurator: 'index.html', demoStore: 'demo-store/index.html' },
    },
  },
});
