function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickFn(fns, ctx) {
  return fns[Math.floor(Math.random() * fns.length)](ctx);
}

function surname(name) {
  if (!name) return 'the player';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

function posTag(role, dataPos) {
  if (role === 'GK' || dataPos === 'GK') return 'keeper';
  if (role === 'DEF' || dataPos === 'DEF') return 'defender';
  if (role === 'FWD' || dataPos === 'FWD') return 'striker';
  return 'midfielder';
}

function scoreline(ctx) {
  return `${ctx.homeName} ${ctx.homeScore}–${ctx.awayScore} ${ctx.awayName}`;
}

function minute(ctx) {
  const elapsed = Math.floor((120 - ctx.timeLeft) / 60);
  const sec = Math.floor((120 - ctx.timeLeft) % 60);
  const half = ctx.half === 1 ? elapsed : 60 + elapsed;
  return `${Math.min(90, half)}${sec > 30 && half < 90 ? '+' : ''}`;
}

function buildCtx(base, extra = {}) {
  const p = extra.player;
  const playerName = p?.data?.name || extra.playerName || null;
  return {
    ...base,
    ...extra,
    playerName,
    lastName: surname(playerName),
    team: extra.team || (p ? (p.isHome ? base.homeName : base.awayName) : ''),
    pos: p ? posTag(p.role, p.data?.pos) : (extra.pos || ''),
    scoreline: scoreline({ ...base, ...extra }),
    minute: minute({ ...base, ...extra })
  };
}

const INTRO = [
  c => `Welcome to Soccer Pro! ${c.homeName} against ${c.awayName} — a huge clash in the MT Ecosystem tonight.`,
  c => `Good evening! ${c.homeName} host ${c.awayName}. The atmosphere is electric from the first whistle.`,
  c => `We're live! ${c.homeName} versus ${c.awayName}. Both sides will be desperate for the points.`
];

const INTRO_STARS = [
  c => `Keep an eye on ${c.homeStar} for ${c.homeName} and ${c.awayStar} for ${c.awayName}.`,
  c => `${c.homeStar} leads the ${c.homeName} attack — ${c.awayStar} is the danger man for ${c.awayName}.`,
  c => `Star men on show: ${c.homeStar} for the hosts, ${c.awayStar} for the visitors.`
];

const KICKOFF = [
  c => `And we're underway! ${c.homeName} get us started.`,
  c => `The referee blows — ${c.homeName} kick off against ${c.awayName}.`,
  c => `Here we go! ${c.awayName} ready to press from the first touch.`
];

const BUILDUP = [
  c => `${c.lastName} on the ball for ${c.team}… calm possession.`,
  c => `Lovely touch from ${c.lastName}. ${c.team} building patiently.`,
  c => `${c.lastName} carries it forward — ${c.team} looking to open them up.`,
  c => `Good work from ${c.lastName}. ${c.team} probing in ${c.pos === 'midfielder' ? 'midfield' : 'the final third'}.`,
  c => `${c.lastName} finds space. ${c.team} growing in confidence here.`,
  c => `Neat play involving ${c.lastName}. ${c.team} keeping the ball well.`,
  c => `${c.lastName} turns away from pressure — ${c.team} in control at ${c.minute} minutes.`
];

const PASS = [
  c => `Crisp pass from ${c.fromName} to ${c.toName}. ${c.team} knitting it together.`,
  c => `${c.fromName} picks out ${c.toName} — good vision from the ${c.pos}.`,
  c => `One-touch football! ${c.fromName} to ${c.toName} for ${c.team}.`
];

const SHOT = [
  c => `${c.lastName} hits it! Shot on goal for ${c.team}!`,
  c => `Strike from ${c.lastName}! Can he beat the keeper?`,
  c => `${c.lastName} lets fly! ${c.team} threaten at ${c.minute} minutes.`,
  c => `Effort from ${c.lastName}! The ${c.pos} goes for goal!`
];

const GOAL_SCORE = [
  c => `GOOOAL! ${c.lastName} scores for ${c.team}! ${c.scoreline}!`,
  c => `It's in the net! ${c.playerName}! ${c.team} find the breakthrough — ${c.scoreline}.`,
  c => `What a finish from ${c.lastName}! ${c.team} lead the celebrations! ${c.scoreline}.`,
  c => `${c.lastName} buries it! ${c.team} are on the scoresheet! ${c.scoreline}.`
];

const GOAL_EQUALIZER = [
  c => `GOOOAL! ${c.lastName} levels it! ${c.scoreline}!`,
  c => `${c.lastName} strikes — we're all square! ${c.scoreline}!`
];

const GOAL_GO_AHEAD = [
  c => `${c.lastName} puts ${c.team} ahead! ${c.scoreline}!`,
  c => `They've turned it around! ${c.lastName} — ${c.scoreline}!`
];

const CONCEDE = [
  c => `Heartbreak for ${c.homeName} — ${c.lastName} scores for ${c.awayName}. ${c.scoreline}.`,
  c => `${c.awayName} strike through ${c.lastName}! ${c.homeName} have work to do. ${c.scoreline}.`,
  c => `That's a blow. ${c.lastName} punishes ${c.homeName}. ${c.scoreline}.`
];

const THROW_IN = [
  c => `Out of play — throw-in for ${c.team}. ${c.lastName} will take it.`,
  c => `Touchline ball — ${c.team} throw. ${c.lastName} over the ball.`,
  c => `${c.lastName} with the throw for ${c.team}.`
];

const HALF = [
  c => `Half time — ${c.scoreline}. Plenty to discuss in the dressing room.`,
  c => `The whistle blows for the break. ${c.scoreline} at the interval.`,
  c => `Half time here. ${c.homeName} ${c.homeScore}, ${c.awayName} ${c.awayScore}.`
];

const SECOND_HALF = [
  c => `Second half underway! Still ${c.scoreline}.`,
  c => `We're back for the second period — ${c.scoreline}.`,
  c => `The players return — ${c.homeName} need a big half. ${c.scoreline}.`
];

const SAVE = [
  c => `Brilliant from the keeper! ${c.lastName} denies them.`,
  c => `What a stop! ${c.lastName} keeps ${c.team} in it.`,
  c => `${c.lastName} with a fine save — ${c.team} breathe again.`
];

export class Commentary {
  constructor(onLine, voice = null, match = {}) {
    this.onLine = onLine || (() => {});
    this.voice = voice;
    this.cooldown = 0;
    this.buildTimer = 0;
    this.introDone = false;
    this.ctx = {
      homeName: match.homeName || 'Home',
      awayName: match.awayName || 'Away',
      homeSquad: match.homeSquad || [],
      awaySquad: match.awaySquad || [],
      homeScore: 0,
      awayScore: 0,
      half: 1,
      timeLeft: 120
    };
  }

  setContext(patch) {
    Object.assign(this.ctx, patch);
  }

  tick(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    this.buildTimer -= dt;
  }

  say(line, priority = 'normal', cooldown = 2.8) {
    if (!line) return;
    this.onLine(line);
    this.voice?.speak(line, { priority });
    this.cooldown = cooldown;
  }

  _starName(squad) {
    const starters = (squad || []).filter(p => p?.starter !== false).slice(0, 7);
    const star = [...starters].sort((a, b) => (b.ovr || 0) - (a.ovr || 0))[0];
    return star?.name ? surname(star.name) : null;
  }

  matchIntro() {
    if (this.introDone) return;
    this.introDone = true;
    const homeStar = this._starName(this.ctx.homeSquad);
    const awayStar = this._starName(this.ctx.awaySquad);
    const c = buildCtx(this.ctx, { homeStar: homeStar || 'the captain', awayStar: awayStar || 'their talisman' });
    this.say(pickFn(INTRO, c), 'high', 4);
    if (homeStar || awayStar) {
      setTimeout(() => {
        this.say(pickFn(INTRO_STARS, c), 'normal', 3);
      }, 3200);
    }
  }

  kickoff() {
    const c = buildCtx(this.ctx);
    this.say(pickFn(KICKOFF, c), 'high');
  }

  secondHalf() {
    const c = buildCtx(this.ctx);
    this.say(pickFn(SECOND_HALF, c), 'high');
  }

  halfTime() {
    const c = buildCtx(this.ctx);
    this.say(pickFn(HALF, c), 'high', 4);
  }

  throwIn(teamName, player) {
    const c = buildCtx(this.ctx, { team: teamName, player });
    this.say(pickFn(THROW_IN, c), 'normal');
  }

  goal(scorer, isHomeConcede) {
    const fallback = {
      data: { name: isHomeConcede ? 'the striker' : 'the forward', pos: 'FWD' },
      isHome: !isHomeConcede,
      role: 'FWD'
    };
    const player = scorer?.data?.name ? scorer : fallback;
    const team = player.isHome ? this.ctx.homeName : this.ctx.awayName;
    const hs = this.ctx.homeScore;
    const as = this.ctx.awayScore;
    const c = buildCtx(this.ctx, { player, team });

    if (isHomeConcede) {
      this.say(pickFn(CONCEDE, c), 'high', 5);
      return;
    }

    const justScored = player.isHome ? hs : as;
    const other = player.isHome ? as : hs;
    let line;
    if (justScored === other) line = pickFn(GOAL_EQUALIZER, c);
    else if (justScored === other + 1 && other > 0) line = pickFn(GOAL_GO_AHEAD, c);
    else line = pickFn(GOAL_SCORE, c);
    this.say(line, 'high', 5);
  }

  shot(player) {
    if (this.cooldown > 0) return;
    const c = buildCtx(this.ctx, { player });
    this.say(pickFn(SHOT, c), 'normal');
  }

  pass(from, to) {
    if (this.cooldown > 0 || Math.random() > 0.28) return;
    const c = buildCtx(this.ctx, {
      player: from,
      fromName: surname(from?.data?.name),
      toName: surname(to?.data?.name),
      team: from?.isHome ? this.ctx.homeName : this.ctx.awayName
    });
    this.say(pickFn(PASS, c), 'low', 2);
  }

  save(keeper) {
    if (this.cooldown > 0) return;
    const c = buildCtx(this.ctx, { player: keeper });
    this.say(pickFn(SAVE, c), 'normal');
  }

  maybeBuildUp(dt, ballCarrier) {
    if (this.cooldown > 0 || this.buildTimer > 0 || !ballCarrier) return;
    this.buildTimer = 10 + Math.random() * 12;
    const c = buildCtx(this.ctx, { player: ballCarrier });
    this.say(pickFn(BUILDUP, c), 'low', 2.2);
  }
}