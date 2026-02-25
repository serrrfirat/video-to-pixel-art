#!/usr/bin/env node
/**
 * Pixel Dreams — local dev server with yt-dlp video proxy.
 *
 * Usage:  node server.js
 *         → http://localhost:3000
 *
 * Endpoints:
 *   GET /                      — static files
 *   POST /api/download         — start yt-dlp download, returns job id
 *   GET  /api/status/:id       — poll download progress (SSE stream)
 *   GET  /api/video/:id        — serve downloaded file with range support
 *   GET  /api/info?url=        — video metadata (title, duration, thumb)
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const STATIC_DIR = __dirname;
const TMP_DIR = path.join(os.tmpdir(), 'pixeldreams');

// Ensure temp directory exists
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ── Cookie support for YouTube auth ────────────────────────────────
const COOKIES_PATH = path.join(STATIC_DIR, 'cookies.txt');
function hasCookies() { return fs.existsSync(COOKIES_PATH); }
function cookieArgs() { return hasCookies() ? ['--cookies', COOKIES_PATH] : []; }


// ── In-memory job store ───────────────────────────────────────────
const jobs = new Map(); // id → { status, progress, filePath, error, proc }

// Clean up old temp files on startup
try {
  for (const f of fs.readdirSync(TMP_DIR)) {
    fs.unlinkSync(path.join(TMP_DIR, f));
  }
} catch (_) { /* ignore */ }

// ── MIME / helpers ────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
}

function jsonReply(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

// ── Static file server with range support ─────────────────────────
function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(STATIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  filePath = path.normalize(filePath);

  if (!filePath.startsWith(STATIC_DIR)) {
    return jsonReply(res, 403, { error: 'Forbidden' });
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ── Serve a video file with proper range support ──────────────────
function serveVideoFile(req, res, filePath) {
  cors(res);

  let stats;
  try { stats = fs.statSync(filePath); }
  catch { return jsonReply(res, 404, { error: 'File not found' }); }

  const size = stats.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : size - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': size,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

// ── POST /api/download — kick off yt-dlp download ─────────────────
async function handleDownload(req, res) {
  const body = await readBody(req);
  const videoUrl = body.url;
  if (!videoUrl) return jsonReply(res, 400, { error: 'Missing url' });

  const id = crypto.randomBytes(8).toString('hex');
  const filePath = path.join(TMP_DIR, `${id}.mp4`);

  const job = { status: 'downloading', progress: '0%', filePath, error: null, proc: null, stderr: '' };
  jobs.set(id, job);

  // Prefer a single-stream MP4 (fast, seekable) up to 1080p.
  const formatArg = 'b[ext=mp4][height<=?1080]/bv*[ext=mp4][height<=?1080]+ba[ext=m4a]/bv*[height<=?1080]+ba/b';

  const args = [
    ...cookieArgs(),
    '-f', formatArg,
    '-o', filePath,
    '--no-warnings',
    '--no-part',
    '--merge-output-format', 'mp4',
    '--newline',
    videoUrl,
  ];

  console.log(`  ↓ Starting download: ${videoUrl.slice(0, 80)}...`);
  if (hasCookies()) console.log('    (using cookies.txt)');

  const ytdlp = spawn('yt-dlp', args);
  job.proc = ytdlp;

  ytdlp.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    job.stderr += text;
    const match = text.match(/\[download\]\s+([\d.]+)%/);
    if (match) job.progress = match[1] + '%';
    if (text.includes('[Merger]') || text.includes('[ExtractAudio]')) job.progress = 'Merging…';
    // Log errors to server console
    if (text.includes('ERROR')) process.stderr.write('    ' + text);
  });

  ytdlp.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    const match = text.match(/\[download\]\s+([\d.]+)%/);
    if (match) job.progress = match[1] + '%';
  });

  ytdlp.on('close', (code) => {
    if (code === 0 && fs.existsSync(filePath)) {
      job.status = 'ready';
      job.progress = '100%';
      console.log(`  ✓ Download complete: ${id}`);

      // Auto-cleanup after 10 minutes
      setTimeout(() => {
        try { fs.unlinkSync(filePath); } catch {}
        jobs.delete(id);
      }, 10 * 60 * 1000);
    } else {
      job.status = 'error';
      // Parse a useful error message from yt-dlp's output
      if (job.stderr.includes('Sign in to confirm')) {
        job.error = 'YouTube requires authentication. Export your browser cookies to cookies.txt (see instructions below the video).';
      } else if (job.stderr.includes('Video unavailable')) {
        job.error = 'Video is unavailable (may be private or region-locked).';
      } else if (job.stderr.includes('Unsupported URL')) {
        job.error = 'URL not recognized by yt-dlp.';
      } else {
        // Extract the ERROR line if present
        const errLine = job.stderr.match(/ERROR:(.+)/);
        job.error = errLine ? errLine[1].trim() : `yt-dlp exited with code ${code}`;
      }
      console.error(`  ✗ Download failed: ${id} — ${job.error}`);
    }
  });

  ytdlp.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  // Return immediately with the job ID
  jsonReply(res, 202, { id });
}

