const FIRST = ['James','Marcus','Lucas','Diego','Omar','Kai','Noah','Ethan','Leo','Adam','Ryan','Alex','Jordan','Sam','Chris','Tyler','Nathan','Oscar','Finn','Hugo','Ivan','Marco','Pablo','Andre','Victor','Daniel','Erik','Felix','Gabriel','Hassan'];
const LAST = ['Silva','Santos','Garcia','Rodriguez','Martinez','Johnson','Williams','Brown','Davis','Miller','Wilson','Moore','Taylor','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Robinson','Clark','Lewis','Lee','Walker','Hall','Allen','Young','King','Wright'];
const POSITIONS = ['GK','DEF','DEF','MID','MID','FWD'];
const OPPONENTS = ['City FC','Rovers United','Athletic SC','Harbour FC','Northern Stars','Capital City','Rangers FC','Dynamo FC','Phoenix FC','Victory SC'];

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function genPlayer(pos, ovrRange = [62, 84]) {
  const ovr = Math.round(rand(ovrRange[0], ovrRange[1]));
  const spread = () => Math.max(40, Math.min(99, ovr + Math.round(rand(-8, 8))));
  return {
    id: 'p_' + Math.random().toString(36).slice(2, 9),
    name: `${pick(FIRST)} ${pick(LAST)}`,
    pos: pos || pick(POSITIONS),
    ovr,
    pace: spread(),
    shoot: spread(),
    pass: spread(),
    defend: spread(),
    stamina: 100,
    starter: false,
    skin: rand(0.25, 0.85),
    hair: pick(['#1a1a1a', '#3e2723', '#5d4037', '#ffeb3b', '#ff5722', '#212121']),
    height: rand(1.72, 1.92)
  };
}

export function genSquad(count = 14) {
  const squad = [];
  squad.push(genPlayer('GK', [68, 82]));
  for (let i = 0; i < count - 1; i++) {
    squad.push(genPlayer(pick(['DEF','DEF','MID','MID','FWD']), [65, 86]));
  }
  squad.sort((a, b) => b.ovr - a.ovr);
  squad.slice(0, 7).forEach(p => { p.starter = true; });
  return squad;
}

export function genTransferMarket(n = 8) {
  return Array.from({ length: n }, () => {
    const p = genPlayer(null, [60, 88]);
    p.price = Math.round((p.ovr * p.ovr * 12000) / 1000) * 1000;
    return p;
  });
}

export function defaultCareer() {
  return {
    clubName: 'Metro United',
    clubColor: '#1565c0',
    budget: 50_000_000,
    matchday: 1,
    record: { w: 0, d: 0, l: 0 },
    squad: genSquad(14),
    formation: '4-2',
    fixtures: OPPONENTS.map((name, i) => ({
      id: i + 1,
      opponent: name,
      played: false,
      homeScore: null,
      awayScore: null
    })),
    transferMarket: genTransferMarket(10)
  };
}

export const FORMATIONS = {
  '4-2': [
    { x: 0.08, z: 0.5, role: 'GK' },
    { x: 0.22, z: 0.2, role: 'DEF' },
    { x: 0.22, z: 0.4, role: 'DEF' },
    { x: 0.22, z: 0.6, role: 'DEF' },
    { x: 0.22, z: 0.8, role: 'DEF' },
    { x: 0.38, z: 0.35, role: 'MID' },
    { x: 0.38, z: 0.65, role: 'MID' }
  ],
  '3-3': [
    { x: 0.08, z: 0.5, role: 'GK' },
    { x: 0.22, z: 0.3, role: 'DEF' },
    { x: 0.22, z: 0.5, role: 'DEF' },
    { x: 0.22, z: 0.7, role: 'DEF' },
    { x: 0.36, z: 0.25, role: 'MID' },
    { x: 0.36, z: 0.5, role: 'MID' },
    { x: 0.36, z: 0.75, role: 'MID' }
  ],
  '2-4': [
    { x: 0.08, z: 0.5, role: 'GK' },
    { x: 0.22, z: 0.38, role: 'DEF' },
    { x: 0.22, z: 0.62, role: 'DEF' },
    { x: 0.35, z: 0.2, role: 'MID' },
    { x: 0.35, z: 0.4, role: 'MID' },
    { x: 0.35, z: 0.6, role: 'MID' },
    { x: 0.35, z: 0.8, role: 'MID' }
  ]
};

export function formatMoney(n) {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  return `£${(n / 1000).toFixed(0)}K`;
}

export function loadCareer() {
  try {
    const raw = localStorage.getItem('soccerpro:career');
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return defaultCareer();
}

export function saveCareer(career) {
  try { localStorage.setItem('soccerpro:career', JSON.stringify(career)); } catch { /* */ }
}