import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL(process.argv.includes('--dist') ? '../dist/' : '../src/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const port = Number(process.env.ANIMILLION_PORT || 5173);

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
    if (!file.startsWith(resolve(root) + sep)) throw new Error('Outside the static root.');
    const contents = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Animillion · http://127.0.0.1:${port}`));
