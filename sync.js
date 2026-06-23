#!/usr/bin/env node
/**
 * Sync mte-pop → GitHub (+ optional Vercel CLI)
 *
 * ONE git push = ONE Vercel deployment (via GitHub integration).
 * Previously each file was a separate commit → 40+ deploys per sync.
 *
 * Usage: node sync.js "commit message"
 * Env:
 *   SYNC_VERCEL=cli  — also run `vercel --prod` (causes a 2nd deploy; avoid unless needed)
 *   SYNC_GITHUB=0    — skip GitHub, CLI deploy only
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ROOT = __dirname;
const OWNER = process.env.GITHUB_OWNER || 'Futuret3chdev';
const REPO = process.env.GITHUB_REPO || 'soccer-pro';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const MESSAGE = process.argv[2] || `Update ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
const SKIP_GITHUB = process.env.SYNC_GITHUB === '0';
const USE_VERCEL_CLI = process.env.SYNC_VERCEL === 'cli';

const SKIP = new Set(['.git', '.vercel', '.tools', 'node_modules', '.DS_Store']);
const SKIP_EXT = /\.(log)$/;
const BINARY_EXT = /\.(png|jpg|jpeg|gif|ico|webp)$/i;

function getGhToken() {
  const ghPaths = [
    path.join(ROOT, '.tools/gh'),
    '/tmp/gh_2.63.2_macOS_amd64/bin/gh',
    'gh'
  ];
  for (const gh of ghPaths) {
    try {
      return execSync(`"${gh}" auth token`, { encoding: 'utf8' }).trim();
    } catch (_) {}
  }
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  throw new Error('GitHub not authenticated. Run: gh auth login');
}

function api(token, method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'soccer-pro-sync',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function walk(dir, base = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...walk(path.join(dir, entry.name), rel));
    else if (!SKIP_EXT.test(entry.name)) files.push(rel);
  }
  return files;
}

function blobPayload(filePath) {
  const full = path.join(ROOT, filePath);
  const buf = fs.readFileSync(full);
  if (BINARY_EXT.test(filePath)) {
    return { content: buf.toString('base64'), encoding: 'base64' };
  }
  return { content: buf.toString('utf8'), encoding: 'utf-8' };
}

async function createBlob(token, filePath) {
  const res = await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/blobs`, blobPayload(filePath));
  if (res.status !== 201) {
    throw new Error(`Blob failed for ${filePath}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data.sha;
}

/**
 * Push all files in a single atomic commit (one Vercel deploy from Git hook).
 */
async function syncGitHubAtomic(token) {
  const files = walk(ROOT).sort();
  console.log(`\n📦 GitHub: syncing ${files.length} files → ONE commit on ${OWNER}/${REPO}...`);

  const treeItems = [];
  for (const filePath of files) {
    const sha = await createBlob(token, filePath);
    treeItems.push({ path: filePath, mode: '100644', type: 'blob', sha });
    process.stdout.write(`  ✓ ${filePath}\n`);
  }

  const treeRes = await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree: treeItems });
  if (treeRes.status !== 201) {
    throw new Error(`Tree failed: ${treeRes.status} ${JSON.stringify(treeRes.data)}`);
  }

  const refRes = await api(token, 'GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const parents = [];
  if (refRes.status === 200) {
    parents.push(refRes.data.object.sha);
  }

  const commitRes = await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: MESSAGE,
    tree: treeRes.data.sha,
    parents
  });
  if (commitRes.status !== 201) {
    throw new Error(`Commit failed: ${commitRes.status} ${JSON.stringify(commitRes.data)}`);
  }

  const commitSha = commitRes.data.sha;

  if (refRes.status === 200) {
    const updateRes = await api(token, 'PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
      sha: commitSha,
      force: false
    });
    if (updateRes.status !== 200) {
      throw new Error(`Ref update failed: ${updateRes.status} ${JSON.stringify(updateRes.data)}`);
    }
  } else {
    const createRes = await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/refs`, {
      ref: `refs/heads/${BRANCH}`,
      sha: commitSha
    });
    if (createRes.status !== 201) {
      throw new Error(`Ref create failed: ${createRes.status} ${JSON.stringify(createRes.data)}`);
    }
  }

  console.log(`✅ GitHub: 1 commit pushed (${commitSha.slice(0, 7)})`);
  console.log(`   https://github.com/${OWNER}/${REPO}`);
  console.log('   → Vercel will auto-deploy ONCE from this push');
}

