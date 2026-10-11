'use strict';
const http = require('node:http');
const proxy = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/\\/g, '/').toLowerCase();
  } catch {
    res.writeHead(400); res.end('Bad request'); return;
  }
  if (pathname.includes('ctf-admin')) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const upstream = http.request({
    hostname: '127.0.0.1', port: 3000, method: req.method,
    path: req.url, headers: req.headers
  }, (response) => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end('Upstream unavailable');
  });
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
});
proxy.listen(3001, '127.0.0.1', () => console.log('Public tunnel proxy listening on 127.0.0.1:3001'));
