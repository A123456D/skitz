// one-shot local receiver: POST {name, data(base64)} -> writes art/<name>
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'art');
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.end(); return; }
  let body = '';
  req.on('data', (c) => body += c);
  req.on('end', () => {
    try {
      const { name, data } = JSON.parse(body);
      const b64 = data.split(',').pop();
      writeFileSync(join(dir, name), Buffer.from(b64, 'base64'));
      res.end('ok ' + name);
    } catch (e) { res.statusCode = 500; res.end('' + e); }
  });
}).listen(5198, () => console.log('save-server on 5198'));
