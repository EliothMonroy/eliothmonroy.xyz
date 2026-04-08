const { createApp, reactive, computed, watch, nextTick } = Vue;

createApp({
  data() {
    return {
      state: loadState(),
      // Transient UI state (not persisted)
      pendingScores: {},   // matchId -> { home: '', away: '' }
      activeTab: 'group',  // 'group' | 'knockout'
    };
  },

  computed: {
    groupKeys() {
      return Object.keys(this.state.groups);
    },
    allGroupsComplete() {
      return Object.values(this.state.groups).every(g =>
        g.matches.every(m => m.played)
      );
    },
    standings() {
      const result = {};
      for (const key of this.groupKeys) {
        result[key] = computeStandings(this.state.groups[key]);
      }
      return result;
    },
    qualifiedThirds() {
      if (!this.allGroupsComplete) return [];
      return rankThirdPlace(this.state.groups).map(q => q.team);
    },
    champion() {
      return this.state.champion;
    },
  },

  watch: {
    state: {
      handler(val) { saveState(val); },
      deep: true,
    },
  },

  methods: {
    // ── Group stage ──────────────────────────────────────────────────────────

    getPending(matchId, side) {
      if (!this.pendingScores[matchId]) {
        this.pendingScores[matchId] = { home: '', away: '' };
      }
      return this.pendingScores[matchId][side];
    },

    setPending(matchId, side, val) {
      if (!this.pendingScores[matchId]) {
        this.pendingScores[matchId] = { home: '', away: '' };
      }
      this.pendingScores[matchId][side] = val;
    },

    confirmScore(groupKey, matchId) {
      const p = this.pendingScores[matchId];
      if (!p || p.home === '' || p.away === '') return;
      const h = parseInt(p.home, 10);
      const a = parseInt(p.away, 10);
      if (isNaN(h) || isNaN(a) || h < 0 || a < 0) return;
      this.applyGroupScore(groupKey, matchId, h, a);
      delete this.pendingScores[matchId];
    },

    applyGroupScore(groupKey, matchId, h, a) {
      const m = this.state.groups[groupKey].matches.find(x => x.id === matchId);
      if (!m) return;
      m.homeScore = h;
      m.awayScore = a;
      m.played = true;
    },

    editGroupMatch(groupKey, matchId) {
      const m = this.state.groups[groupKey].matches.find(x => x.id === matchId);
      if (!m) return;
      this.pendingScores[matchId] = { home: String(m.homeScore), away: String(m.awayScore) };
      m.homeScore = null;
      m.awayScore = null;
      m.played = false;
    },

    simulateGroupMatch(groupKey, matchId) {
      const { homeScore, awayScore } = simulateGroupScore();
      this.applyGroupScore(groupKey, matchId, homeScore, awayScore);
    },

    simulateAllGroups() {
      for (const [key, group] of Object.entries(this.state.groups)) {
        for (const m of group.matches) {
          if (!m.played) this.simulateGroupMatch(key, m.id);
        }
      }
    },

    // ── Phase transition ─────────────────────────────────────────────────────

    advanceToKnockout() {
      if (!this.allGroupsComplete) return;
      this.state.bracket = buildBracket(this.state.groups);
      this.state.phase = 'knockout';
      this.activeTab = 'knockout';
    },

    // ── Knockout stage ───────────────────────────────────────────────────────

    getRoundMatches(round) {
      if (!this.state.bracket) return [];
      return this.state.bracket[round] || [];
    },

    confirmKnockoutScore(round, matchIdx) {
      const match = this.state.bracket[round][matchIdx];
      const p = this.pendingScores[match.id];
      if (!p || p.home === '' || p.away === '') return;
      const h = parseInt(p.home, 10);
      const a = parseInt(p.away, 10);
      if (isNaN(h) || isNaN(a) || h < 0 || a < 0) return;

      if (h === a) {
        // Need penalties
        const [hp, ap] = simulatePenalties();
        this.applyKnockoutScore(round, matchIdx, h, a, hp, ap, 'pens');
      } else {
        this.applyKnockoutScore(round, matchIdx, h, a, null, null, 'normal');
      }
      delete this.pendingScores[match.id];
    },

    applyKnockoutScore(round, matchIdx, h, a, hp, ap, resultType) {
      const match = this.state.bracket[round][matchIdx];
      match.homeScore = h;
      match.awayScore = a;
      match.homePens = hp;
      match.awayPens = ap;
      match.resultType = resultType || 'normal';
      match.played = true;

      const winner = hp !== null
        ? (hp > ap ? match.home : match.away)
        : (h > a ? match.home : match.away);
      match.winner = winner;

      this.propagateWinner(round, matchIdx, winner);

      // Third place: propagate loser of SF
      if (round === 'sf') {
        const loser = winner === match.home ? match.away : match.home;
        const tp = this.state.bracket.tp[0];
        if (matchIdx === 0) tp.home = loser;
        else tp.away = loser;
      }

      // Check for champion
      if (round === 'f') {
        this.state.champion = winner;
      }
    },

    propagateWinner(round, matchIdx, winner) {
      if (round === 'f' || round === 'tp') return;
      const feed = BRACKET_FEED[round](matchIdx);
      const nextMatch = this.state.bracket[feed.nextRound][feed.nextIdx];
      nextMatch[feed.slot] = winner;
    },

    editKnockoutMatch(round, matchIdx) {
      const match = this.state.bracket[round][matchIdx];
      this.pendingScores[match.id] = {
        home: String(match.homeScore),
        away: String(match.awayScore),
      };
      this.cascadeResetKnockout(round, matchIdx);
    },

    // Resets a knockout match and clears all downstream results that depended on it
    cascadeResetKnockout(round, matchIdx) {
      const match = this.state.bracket[round][matchIdx];
      const prevWinner = match.winner;

      match.homeScore = null;
      match.awayScore = null;
      match.homePens  = null;
      match.awayPens  = null;
      match.winner    = null;
      match.played    = false;
      match.resultType = null;

      if (round === 'f') {
        this.state.champion = null;
        return;
      }
      if (round === 'tp') return;

      if (round === 'sf') {
        // Clear winner from Final
        const feed = BRACKET_FEED.sf(matchIdx);
        const finalMatch = this.state.bracket.f[0];
        if (finalMatch[feed.slot] === prevWinner) {
          finalMatch[feed.slot] = null;
          if (finalMatch.played) this.cascadeResetKnockout('f', 0);
        }
        // Clear loser from Third Place
        const tp = this.state.bracket.tp[0];
        const tpSlot = matchIdx === 0 ? 'home' : 'away';
        tp[tpSlot] = null;
        if (tp.played) this.cascadeResetKnockout('tp', 0);
        return;
      }

      // r32, r16, qf
      const feed = BRACKET_FEED[round](matchIdx);
      const nextMatch = this.state.bracket[feed.nextRound][feed.nextIdx];
      if (nextMatch[feed.slot] === prevWinner) {
        nextMatch[feed.slot] = null;
        if (nextMatch.played) this.cascadeResetKnockout(feed.nextRound, feed.nextIdx);
      }
    },

    simulateKnockoutMatch(round, matchIdx) {
      const match = this.state.bracket[round][matchIdx];
      if (!match.home || !match.away || match.played) return;
      const result = simulateKnockoutScore();
      this.applyKnockoutScore(round, matchIdx,
        result.homeScore, result.awayScore,
        result.homePens, result.awayPens,
        result.resultType);
    },

    simulateAllKnockout() {
      const rounds = ['r32', 'r16', 'qf', 'sf', 'tp', 'f'];
      for (const round of rounds) {
        const matches = this.state.bracket[round];
        for (let i = 0; i < matches.length; i++) {
          const m = matches[i];
          if (!m.played && m.home && m.away) {
            this.simulateKnockoutMatch(round, i);
          }
        }
      }
    },

    simulateAll() {
      if (this.state.phase === 'group') {
        this.simulateAllGroups();
      } else {
        this.simulateAllKnockout();
      }
    },

    // ── Helpers ──────────────────────────────────────────────────────────────

    flag(team) { return getFlag(team); },

    isThirdQualified(team) {
      return this.qualifiedThirds.includes(team);
    },

    roundLabel(round) {
      return { r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-finals',
               sf: 'Semi-finals', tp: 'Third Place', f: 'Final' }[round];
    },

    scoreDisplay(match) {
      if (!match.played) return '— vs —';
      let s = `${match.homeScore} – ${match.awayScore}`;
      if (match.resultType === 'pens') {
        s += ` (${match.homePens}–${match.awayPens} pens)`;
      } else if (match.resultType === 'aet') {
        s += ' (AET)';
      }
      return s;
    },

    async downloadShareImage() {
      const card = document.getElementById('share-card');
      if (!card) return;

      // Temporarily move on-screen so html2canvas can render it
      const prev = card.style.left;
      card.style.left = '0px';
      card.style.top = '0px';
      card.style.zIndex = '-1';

      try {
        const canvas = await html2canvas(card, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#0a1628',
          logging: false,
        });
        const link = document.createElement('a');
        link.download = `wc2026-${this.champion.replace(/\s+/g, '-').toLowerCase()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } finally {
        card.style.left = prev;
        card.style.top = '0px';
        card.style.zIndex = '';
      }
    },

    reset() {
      if (!confirm('Reset the entire tournament? All progress will be lost.')) return;
      localStorage.removeItem('wc2026_state');
      this.state = buildInitialState();
      this.pendingScores = {};
      this.activeTab = 'group';
    },
  },
}).mount('#app');

// ─── Persistence ──────────────────────────────────────────────────────────────

function saveState(state) {
  try {
    localStorage.setItem('wc2026_state', JSON.stringify(state));
  } catch (e) { /* quota exceeded — ignore */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem('wc2026_state');
    if (raw) {
      const parsed = JSON.parse(raw);
      // Validate shape + check matchDay field exists (schema v2)
      const firstGroup = parsed.groups && Object.values(parsed.groups)[0];
      const hasMatchDay = firstGroup && firstGroup.matches[0] && 'matchDay' in firstGroup.matches[0];
      if (parsed.groups && parsed.phase && hasMatchDay) return parsed;
    }
  } catch (e) { /* corrupted — fall through */ }
  return buildInitialState();
}
