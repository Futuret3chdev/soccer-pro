import { loadCareer, saveCareer, defaultCareer } from './data.js';
import { MatchEngine } from './match-engine.js';
import { Management } from './management.js';
import { initInput, bindEngine } from './input.js';
import { Audio } from './audio.js';

const $ = id => document.getElementById(id);

let career = loadCareer();
let engine = null;
let mgmt = null;
let hudTimer = null;
let quickMode = false;
let currentFixture = null;

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === `${name}-screen`));
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

function startMatch(opts) {
  if (engine) engine.stop();
  const canvas = $('game-canvas');
  engine = new MatchEngine(canvas, {
    homeName: career.clubName,
    awayName: opts.opponent || 'City FC',
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

  $('hud-home-name').textContent = career.clubName;
  $('hud-away-name').textContent = opts.opponent || 'City FC';
  $('hud-home-score').textContent = '0';
  $('hud-away-score').textContent = '0';
  $('hud-home-color').style.background = career.clubColor || '#1565c0';
  $('hud-away-color').style.background = '#c62828';
  $('pause-overlay')?.classList.add('hidden');

  initInput();
  bindEngine(engine);
  engine.start();
  showScreen('match');
  Audio.init();

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
}

function endMatch({ home, away }) {
  clearInterval(hudTimer);
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

// ── UI bindings ──
$('btn-career')?.addEventListener('click', () => {
  if (!career.squad?.length) career = defaultCareer();
  saveCareer(career);
  initMgmt();
  mgmt.render();
  showScreen('mgmt');
  Audio.init();
});

$('btn-quick')?.addEventListener('click', () => {
  quickMode = true;
  currentFixture = null;
  startMatch({ opponent: 'City FC', squad: career.squad.filter(p => p.starter).slice(0, 7) });
});

$('btn-how')?.addEventListener('click', () => $('controls-modal')?.classList.remove('hidden'));
$('btn-close-controls')?.addEventListener('click', () => $('controls-modal')?.classList.add('hidden'));

$('btn-pause')?.addEventListener('click', () => {
  engine?.pause(true);
  $('pause-overlay')?.classList.remove('hidden');
});
$('btn-resume')?.addEventListener('click', () => {
  engine?.pause(false);
  $('pause-overlay')?.classList.add('hidden');
});
$('btn-quit-match')?.addEventListener('click', () => {
  engine?.stop();
  clearInterval(hudTimer);
  showScreen('title');
});

$('btn-rematch')?.addEventListener('click', () => {
  if (quickMode) {
    startMatch({ opponent: 'City FC' });
  } else if (mgmt) {
    showScreen('mgmt');
  } else {
    showScreen('title');
  }
});
$('btn-results-mgmt')?.addEventListener('click', () => {
  initMgmt();
  mgmt.render();
  showScreen('mgmt');
});

window.App = { showScreen, toast };
initInput();

// Ensure career exists
if (!career?.squad?.length) {
  career = defaultCareer();
  saveCareer(career);
}