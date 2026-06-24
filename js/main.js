import { loadCareer, saveCareer, defaultCareer } from './data.js';
import { Management } from './management.js';
import { initInput, bindEngine } from './input.js';
import { Audio } from './audio.js';
import { commentaryVoice } from './commentary-voice.js';

const $ = id => document.getElementById(id);

let career = loadCareer();
let engine = null;
let mgmt = null;
let hudTimer = null;
let quickMode = false;
let currentFixture = null;
let adControlsBound = false;

function bindAdControls() {
  if (adControlsBound) return;
  adControlsBound = true;
  const adVideo = $('match-ad-video');
  $('btn-ad-close')?.addEventListener('click', () => engine?.dismissAd());
  adVideo?.addEventListener('ended', () => engine?.dismissAd());
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === `${name}-screen`));
  document.body.classList.toggle('match-active', name === 'match');
  document.body.classList.toggle('modal-open', false);
}

function syncVoiceToggleUI() {
  const btn = $('btn-voice-toggle');
  if (!btn) return;
  const supported = commentaryVoice.isSupported();
  const on = commentaryVoice.isEnabled();
  btn.classList.toggle('voice-off', !on);
  btn.classList.toggle('voice-unsupported', !supported);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (!supported) {
    btn.title = 'Voice not supported in this browser';
    btn.textContent = '🔇';
    return;
  }
  btn.title = on ? 'Voice commentary on' : 'Voice commentary off';
  btn.textContent = on ? '🔊' : '🔇';
}

