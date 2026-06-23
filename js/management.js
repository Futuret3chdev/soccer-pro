import { FORMATIONS, formatMoney, genTransferMarket, saveCareer } from './data.js';

const $ = id => document.getElementById(id);

export class Management {
  constructor(career, onPlay) {
    this.career = career;
    this.onPlay = onPlay;
    this._bind();
    this.render();
  }

  _bind() {
    $('mgmt-back')?.addEventListener('click', () => window.App.showScreen('title'));
    $('btn-play-match')?.addEventListener('click', () => this._playNext());
    $('formation-select')?.addEventListener('change', (e) => {
      this.career.formation = e.target.value;
      saveCareer(this.career);
      this._drawFormation();
    });
    $('transfer-scout')?.addEventListener('click', () => {
      this.career.transferMarket = genTransferMarket(10);
      saveCareer(this.career);
      this._renderTransfers();
    });
    $('transfer-search')?.addEventListener('input', () => this._renderTransfers());

    document.querySelectorAll('.mgmt-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.mgmt-tab').forEach(t => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.mgmt-panel').forEach(p =>
          p.classList.toggle('active', p.dataset.panel === tab.dataset.tab)
        );
        if (tab.dataset.tab === 'formation') this._drawFormation();
      });
    });
  }

  render() {
    const c = this.career;
    $('mgmt-club-name').textContent = c.clubName;
    $('mgmt-matchday').textContent = c.matchday;
    $('mgmt-budget').textContent = formatMoney(c.budget);
    $('mgmt-crest').textContent = c.clubName.split(' ').map(w => w[0]).join('').slice(0, 2);
    $('stat-w').textContent = c.record.w;
    $('stat-d').textContent = c.record.d;
    $('stat-l').textContent = c.record.l;
    $('formation-select').value = c.formation;
    this._renderSquad();
    this._renderTransfers();
    this._renderFixtures();
    this._drawFormation();
  }

  _renderSquad() {
    const grid = $('squad-grid');
    if (!grid) return;
    grid.innerHTML = this.career.squad.map(p => `
      <article class="player-card${p.starter ? ' starter' : ''}" data-id="${p.id}">
        <div class="ovr">${p.ovr}</div>
        <div class="pos">${p.pos}</div>
        <div class="name">${p.name}</div>
        <div class="stats">
          <span>PAC ${p.pace}</span>
          <span>SHO ${p.shoot}</span>
          <span>PAS ${p.pass}</span>
          <span>DEF ${p.defend}</span>
        </div>
      </article>
    `).join('');

    grid.querySelectorAll('.player-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const p = this.career.squad.find(x => x.id === id);
        if (!p) return;
        const starters = this.career.squad.filter(x => x.starter);
        if (p.starter) {
          if (starters.length <= 7) return;
          p.starter = false;
        } else {
          if (starters.length >= 7) {
            const lowest = starters.sort((a, b) => a.ovr - b.ovr)[0];
            if (lowest) lowest.starter = false;
          }
          p.starter = true;
        }
        saveCareer(this.career);
        this._renderSquad();
        this._drawFormation();
      });
    });
  }

  _drawFormation() {
    const canvas = $('formation-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2e7d32');
    grad.addColorStop(0.5, '#388e3c');
    grad.addColorStop(1, '#2e7d32');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, (h / 12) * i, w, h / 12);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.beginPath();
    ctx.moveTo(w / 2, 20);
    ctx.lineTo(w / 2, h - 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 50, 0, Math.PI * 2);
    ctx.stroke();

    const form = FORMATIONS[this.career.formation] || FORMATIONS['4-2'];
    const starters = this.career.squad.filter(p => p.starter).slice(0, 7);

    form.forEach((slot, i) => {
      const p = starters[i];
      const x = 30 + slot.x * (w - 60);
      const y = 30 + slot.z * (h - 60);

      ctx.fillStyle = '#1565c0';
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p ? p.pos : slot.role, x, y - 1);
      if (p) {
        ctx.font = '9px Inter, sans-serif';
        ctx.fillText(p.name.split(' ').pop().slice(0, 8), x, y + 28);
      }
    });
  }

  _renderTransfers() {
    const list = $('transfer-list');
    const q = ($('transfer-search')?.value || '').toLowerCase();
    if (!list) return;
    const market = (this.career.transferMarket || []).filter(p =>
      !q || p.name.toLowerCase().includes(q) || p.pos.toLowerCase().includes(q)
    );
    list.innerHTML = market.map(p => `
      <div class="transfer-row" data-id="${p.id}">
        <span class="ovr">${p.ovr}</span>
        <div class="info">
          <strong>${p.name}</strong>
          <small>${p.pos} · PAC ${p.pace} SHO ${p.shoot}</small>
        </div>
        <span class="price">${formatMoney(p.price)}</span>
        <button class="btn-primary buy-btn" type="button">Sign</button>
      </div>
    `).join('') || '<p class="mgmt-hint">No players found — scout the market</p>';

    list.querySelectorAll('.buy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.transfer-row');
        const p = this.career.transferMarket.find(x => x.id === row.dataset.id);
        if (!p || this.career.budget < p.price) {
          window.App.toast('Insufficient funds');
          return;
        }
        if (this.career.squad.length >= 20) {
          window.App.toast('Squad full (20 max)');
          return;
        }
        this.career.budget -= p.price;
        const signed = { ...p, starter: false };
        delete signed.price;
        this.career.squad.push(signed);
        this.career.transferMarket = this.career.transferMarket.filter(x => x.id !== p.id);
        saveCareer(this.career);
        this.render();
        window.App.toast(`Signed ${p.name}!`);
      });
    });
  }

  _renderFixtures() {
    const list = $('fixture-list');
    if (!list) return;
    list.innerHTML = this.career.fixtures.map((f, i) => {
      const isNext = !f.played && this.career.fixtures.slice(0, i).every(x => x.played);
      let score = '';
      if (f.played) score = `${f.homeScore} - ${f.awayScore}`;
      return `<li class="${f.played ? 'done' : isNext ? 'next' : ''}">
        <span>MD${f.id}: ${this.career.clubName} vs ${f.opponent}</span>
        <span>${f.played ? score : isNext ? 'NEXT ▶' : '—'}</span>
      </li>`;
    }).join('');
  }

  _playNext() {
    const fixture = this.career.fixtures.find(f => !f.played);
    if (!fixture) {
      window.App.toast('Season complete!');
      return;
    }
    const starters = this.career.squad.filter(p => p.starter);
    if (starters.length < 7) {
      window.App.toast('Select 7 starters in Squad');
      return;
    }
    this.onPlay({
      opponent: fixture.opponent,
      fixture,
      squad: starters
    });
  }

  recordResult(homeScore, awayScore) {
    const fixture = this.career.fixtures.find(f => !f.played);
    if (!fixture) return;
    fixture.played = true;
    fixture.homeScore = homeScore;
    fixture.awayScore = awayScore;
    if (homeScore > awayScore) this.career.record.w++;
    else if (homeScore < awayScore) this.career.record.l++;
    else this.career.record.d++;
    this.career.matchday++;
    this.career.budget += 500_000 + homeScore * 100_000;
    this.career.transferMarket = genTransferMarket(6).concat(this.career.transferMarket || []).slice(0, 12);
    saveCareer(this.career);
    this.render();
  }
}