// ── GET /api/status/:id — SSE progress stream ────────────────────
function handleStatus(req, res, id) {
  const job = jobs.get(id);
  if (!job) return jsonReply(res, 404, { error: 'Job not found' });

  cors(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const send = () => {
    const data = { status: job.status, progress: job.progress, error: job.error };
    res.write(`data: ${JSON.stringify(data)}\n\n`);

    if (job.status === 'ready' || job.status === 'error') {
      res.end();
      return;
    }
    setTimeout(send, 500);
  };
  send();

  req.on('close', () => { /* client disconnected, stop sending */ });
}

// ── GET /api/video/:id — serve the downloaded file ────────────────
function handleVideo(req, res, id) {
  const job = jobs.get(id);
  if (!job) return jsonReply(res, 404, { error: 'Job not found' });
  if (job.status !== 'ready') return jsonReply(res, 409, { error: 'Not ready yet' });

  serveVideoFile(req, res, job.filePath);
}

// ── GET /api/info — video metadata ────────────────────────────────
function handleInfo(req, res, videoUrl) {
  cors(res);
  execFile('yt-dlp', [
    ...cookieArgs(),
    '--no-download', '--print', '%(title)s',
    '--print', '%(duration)s', '--print', '%(thumbnail)s',
    '--no-warnings', videoUrl,
  ], { timeout: 15000 }, (err, stdout) => {
    if (err) return jsonReply(res, 502, { error: 'yt-dlp metadata failed' });
    const lines = stdout.trim().split('\n');
    jsonReply(res, 200, {
      title: lines[0] || 'Unknown',
      duration: parseFloat(lines[1]) || 0,
      thumbnail: lines[2] || '',
    });
  });
}

// ── Route parsing helper ──────────────────────────────────────────
function parsePath(urlStr) {
  const qIdx = urlStr.indexOf('?');
  const pathname = qIdx >= 0 ? urlStr.slice(0, qIdx) : urlStr;
  const query = {};
  if (qIdx >= 0) {
    urlStr.slice(qIdx + 1).split('&').forEach((pair) => {
      const [k, ...v] = pair.split('=');
      query[decodeURIComponent(k)] = decodeURIComponent(v.join('='));
    });
  }
  return { pathname, query };
}

// ── Main server ───────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const { pathname, query } = parsePath(req.url);

  // API routes
  if (req.method === 'POST' && pathname === '/api/download') {
    return handleDownload(req, res);
  }

  // /api/status/<id>
  const statusMatch = pathname.match(/^\/api\/status\/([a-f0-9]+)$/);
  if (statusMatch) {
    return handleStatus(req, res, statusMatch[1]);
  }

  // /api/video/<id>
  const videoMatch = pathname.match(/^\/api\/video\/([a-f0-9]+)$/);
  if (videoMatch) {
    return handleVideo(req, res, videoMatch[1]);
  }

  if (pathname === '/api/info' && query.url) {
    return handleInfo(req, res, query.url);
  }

  // Static files
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  ✦ Pixel Dreams running at http://localhost:${PORT}\n`);
  console.log(`  Paste any YouTube / Twitter / TikTok URL and it just works.\n`);
});
