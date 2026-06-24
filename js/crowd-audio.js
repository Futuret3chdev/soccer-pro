let ctx = null;
let master = null;
let ambient = null;
let ambientSrc = null;
let running = false;
let excitement = 0.25;
let chatterTimer = 0;
let commentaryDucked = false;

const MASTER_NORMAL = 0.58;
const MASTER_DUCKED = 0.16;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = MASTER_NORMAL;
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
      last = (last + white * 0.14) * 0.98;
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
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), ac.currentTime + 0.03);
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
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ac.currentTime + duration);
  g.gain.setValueAtTime(0.001, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), ac.currentTime + 0.025);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(g);
  g.connect(master);
  osc.start();
  osc.stop(ac.currentTime + duration + 0.05);
}

function sustainedRoar(duration, vol, freq = 580) {
  const ac = ensureCtx();
  const src = ac.createBufferSource();
  src.buffer = makeNoiseBuffer(1.8);
  src.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 0.7;
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.06);
  g.gain.setValueAtTime(vol * 0.92, t + duration * 0.55);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(bp);
  bp.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + duration + 0.05);
}

export const CrowdAudio = {
  init() { ensureCtx(); },

  setCommentaryDuck(on) {
    if (!ctx || !master) return;
    commentaryDucked = !!on;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(
      commentaryDucked ? MASTER_DUCKED : MASTER_NORMAL,
      ctx.currentTime,
      0.1
    );
  },

  startAmbient() {
    const ac = ensureCtx();
    if (running) return;
    running = true;
    if (ambientSrc) {
      try { ambientSrc.stop(); } catch (_) {}
    }
    ambientSrc = ac.createBufferSource();
    ambientSrc.buffer = makeNoiseBuffer(4, true);
    ambientSrc.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 680;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 120;
    ambientSrc.connect(hp);
    hp.connect(lp);
    lp.connect(ambient);
    ambient.gain.cancelScheduledValues(ac.currentTime);
    ambient.gain.setValueAtTime(0.001, ac.currentTime);
    ambient.gain.exponentialRampToValueAtTime(0.05, ac.currentTime + 1.5);
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
    const target = commentaryDucked ? 0.012 + excitement * 0.02 : 0.035 + excitement * 0.07;
    ambient.gain.cancelScheduledValues(ctx.currentTime);
    ambient.gain.setTargetAtTime(target, ctx.currentTime, 0.35);

    chatterTimer -= dt;
    if (chatterTimer <= 0) {
      this.chatter();
      chatterTimer = 1.8 + Math.random() * (3.5 - excitement * 1.5);
    }
  },

  chatter() {
    const vol = 0.012 + excitement * 0.018;
    const bursts = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < bursts; i++) {
      setTimeout(() => {
        burstNoise(0.1 + Math.random() * 0.15, vol, 700 + Math.random() * 1400, 0.9, 'bandpass');
      }, i * (60 + Math.random() * 90));
    }
  },

  cheer(intensity = 1, homeLean = 0.7) {
    const vol = 0.11 + intensity * 0.2;
    sustainedRoar(1.8 + intensity * 0.8, vol * 0.75, 520);
    burstNoise(0.75, vol, 480, 0.65);
    burstNoise(0.6, vol * 0.9, 680, 0.85);
    burstNoise(0.55, vol * 0.7, 820, 1.1);
    setTimeout(() => burstNoise(0.65, vol * 0.85, 600, 0.8), 80);
    setTimeout(() => burstNoise(0.5, vol * 0.75, 740, 1), 160);
    setTimeout(() => toneBurst(260, 0.45, vol * 0.42, 200), 50);
    setTimeout(() => toneBurst(330, 0.4, vol * 0.38, 150), 140);
    setTimeout(() => toneBurst(392, 0.35, vol * 0.32, 80), 260);
    setTimeout(() => this.chant(homeLean), 350);
    setTimeout(() => sustainedRoar(1.2, vol * 0.55, 640), 500);
  },

  boo(intensity = 1) {
    const vol = 0.1 + intensity * 0.18;
    sustainedRoar(1.4 + intensity * 0.6, vol * 0.7, 160);
    burstNoise(0.9, vol, 150, 0.45, 'lowpass');
    burstNoise(0.75, vol * 0.85, 110, 0.35, 'lowpass');
    toneBurst(105, 0.65, vol * 0.5, -55);
    toneBurst(88, 0.55, vol * 0.42, -35);
    setTimeout(() => burstNoise(0.7, vol * 0.8, 130, 0.4, 'lowpass'), 100);
    setTimeout(() => toneBurst(92, 0.5, vol * 0.38, -30), 220);
    setTimeout(() => burstNoise(0.55, vol * 0.65, 170, 0.5, 'lowpass'), 340);
  },

  ooh() {
    const vol = 0.06 + excitement * 0.06;
    burstNoise(0.35, vol, 420, 0.6, 'bandpass');
    toneBurst(180, 0.25, vol * 0.35, -30);
  },

  chant(homeLean = 0.7) {
    const vol = 0.05 + excitement * 0.06;
    const notes = homeLean > 0.5 ? [196, 247, 294, 330] : [175, 220, 262, 294];
    notes.forEach((n, i) => setTimeout(() => toneBurst(n, 0.28, vol, 0), i * 140));
  },

  waveCheer() {
    const vol = 0.07 + excitement * 0.06;
    sustainedRoar(0.9, vol, 560);
    burstNoise(0.45, vol, 580, 1);
    setTimeout(() => burstNoise(0.4, vol * 0.85, 700, 0.95), 90);
  },

  reactGoal(scoredByHome) {
    if (scoredByHome) {
      this.cheer(1.6, 0.92);
      setTimeout(() => this.chant(0.95), 600);
      setTimeout(() => sustainedRoar(2.2, 0.22, 600), 900);
    } else {
      this.boo(1.5);
      setTimeout(() => this.boo(0.85), 450);
      setTimeout(() => this.cheer(0.7, 0.18), 700);
    }
  },

  reactAttack(homeTeam) {
    const vol = 0.04 + excitement * 0.05;
    burstNoise(0.28, vol, homeTeam ? 540 : 500, 1);
    if (Math.random() < 0.45) {
      setTimeout(() => burstNoise(0.22, vol * 0.8, 620, 0.9), 60);
    }
  },

  reactShot(homeTeam) {
    this.ooh();
    setTimeout(() => this.reactAttack(homeTeam), 120);
  },

  reactWave() { this.waveCheer(); }
};