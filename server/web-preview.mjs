import express from 'express';
import compression from 'compression';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const buildPath = resolve(here, '../web-build');
const port = Number(process.env.WEB_PORT || 8084);
const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(express.static(buildPath, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    else if (filePath.includes('_expo\\static\\')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));
app.get('/{*splat}', (_req, res) => res.sendFile(resolve(buildPath, 'index.html')));
app.listen(port, '0.0.0.0', () => console.log(`CM Library app: http://localhost:${port}`));
