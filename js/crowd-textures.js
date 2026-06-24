import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const NEUTRAL_SHIRTS = ['#3d4f62', '#4a5c70', '#556578', '#2e3d4d', '#5a6a7d'];
const SKIN_TONES = ['#c68642', '#8d5524', '#d9a87c', '#5c3317', '#e0b090', '#a67c52'];

/** Dense stand panorama — reads like a real packed terrace on TV. */
export function makeCrowdPanoramaTexture(homeHex, awayHex, profile = 'mixed') {
  const w = 2048;
  const h = 1152;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0c121a');
  bg.addColorStop(0.4, '#182433');
  bg.addColorStop(1, '#2a3548');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const homeRatio = profile === 'home' ? 0.84 : profile === 'away' ? 0.1 : 0.46;
  const awayRatio = profile === 'away' ? 0.84 : profile === 'home' ? 0.08 : 0.26;
  const rows = 34;

  for (let row = 0; row < rows; row++) {
    const t = row / rows;
    const y = h * 0.06 + t * h * 0.9;
    const rowH = 12 + t * 20;
    const cols = Math.floor(64 + t * 48);
    const pitch = w / cols;

    for (let col = 0; col < cols; col++) {
      const jitter = (Math.sin(col * 1.7 + row * 2.3) + Math.cos(col * 0.9)) * 1.5;
      const x = col * pitch + (row % 2) * pitch * 0.48 + jitter;
      const r = Math.random();
      let shirt;
      if (r < homeRatio) shirt = homeHex;
      else if (r < homeRatio + awayRatio) shirt = awayHex;
      else shirt = NEUTRAL_SHIRTS[(col + row * 3) % NEUTRAL_SHIRTS.length];

      const headR = 3 + t * 5;
      const bodyW = 7 + t * 7;
      const bodyH = rowH * 0.58;
      const skin = SKIN_TONES[(col * 7 + row * 13) % SKIN_TONES.length];

      ctx.fillStyle = shirt;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, bodyW, bodyH, 2);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, bodyW, bodyH);
      }

      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(x + bodyW / 2, y - headR * 0.3, headR, 0, Math.PI * 2);
      ctx.fill();

      if (Math.random() < 0.14 + t * 0.12) {
        ctx.strokeStyle = shirt;
        ctx.lineWidth = 2.2 + t;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 1, y + 3);
        ctx.lineTo(x - 5 - Math.random() * 4, y - 10 - Math.random() * 8);
        ctx.moveTo(x + bodyW - 1, y + 3);
        ctx.lineTo(x + bodyW + 5 + Math.random() * 4, y - 10 - Math.random() * 8);
        ctx.stroke();
      }

      if (Math.random() < 0.06) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(x - 1, y + bodyH * 0.35, bodyW + 2, 3);
      }
    }

    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(0, y + rowH, w, 4);
  }

  const vign = ctx.createRadialGradient(w / 2, h * 0.55, w * 0.15, w / 2, h * 0.55, w * 0.78);
  vign.addColorStop(0, 'rgba(0,0,0,0)');
  vign.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

export function makeSeatRowTexture(baseHex) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 32; i++) {
    const shade = i % 2 === 0 ? 0xffffff10 : 0x00000018;
    ctx.fillStyle = shade;
    ctx.fillRect(i * 8, 0, 8, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}