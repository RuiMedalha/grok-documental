import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

function run(cmd: string, args: string[], timeoutMs = 60_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${cmd} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const r = await run(cmd, ['--version'], 8_000);
    return r.code === 0 || r.stdout.length > 0 || r.stderr.length > 0;
  } catch {
    return false;
  }
}

export async function ocrImage(imagePath: string, lang = 'por+eng'): Promise<string> {
  const out = await run('tesseract', [imagePath, 'stdout', '-l', lang, '--oem', '1', '--psm', '3'], 90_000);
  return (out.stdout || '').trim();
}

export async function ocrPdf(pdfPath: string, lang = 'por+eng'): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'docflow-ocr-'));
  try {
    const prefix = path.join(tmp, 'page');
    await run('pdftoppm', ['-png', '-r', '200', '-f', '1', '-l', '2', pdfPath, prefix], 90_000);
    const files = (await fs.readdir(tmp))
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => path.join(tmp, f));
    const chunks: string[] = [];
    for (const img of files) {
      chunks.push(await ocrImage(img, lang));
    }
    return chunks.join('\n\n').trim();
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function extractTextFromFile(filePath: string, mimeType?: string, fileName?: string): Promise<{ text: string; engine: string }> {
  const lower = (fileName || filePath).toLowerCase();
  const mime = mimeType || '';
  const hasTesseract = await commandExists('tesseract');

  if (mime.includes('text') || lower.endsWith('.txt')) {
    const text = await fs.readFile(filePath, 'utf8');
    return { text, engine: 'plain' };
  }

  if (mime.includes('pdf') || lower.endsWith('.pdf')) {
    if (hasTesseract && (await commandExists('pdftoppm'))) {
      const text = await ocrPdf(filePath);
      if (text.length > 20) return { text, engine: 'tesseract+pdftoppm' };
    }
    const buf = await fs.readFile(filePath);
    const raw = buf.toString('utf8').replace(/[^\x20-\x7E\n\r\tÀ-ÿ€]/g, ' ');
    return { text: raw, engine: 'pdf-strings' };
  }

  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|tiff?|bmp)$/i.test(lower)) {
    if (hasTesseract) {
      const text = await ocrImage(filePath);
      return { text, engine: 'tesseract' };
    }
    return { text: '', engine: 'none' };
  }

  return { text: '', engine: 'unsupported' };
}
