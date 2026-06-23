const LINES = {
  kickoff: [
    'And we\'re underway!',
    'The referee gets us started.',
    'Here we go — kick off!'
  ],
  goal: [
    'GOOOAL! What a finish!',
    'It\'s in the net! The crowd erupts!',
    'They\'ve scored! Incredible moment!'
  ],
  concede: [
    'They\'ve been breached at the back.',
    'That\'s a goal against — need to respond.',
    'The opposition take the lead here.'
  ],
  throwIn: [
    'Out of play — throw-in awarded.',
    'The ball\'s gone out — throw-in for the other side.',
    'Touchline — it\'ll be a throw-in.'
  ],
  shot: [
    'Shot on goal!',
    'He hits it!',
    'Strike! Can he score?'
  ],
  save: [
    'Brilliant defending.',
    'Cleared away!',
    'The keeper deals with it.'
  ],
  half: [
    'Half time — teams head to the tunnel.',
    'The whistle blows for the break.'
  ],
  secondHalf: [
    'Second half begins!',
    'Back under way for the second period.'
  ],
  buildUp: [
    'Good possession here…',
    'Building from the back.',
    'Looking dangerous on the attack.',
    'Neat passing move.',
    'Driving forward with pace!'
  ]
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class Commentary {
  constructor(onLine, voice = null) {
    this.onLine = onLine || (() => {});
    this.voice = voice;
    this.cooldown = 0;
    this.buildTimer = 0;
  }

  tick(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    this.buildTimer -= dt;
  }

  say(key, custom, priority = 'normal') {
    const line = custom || pick(LINES[key] || LINES.buildUp);
    this.onLine(line);
    this.voice?.speak(line, { priority });
    this.cooldown = 2.5;
  }

  maybeBuildUp(dt) {
    if (this.cooldown > 0 || this.buildTimer > 0) return;
    this.buildTimer = 8 + Math.random() * 10;
    this.say('buildUp', null, 'low');
  }

  kickoff() { this.say('kickoff', null, 'high'); }
  secondHalf() { this.say('secondHalf', null, 'high'); }
  halfTime() { this.say('half', null, 'high'); }
  throwIn(teamName) { this.say('throwIn', `${teamName} — ${pick(LINES.throwIn)}`); }
  goal(scorerTeam, isHomeConcede) {
    this.say(isHomeConcede ? 'concede' : 'goal', isHomeConcede
      ? pick(LINES.concede)
      : pick(LINES.goal), 'high');
  }
  shot() {
    if (this.cooldown <= 0) this.say('shot');
  }
}