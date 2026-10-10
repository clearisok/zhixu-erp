import { createServer as createViteServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import react from '@vitejs/plugin-react';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/** Isolated component preview: no ERP root providers/business stores; Node owns the ephemeral port. */
export async function startMaterialPreview() {
  const httpServer = createHttpServer();
  const server = await createViteServer({ configFile: false, root: fileURLToPath(new URL('./preview/', import.meta.url)),
    plugins: [react()], logLevel: 'warn', server: { middlewareMode: true, hmr: { server: httpServer },
      fs: { allow: [resolve(fileURLToPath(new URL('../../', import.meta.url)))] } } });
  httpServer.on('request', server.middlewares);
  await new Promise((done, reject) => { httpServer.once('error', reject); httpServer.listen(0, '127.0.0.1', done); });
  const address = httpServer.address();
  const url = `http://127.0.0.1:${address.port}/order-center/material-progress-preview/`;
  return { url, close: async () => { await server.close(); await new Promise((done, reject) => httpServer.close(error => error ? reject(error) : done())); } };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const preview = await startMaterialPreview();
  process.stdout.write(`SYNTHETIC ONLY — ${preview.url}\n`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void preview.close().then(() => process.exit(0)));
}
