let ctx = null;
let master = null;
let ambient = null;
let ambientSrc = null;
let running = false;
let mood = 'calm';
let chatterTimer = 0;
let excitement = 0.25;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    ambient = ctx.createGain();
    ambient.gain.value = 0;
    ambient.connect(master);
  }
  return ctx;
}

function makeNoiseBuffer(seconds, brown = false) {
  const ac = ensureCtx();
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + white * 0.12) * 0.98;
      d[i] = last;
    } else {
      d[i] = white;
    }
  }
  return buf;
}

function burstNoise(duration, vol, freq = 800, q = 1.2, type = 'bandpass') {
  const ac = ensureCtx();
  const src = ac.createBufferSource();
  src.buffer = makeNoiseBuffer(duration);
  const filt = ac.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.001, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(vol, ac.currentTime + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  src.connect(filt);
  filt.connect(g);
  g.connect(master);
  src.start();
  src.stop(ac.currentTime + duration + 0.05);
}

function toneBurst(freq, duration, vol, slide = 0) {
  const ac = ensureCtx();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq + slide, ac.currentTime + duration);
  g.gain.setValueAtTime(0.001, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(vol, ac.currentTime + 0.03);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(g);
  g.connect(master);
  osc.start();
  osc.stop(ac.currentTime + duration + 0.05);
}

export const CrowdAudio = {
  init() {
    ensureCtx();
  },

  startAmbient() {
    const ac = ensureCtx();
    if (running) return;
    running = true;
    if (ambientSrc) {
      try { ambientSrc.stop(); } catch (_) {}
    }
    ambientSrc = ac.createBufferSource();
    ambientSrc.buffer = makeNoiseBuffer(3, true);
    ambientSrc.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    ambientSrc.connect(lp);
    lp.connect(ambient);
    ambient.gain.cancelScheduledValues(ac.currentTime);
    ambient.gain.setValueAtTime(0.001, ac.currentTime);
    ambient.gain.exponentialRampToValueAtTime(0.07, ac.currentTime + 1.2);
    ambientSrc.start();
  },

  stop() {
    running = false;
    if (!ctx) return;
    ambient.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    if (ambientSrc) {
      try { ambientSrc.stop(ctx.currentTime + 0.5); } catch (_) {}
      ambientSrc = null;
    }
  },

  tick(dt, crowdExcitement = 0.25) {
    if (!running || !ctx) return;
    excitement = crowdExcitement;
    const ac = ctx;
    const target = 0.05 + excitement * 0.09;
    ambient.gain.cancelScheduledValues(ac.currentTime);
    ambient.gain.setTargetAtTime(target, ac.currentTime, 0.4);

    chatterTimer -= dt;
    if (chatterTimer <= 0) {
      this.chatter();
      chatterTimer = 2.5 + Math.random() * (4.5 - excitement * 2);
    }
  },

  chatter() {
    const vol = 0.012 + excitement * 0.02;
    const bursts = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < bursts; i++) {
      setTimeout(() => {
        burstNoise(0.08 + Math.random() * 0.12, vol, 900 + Math.random() * 1200, 0.8, 'bandpass');
      }, i * (80 + Math.random() * 120));
    }
  },

  cheer(intensity = 1, homeLean = 0.7) {
    mood = 'happy';
    const vol = 0.08 + intensity * 0.14;
    const lean = homeLean;
    burstNoise(0.55, vol * lean, 500, 0.7);
    burstNoise(0.45, vol * (1 - lean * 0.3), 700, 1);
    setTimeout(() => burstNoise(0.5, vol * 0.8, 620, 0.9), 90);
    setTimeout(() => toneBurst(280, 0.35, vol * 0.35, 180), 60);
    setTimeout(() => toneBurst(360, 0.3, vol * 0.28, 120), 180);
    setTimeout(() => this.chant(homeLean), 400);
  },

  boo(intensity = 1) {
    mood = 'angry';
    const vol = 0.06 + intensity * 0.12;
    burstNoise(0.7, vol, 180, 0.5, 'lowpass');
    toneBurst(110, 0.5, vol * 0.4, -40);
    setTimeout(() => burstNoise(0.5, vol * 0.7, 140, 0.4, 'lowpass'), 120);
    setTimeout(() => toneBurst(95, 0.4, vol * 0.3, -25), 220);
  },

  chant(homeLean = 0.7) {
    const vol = 0.04 + excitement * 0.05;
    const notes = homeLean > 0.5 ? [196, 247, 294] : [175, 220, 262];
    notes.forEach((n, i) => setTimeout(() => toneBurst(n, 0.22, vol, 0), i * 160));
  },

  waveCheer() {
    burstNoise(0.35, 0.06 + excitement * 0.05, 560, 1);
    setTimeout(() => burstNoise(0.3, 0.05, 640, 0.9), 100);
  },

  reactGoal(scoredByHome) {
    if (scoredByHome) {
      this.cheer(1.25, 0.85);
      setTimeout(() => this.chant(0.9), 700);
    } else {
      this.boo(0.9);
      setTimeout(() => this.cheer(0.55, 0.2), 350);
    }
  },

  reactAttack(homeTeam) {
    if (Math.random() > 0.55) return;
    burstNoise(0.2, 0.035 + excitement * 0.03, homeTeam ? 520 : 480, 1);
  },

  reactWave() {
    this.waveCheer();
  }
};