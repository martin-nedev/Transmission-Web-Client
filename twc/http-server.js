import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

export function startServer() {

  const server = http.createServer((request, response) => {

    const pathname = (request.url || '/').replace(/[?#].*$/, '');
    const filePath = path.join('web', pathname === '/' ? 'twc.html' : pathname.slice(1));

    fs.readFile(filePath, (error, data) => {

      if (error) return response.writeHead(404).end('Not Found.');

      if (path.extname(filePath) === '.html') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      } else {
        response.writeHead(200);
      }

      response.end(data);
    });
  });

  server.listen(3000, () => { console.log(`http://localhost:3000`); });
} 