function syncVercelCli() {
  const nodeBin = process.env.NODE_BIN || '/tmp/node-v22.16.0-darwin-x64/bin';
  const env = { ...process.env, PATH: `${nodeBin}:${process.env.PATH || ''}` };
  console.log('\n🚀 Vercel CLI: deploying to production...');
  console.log('   ⚠️  This is a SEPARATE deploy if GitHub is also connected!');
  execSync('npx vercel@latest --prod --yes', { cwd: ROOT, env, stdio: 'inherit' });
  console.log('✅ Vercel CLI: https://mte-pop.vercel.app');
}

function ensureIcons() {
  const iconDir = path.join(ROOT, 'icons');
  const icon192 = path.join(iconDir, 'icon-192.png');
  const icon512 = path.join(iconDir, 'icon-512.png');
  if (fs.existsSync(icon192) && fs.existsSync(icon512)) return;

  const zlib = require('zlib');
  const crc32 = (buf) => {
    let c = 0xffffffff;
    const table = crc32.table || (crc32.table = (() => {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let x = n;
        for (let k = 0; k < 8; k++) x = (x & 1) ? (0xedb88320 ^ (x >>> 1)) : (x >>> 1);
        t[n] = x;
      }
      return t;
    })());
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };
  const colorAt = (x, y, size) => {
    const pad = Math.floor(size * 0.12);
    const gap = Math.floor(size * 0.04);
    const tile = Math.floor((size - pad * 2 - gap) / 2);
    const colors = [[255, 71, 87], [46, 213, 115], [55, 66, 250], [255, 165, 2]];
    const cols = [[pad, pad], [pad + tile + gap, pad], [pad, pad + tile + gap], [pad + tile + gap, pad + tile + gap]];
    for (let i = 0; i < 4; i++) {
      const [cx, cy] = cols[i];
      if (x >= cx && x < cx + tile && y >= cy && y < cy + tile) return [...colors[i], 255];
    }
    return [108 + Math.floor((x / size) * 20), 92 + Math.floor((y / size) * 30), 231, 255];
  };
  const createPng = (size) => {
    const rows = [];
    for (let y = 0; y < size; y++) {
      const row = Buffer.alloc(1 + size * 4);
      row[0] = 0;
      for (let x = 0; x < size; x++) {
        const [r, g, b, a] = colorAt(x, y, size);
        const i = 1 + x * 4;
        row[i] = r; row[i + 1] = g; row[i + 2] = b; row[i + 3] = a;
      }
      rows.push(row);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
      chunk('IEND', Buffer.alloc(0))
    ]);
  };

  if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir, { recursive: true });
  console.log('🖼  Generating PWA icons...');
  fs.writeFileSync(icon192, createPng(192));
  fs.writeFileSync(icon512, createPng(512));
}

(async () => {
  console.log(`⚽ Soccer Pro Sync — "${MESSAGE}"`);
  ensureIcons();

  if (!SKIP_GITHUB) {
    const token = getGhToken();
    await syncGitHubAtomic(token);
  }

  if (USE_VERCEL_CLI) {
    syncVercelCli();
  } else if (!SKIP_GITHUB) {
    console.log('\n💡 Skipping Vercel CLI (avoids duplicate deploy).');
    console.log('   GitHub push triggers ONE production deploy automatically.');
    console.log('   Force CLI: SYNC_VERCEL=cli ./sync.sh "message"');
  } else {
    syncVercelCli();
  }
})();