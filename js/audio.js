let ctx = null;

function ensureCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function tone(freq, dur, type = 'sine', vol = 0.08, decay = 0.3) {
  const ac = ensureCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + dur);
}

export const Audio = {
  init() { ensureCtx(); },
  kick() { tone(120, 0.12, 'triangle', 0.12); tone(60, 0.08, 'sine', 0.06); },
  pass() { tone(280, 0.08, 'sine', 0.06); },
  goal() {
    [440, 554, 659, 880].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'square', 0.07), i * 120));
  },
  whistle() { tone(1800, 0.15, 'sine', 0.05); setTimeout(() => tone(1800, 0.2, 'sine', 0.05), 200); },
  crowdCheer() {
    const ac = ensureCtx();
    const buf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.15 * Math.exp(-i / d.length * 3);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.value = 0.2;
    src.connect(g);
    g.connect(ac.destination);
    src.start();
  }
};