function toast(msg) {
  const el = $('match-announce');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function waitFrames(n = 2) {
  return new Promise(resolve => {
    const step = (left) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

async function startMatch(opts) {
  commentaryVoice.unlock();
  if (engine) engine.stop();
  const canvas = $('game-canvas');
  const loadMsg = $('match-load-msg');
  const errMsg = $('match-error-msg');

  showScreen('match');
  loadMsg?.classList.remove('hidden');
  errMsg?.classList.add('hidden');
  await waitFrames(2);

  try {
    const { MatchEngine } = await import('./match-engine.js');
    engine = new MatchEngine(canvas, {
      homeName: career.clubName,
      awayName: opts.opponent || 'City FC',
      onCommentary: (line) => {
        const el = $('commentary-text');
        if (el) el.textContent = line;
      },
      homeColor: career.clubColor || '#1565c0',
      awayColor: '#c62828',
      homeSquad: opts.squad || career.squad.filter(p => p.starter),
      formation: career.formation,
      onGoal: (side, home, away) => {
        $('hud-home-score').textContent = home;
        $('hud-away-score').textContent = away;
        const msg = side === 'home' ? 'GOAL!' : 'CONCEDED';
        const ann = $('match-announce');
        ann.textContent = msg;
        ann.classList.add('show');
        setTimeout(() => ann.classList.remove('show'), 2000);
      },
      onEnd: (score) => endMatch(score)
    });

    loadMsg?.classList.add('hidden');
    $('hud-home-name').textContent = career.clubName;
    $('hud-away-name').textContent = opts.opponent || 'City FC';
    $('hud-home-score').textContent = '0';
    $('hud-away-score').textContent = '0';
    $('hud-home-color').style.background = career.clubColor || '#1565c0';
    $('hud-away-color').style.background = '#c62828';
    $('pause-overlay')?.classList.add('hidden');

    bindEngine(engine);
    engine.resize();
    await waitFrames(1);
    commentaryVoice.init();
    bindAdControls();
    engine.start({
      adVideoEl: $('match-ad-video'),
      adOverlayEl: $('match-ad-overlay')
    });
    Audio.init();
    syncVoiceToggleUI();

    clearInterval(hudTimer);
    hudTimer = setInterval(() => {
      if (!engine?.running) return;
      const s = engine.getState();
      $('hud-timer').textContent = formatTime(s.timeLeft);
      $('hud-period').textContent = s.half === 1 ? '1st Half' : '2nd Half';
      const pm = $('power-meter');
      const pf = $('power-fill');
      if (s.power > 0.05) {
        pm?.classList.remove('hidden');
        if (pf) pf.style.width = `${s.power * 100}%`;
      } else {
        pm?.classList.add('hidden');
      }
    }, 200);
  } catch (err) {
    console.error('Match start failed:', err);
    loadMsg?.classList.add('hidden');
    if (errMsg) {
      errMsg.textContent = err.webglFailed
        ? 'WebGL not supported on this device. Try another browser.'
        : `Could not start match: ${err.message || 'unknown error'}`;
      errMsg.classList.remove('hidden');
    }
    toast('Match failed to load');
  }
}

function endMatch({ home, away }) {
  clearInterval(hudTimer);
  document.body.classList.remove('match-active');
  $('res-home-name').textContent = career.clubName;
  $('res-away-name').textContent = engine?.awayName || currentFixture?.opponent || 'Away';
  $('res-score').textContent = `${home} - ${away}`;
  let msg = 'Draw';
  if (home > away) msg = 'Victory!';
  else if (home < away) msg = 'Defeat';
  $('res-msg').textContent = msg;

  if (!quickMode && mgmt && currentFixture) {
    mgmt.recordResult(home, away);
  }
  showScreen('results');
}

function initMgmt() {
  mgmt = new Management(career, (opts) => {
    quickMode = false;
    currentFixture = opts.fixture;
    startMatch(opts);
  });
}

function bindClick(id, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('click', (e) => {
    e.preventDefault();
    fn();
  });
}

bindClick('btn-career', () => {
  commentaryVoice.unlock();
  if (!career.squad?.length) career = defaultCareer();
  saveCareer(career);
  initMgmt();
  mgmt.render();
  showScreen('mgmt');
  Audio.init();
  commentaryVoice.init();
});

bindClick('btn-quick', () => {
  commentaryVoice.unlock();
  quickMode = true;
  currentFixture = null;
  startMatch({ opponent: 'City FC', squad: career.squad.filter(p => p.starter).slice(0, 7) });
});

bindClick('btn-how', () => {
  $('controls-modal')?.classList.remove('hidden');
  document.body.classList.add('modal-open');
});
bindClick('btn-close-controls', () => {
  $('controls-modal')?.classList.add('hidden');
  document.body.classList.remove('modal-open');
});

bindClick('btn-voice-toggle', () => {
  commentaryVoice.unlock();
  commentaryVoice.init();
  const on = commentaryVoice.toggle();
  syncVoiceToggleUI();
  if (on) commentaryVoice.speak('Voice commentary is on.', { priority: 'high' });
});

bindClick('btn-voice-setting', () => {
  commentaryVoice.unlock();
  commentaryVoice.init();
  const on = commentaryVoice.toggle();
  syncVoiceToggleUI();
  const el = $('voice-setting-label');
  if (el) el.textContent = on ? 'Voice commentary: On' : 'Voice commentary: Off';
  if (on) commentaryVoice.speak('Voice commentary is on.', { priority: 'high' });
});

bindClick('btn-pause', () => {
  engine?.pause(true);
  $('pause-overlay')?.classList.remove('hidden');
});
bindClick('btn-resume', () => {
  engine?.pause(false);
  $('pause-overlay')?.classList.add('hidden');
});
bindClick('btn-quit-match', () => {
  engine?.stop();
  clearInterval(hudTimer);
  document.body.classList.remove('match-active');
  showScreen('title');
});

bindClick('btn-rematch', () => {
  if (quickMode) startMatch({ opponent: 'City FC' });
  else if (mgmt) showScreen('mgmt');
  else showScreen('title');
});
bindClick('btn-results-mgmt', () => {
  initMgmt();
  mgmt.render();
  showScreen('mgmt');
});

window.App = { showScreen, toast };
initInput();
syncVoiceToggleUI();
const voiceLabel = $('voice-setting-label');
if (voiceLabel) {
  voiceLabel.textContent = commentaryVoice.isEnabled() ? 'Voice commentary: On' : 'Voice commentary: Off';
}

document.addEventListener('touchmove', (e) => {
  if (document.body.classList.contains('match-active')) e.preventDefault();
}, { passive: false });

if (!career?.squad?.length) {
  career = defaultCareer();
  saveCareer(career);
}