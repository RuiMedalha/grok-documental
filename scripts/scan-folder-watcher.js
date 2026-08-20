#!/usr/bin/env node
/**
 * Watch a network/local folder where the multifunction printer drops scans,
 * and POST each new file to DocFlow inbound API.
 *
 * Usage:
 *   SCAN_FOLDER=/path/to/scans \
 *   SCAN_URL=https://api.example.com/api/inbound/scan/YOUR_TOKEN \
 *   node scripts/scan-folder-watcher.js
 *
 * On Windows with SMB share, map the drive and point SCAN_FOLDER there.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const folder = process.env.SCAN_FOLDER || './scans-drop';
const url = process.env.SCAN_URL;
const pollMs = parseInt(process.env.SCAN_POLL_MS || '3000', 10);
const doneDir = path.join(folder, '_enviado');

if (!url) {
  console.error('Defina SCAN_URL (ex: http://localhost:3001/api/inbound/scan/TOKEN)');
  process.exit(1);
}

fs.mkdirSync(folder, { recursive: true });
fs.mkdirSync(doneDir, { recursive: true });

const seen = new Set();

function upload(filePath) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(filePath);
    const data = fs.readFileSync(filePath);
    const boundary = '----DocFlow' + Date.now();
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('OK', fileName, buf);
            resolve(buf);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${buf}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function tick() {
  const files = fs.readdirSync(folder).filter((f) => {
    if (f.startsWith('.') || f === '_enviado') return false;
    const full = path.join(folder, f);
    return fs.statSync(full).isFile();
  });

  for (const f of files) {
    const full = path.join(folder, f);
    if (seen.has(full)) continue;
    // wait until file size stable (scan still writing)
    const s1 = fs.statSync(full).size;
    await new Promise((r) => setTimeout(r, 800));
    const s2 = fs.statSync(full).size;
    if (s1 !== s2) continue;

    seen.add(full);
    try {
      await upload(full);
      fs.renameSync(full, path.join(doneDir, `${Date.now()}-${f}`));
    } catch (e) {
      console.error('Falha', f, e.message);
      seen.delete(full);
    }
  }
}

console.log('A vigiar', folder, '→', url);
setInterval(tick, pollMs);
tick();
