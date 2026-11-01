import http from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const port = Number(option('--port', process.env.PORT || '4173'));
const host = option('--host', '127.0.0.1');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
await stat(path.join(root, 'index.html')).catch(() => { throw new Error('Build the website first with npm run build.'); });
const realRoot = await realpath(root);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    const url = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0') || pathname.includes('\\')) { response.writeHead(400); response.end('Invalid path.'); return; }
    let filename = path.resolve(root, `.${pathname}`);
    if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) { response.writeHead(403); response.end('Forbidden.'); return; }
    let fileStatus;
    try { fileStatus = await stat(filename); } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
    if (fileStatus?.isDirectory()) {
      if (!pathname.endsWith('/')) { response.writeHead(301, { Location: `${url.pathname}/${url.search}` }); response.end(); return; }
      filename = path.join(filename, 'index.html');
      fileStatus = await stat(filename).catch(() => null);
    }
    let statusCode = 200;
    if (!fileStatus?.isFile()) { filename = path.join(root, '404.html'); statusCode = 404; }
    const actualPath = await realpath(filename);
    if (!actualPath.startsWith(`${realRoot}${path.sep}`)) { response.writeHead(403); response.end('Forbidden.'); return; }
    const fileBody = await readFile(actualPath);
    const body = statusCode === 404 ? Buffer.from(fileBody.toString('utf8').replace(/<base href="[^"]*">/, '<base href="/">'), 'utf8') : fileBody;
    response.writeHead(statusCode, { 'Content-Type': mime[path.extname(filename).toLowerCase()] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Unable to serve this page.');
    if (!(error instanceof URIError)) console.error(error.message);
  }
});
server.listen(port, host, () => console.log(`Local: http://${host}:${port}/`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
