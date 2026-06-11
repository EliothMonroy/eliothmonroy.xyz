const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  GROUPS, MATCH_DAY_ORDER, THIRD_SLOT_GROUPS,
  generateMatches, buildInitialState,
  computeStandings, getH2HRecord,
  getQualifiers, rankThirdPlace,
  assignThirdPlaceTeams, buildBracket,
  randomGoals, simulatePenalties, simulateGroupScore, simulateKnockoutScore,
} = require('../logic.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGroup(teams) {
  return { teams: [...teams], matches: generateMatches('X', teams) };
}

function play(group, homeTeam, awayTeam, hs, as) {
  const m = group.matches.find(
    x => x.home === homeTeam && x.away === awayTeam
  );
  if (!m) throw new Error(`No match ${homeTeam} vs ${awayTeam}`);
  m.homeScore = hs;
  m.awayScore = as;
  m.played = true;
}

function playAll(group, scores) {
  // scores: [[homeIdx, awayIdx, hs, as], ...]
  for (const [hi, ai, hs, as] of scores) {
    play(group, group.teams[hi], group.teams[ai], hs, as);
  }
}

function completeAllGroupsRandomly(state, seed = 1) {
  // Deterministic pseudo-random fill for buildBracket tests
  let s = seed;
  const rng = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (const group of Object.values(state.groups)) {
    for (const m of group.matches) {
      m.homeScore = Math.floor(rng() * 4);
      m.awayScore = Math.floor(rng() * 4);
      m.played = true;
    }
  }
}

// ─── generateMatches ──────────────────────────────────────────────────────────

describe('generateMatches', () => {
  const teams = ['A', 'B', 'C', 'D'];
  const matches = generateMatches('A', teams);

  test('returns 6 matches', () => {
    assert.equal(matches.length, 6);
  });

  test('match IDs follow groupKey-idx pattern', () => {
    for (let i = 0; i < 6; i++) {
      assert.equal(matches[i].id, `A-${i}`);
    }
  });

  test('match days are 1,1,2,2,3,3', () => {
    assert.deepEqual(matches.map(m => m.matchDay), [1, 1, 2, 2, 3, 3]);
  });

  test('all matches start unplayed', () => {
    for (const m of matches) {
      assert.equal(m.played, false);
      assert.equal(m.homeScore, null);
      assert.equal(m.awayScore, null);
    }
  });

  test('follows official FIFA pairing', () => {
    // MD1: 1v2, 3v4 | MD2: 1v3, 4v2 | MD3: 4v1, 2v3
    assert.deepEqual(
      matches.map(m => [m.home, m.away]),
      [['A','B'], ['C','D'], ['A','C'], ['D','B'], ['D','A'], ['B','C']]
    );
  });
});

// ─── buildInitialState ────────────────────────────────────────────────────────

describe('buildInitialState', () => {
  const state = buildInitialState();

  test('phase is "group"', () => {
    assert.equal(state.phase, 'group');
  });

  test('bracket and champion are null', () => {
    assert.equal(state.bracket, null);
    assert.equal(state.champion, null);
  });

  test('has 12 groups A-L', () => {
    assert.deepEqual(
      Object.keys(state.groups).sort(),
      ['A','B','C','D','E','F','G','H','I','J','K','L']
    );
  });

  test('each group has 4 teams and 6 matches', () => {
    for (const [key, group] of Object.entries(state.groups)) {
      assert.equal(group.teams.length, 4, `group ${key} teams`);
      assert.equal(group.matches.length, 6, `group ${key} matches`);
    }
  });

  test('team data matches GROUPS constant', () => {
    for (const [key, teams] of Object.entries(GROUPS)) {
      assert.deepEqual(state.groups[key].teams, teams);
    }
  });
});

// ─── computeStandings ─────────────────────────────────────────────────────────

describe('computeStandings', () => {
  test('empty group: all teams have zeros, sorted alphabetically', () => {
    const g = makeGroup(['Charlie', 'Alpha', 'Delta', 'Bravo']);
    const s = computeStandings(g);
    assert.equal(s.length, 4);
    assert.deepEqual(s.map(r => r.team), ['Alpha', 'Bravo', 'Charlie', 'Delta']);
    for (const r of s) {
      assert.equal(r.mp, 0);
      assert.equal(r.w, 0);
      assert.equal(r.d, 0);
      assert.equal(r.l, 0);
      assert.equal(r.gf, 0);
      assert.equal(r.ga, 0);
      assert.equal(r.gd, 0);
      assert.equal(r.pts, 0);
    }
  });

  test('one team sweeps: top with 9 pts, 3 W, 0 L', () => {
    // Teams: ['A','B','C','D']
    // A wins all 3 of its matches:
    //   MD1 A vs B → A wins 2-0
    //   MD2 A vs C → A wins 3-0
    //   MD3 D vs A → A wins (A away) 1-0 so home D=0, away A=1
    const g = makeGroup(['A', 'B', 'C', 'D']);
    play(g, 'A', 'B', 2, 0);
    play(g, 'A', 'C', 3, 0);
    play(g, 'D', 'A', 0, 1);
    // Fill in the other 3 matches with draws so only A sweeps
    play(g, 'C', 'D', 1, 1);
    play(g, 'D', 'B', 1, 1);
    play(g, 'B', 'C', 1, 1);

    const s = computeStandings(g);
    assert.equal(s[0].team, 'A');
    assert.equal(s[0].pts, 9);
    assert.equal(s[0].w, 3);
    assert.equal(s[0].l, 0);
    assert.equal(s[0].gf, 6);
    assert.equal(s[0].ga, 0);
    assert.equal(s[0].gd, 6);
    assert.equal(s[0].mp, 3);
  });

  test('points order: higher pts ranks higher', () => {
    // A: 9 pts, B: 3 pts, C: 3 pts, D: 0 pts (different GD breaks B vs C)
    const g = makeGroup(['A', 'B', 'C', 'D']);
    play(g, 'A', 'B', 1, 0); // A wins
    play(g, 'C', 'D', 2, 0); // C wins
    play(g, 'A', 'C', 1, 0); // A wins
    play(g, 'D', 'B', 0, 1); // B wins
    play(g, 'D', 'A', 0, 3); // A wins
    play(g, 'B', 'C', 0, 0); // draw

    const s = computeStandings(g);
    assert.equal(s[0].team, 'A');
    assert.equal(s[0].pts, 9);
    assert.equal(s[3].team, 'D');
    assert.equal(s[3].pts, 0);
  });

  test('2-team H2H tiebreaker: H2H winner ranks higher', () => {
    // A and B both finish with 7 pts. A beat B head-to-head.
    // A: beat B 2-0, drew C, beat D → 7 pts
    // B: lost A, beat C, beat D → 6 pts? Let me recompute.
    // Easier: A and B both 4 pts, equal GD/GF. A beat B 1-0.
    const g = makeGroup(['A', 'B', 'C', 'D']);
    play(g, 'A', 'B', 1, 0); // A beats B
    play(g, 'C', 'D', 0, 0); // C draws D
    play(g, 'A', 'C', 0, 0); // A draws C
    play(g, 'D', 'B', 0, 0); // D draws B
    play(g, 'D', 'A', 1, 0); // D beats A
    play(g, 'B', 'C', 1, 0); // B beats C

    const s = computeStandings(g);
    // A: pts = 3+1+0 = 4, gf=1, ga=1, gd=0
    // B: pts = 0+1+3 = 4, gf=1, ga=1, gd=0
    // GD/GF tied → 2-way H2H → A wins → A ranks above B
    const aIdx = s.findIndex(r => r.team === 'A');
    const bIdx = s.findIndex(r => r.team === 'B');
    assert.ok(aIdx < bIdx, `A (idx ${aIdx}) should rank above B (idx ${bIdx})`);
  });

  test('3-team tie: H2H is skipped, falls back to GD/GF/name', () => {
    // 3 teams tied on points — H2H should NOT apply (logic uses it only for 2-way ties)
    // Create A=B=C on 3 pts each. D loses everything.
    const g = makeGroup(['A', 'B', 'C', 'D']);
    play(g, 'A', 'B', 2, 0); // A beats B
    play(g, 'C', 'D', 5, 0); // C beats D big (GF advantage for C)
    play(g, 'A', 'C', 0, 1); // C beats A
    play(g, 'D', 'B', 0, 1); // B beats D
    play(g, 'D', 'A', 0, 1); // A beats D
    play(g, 'B', 'C', 1, 0); // B beats C

    const s = computeStandings(g);
    // A: 6 (W vs B, L vs C, W vs D) = 6 pts, gf=3 ga=1 gd=+2
    // B: 6 (L vs A, W vs D, W vs C) = 6 pts, gf=2 ga=2 gd=0
    // C: 6 (W vs D, W vs A, L vs B) = 6 pts, gf=6 ga=1 gd=+5
    // D: 0 pts, last
    // Higher GD ranks first: C(+5) > A(+2) > B(0)
    assert.equal(s[0].team, 'C');
    assert.equal(s[1].team, 'A');
    assert.equal(s[2].team, 'B');
    assert.equal(s[3].team, 'D');
  });

  test('total tie: alphabetical by team name', () => {
    // All teams 0 pts, 0 gd, 0 gf → name tiebreaker
    const g = makeGroup(['Zeta', 'Alpha', 'Mike', 'Bravo']);
    // No matches played at all
    const s = computeStandings(g);
    assert.deepEqual(s.map(r => r.team), ['Alpha', 'Bravo', 'Mike', 'Zeta']);
  });
});

// ─── getH2HRecord ─────────────────────────────────────────────────────────────

describe('getH2HRecord', () => {
  test('A beats B 2-1: ptsA=3, ptsB=0, gdA=+1', () => {
    const matches = [{
      home: 'A', away: 'B', homeScore: 2, awayScore: 1, played: true
    }];
    assert.deepEqual(getH2HRecord('A', 'B', matches), { ptsA: 3, ptsB: 0, gdA: 1 });
  });

  test('A and B drew 1-1: 1 pt each, gdA=0', () => {
    const matches = [{
      home: 'A', away: 'B', homeScore: 1, awayScore: 1, played: true
    }];
    assert.deepEqual(getH2HRecord('A', 'B', matches), { ptsA: 1, ptsB: 1, gdA: 0 });
  });

  test('match unplayed: returns all zeros', () => {
    const matches = [{
      home: 'A', away: 'B', homeScore: 2, awayScore: 1, played: false
    }];
    assert.deepEqual(getH2HRecord('A', 'B', matches), { ptsA: 0, ptsB: 0, gdA: 0 });
  });

  test('teams swapped (B home vs A away, B wins): ptsA=0, ptsB=3, gdA=-2', () => {
    const matches = [{
      home: 'B', away: 'A', homeScore: 3, awayScore: 1, played: true
    }];
    assert.deepEqual(getH2HRecord('A', 'B', matches), { ptsA: 0, ptsB: 3, gdA: -2 });
  });
});

// Helper: builds the standingsByGroup map that getQualifiers/rankThirdPlace expect
function buildStandingsByGroup(state) {
  const out = {};
  for (const [key, group] of Object.entries(state.groups)) {
    out[key] = computeStandings(group);
  }
  return out;
}

// ─── getQualifiers ────────────────────────────────────────────────────────────

describe('getQualifiers', () => {
  test('returns 24 qualifiers (2 per group × 12)', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const qual = getQualifiers(buildStandingsByGroup(state));
    assert.equal(qual.length, 24);
  });

  test('each group has exactly 1 rank-1 and 1 rank-2', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const qual = getQualifiers(buildStandingsByGroup(state));
    const byGroup = {};
    for (const q of qual) {
      if (!byGroup[q.group]) byGroup[q.group] = [];
      byGroup[q.group].push(q.rank);
    }
    for (const ranks of Object.values(byGroup)) {
      assert.deepEqual(ranks.sort(), [1, 2]);
    }
  });

  test('qualifier teams come from the right group', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const qual = getQualifiers(buildStandingsByGroup(state));
    for (const q of qual) {
      assert.ok(GROUPS[q.group].includes(q.team), `${q.team} should be in group ${q.group}`);
    }
  });
});

// ─── rankThirdPlace ───────────────────────────────────────────────────────────

describe('rankThirdPlace', () => {
  test('returns top 8 third-place teams', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const thirds = rankThirdPlace(buildStandingsByGroup(state));
    assert.equal(thirds.length, 8);
  });

  test('thirds are sorted by pts desc, then gd, then gf, then name', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const thirds = rankThirdPlace(buildStandingsByGroup(state));
    for (let i = 1; i < thirds.length; i++) {
      const a = thirds[i - 1].record;
      const b = thirds[i].record;
      const orderOK =
        a.pts > b.pts ||
        (a.pts === b.pts && a.gd > b.gd) ||
        (a.pts === b.pts && a.gd === b.gd && a.gf > b.gf) ||
        (a.pts === b.pts && a.gd === b.gd && a.gf === b.gf &&
         thirds[i - 1].team.localeCompare(thirds[i].team) <= 0);
      assert.ok(orderOK, `third-place ranking broken at index ${i}`);
    }
  });

  test('all 8 third-place teams come from distinct groups', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const thirds = rankThirdPlace(buildStandingsByGroup(state));
    const groups = thirds.map(t => t.group);
    assert.equal(new Set(groups).size, 8);
  });
});

// ─── assignThirdPlaceTeams ────────────────────────────────────────────────────

describe('assignThirdPlaceTeams', () => {
  test('assigns 8 unique teams to 8 slots when groups are diverse', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const thirds = rankThirdPlace(buildStandingsByGroup(state));
    const assignment = assignThirdPlaceTeams(thirds);
    const slots = Object.keys(THIRD_SLOT_GROUPS);
    for (const slot of slots) {
      assert.ok(assignment[slot], `slot ${slot} not assigned`);
    }
    const teams = Object.values(assignment);
    assert.equal(new Set(teams).size, 8, 'no team assigned twice');
  });

  test('each assigned team comes from an eligible group for its slot', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const thirds = rankThirdPlace(buildStandingsByGroup(state));
    const assignment = assignThirdPlaceTeams(thirds);
    const teamGroup = {};
    for (const t of thirds) teamGroup[t.team] = t.group;
    for (const [slot, team] of Object.entries(assignment)) {
      assert.ok(
        THIRD_SLOT_GROUPS[slot].includes(teamGroup[team]),
        `team ${team} from group ${teamGroup[team]} not eligible for slot ${slot}`
      );
    }
  });
});

// ─── buildBracket ─────────────────────────────────────────────────────────────

describe('buildBracket', () => {
  test('round shapes: R32=16, R16=8, QF=4, SF=2, TP=1, F=1', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const b = buildBracket(state.groups);
    assert.equal(b.r32.length, 16);
    assert.equal(b.r16.length, 8);
    assert.equal(b.qf.length, 4);
    assert.equal(b.sf.length, 2);
    assert.equal(b.tp.length, 1);
    assert.equal(b.f.length, 1);
  });

  test('R32 matches have both teams assigned', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const b = buildBracket(state.groups);
    for (const m of b.r32) {
      assert.ok(m.home, `R32 ${m.id} missing home`);
      assert.ok(m.away, `R32 ${m.id} missing away`);
    }
  });

  test('downstream rounds (R16, QF, SF, TP, F) start with null teams', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const b = buildBracket(state.groups);
    for (const round of ['r16', 'qf', 'sf', 'tp', 'f']) {
      for (const m of b[round]) {
        assert.equal(m.home, null, `${round} ${m.id} home should be null`);
        assert.equal(m.away, null, `${round} ${m.id} away should be null`);
      }
    }
  });

  test('R32 labels are M73-M88', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const b = buildBracket(state.groups);
    const labels = b.r32.map(m => m.label).sort();
    const expected = Array.from({ length: 16 }, (_, i) => `M${73 + i}`).sort();
    assert.deepEqual(labels, expected);
  });

  test('all R32 teams are real teams from GROUPS', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const b = buildBracket(state.groups);
    const allTeams = new Set(Object.values(GROUPS).flat());
    for (const m of b.r32) {
      assert.ok(allTeams.has(m.home), `${m.home} not a real team`);
      assert.ok(allTeams.has(m.away), `${m.away} not a real team`);
    }
  });

  test('all matches in R32 have unique teams', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const b = buildBracket(state.groups);
    const teamsUsed = [];
    for (const m of b.r32) {
      teamsUsed.push(m.home, m.away);
    }
    assert.equal(new Set(teamsUsed).size, 32, 'should be 32 distinct teams in R32');
  });

  test('all matches start with played=false', () => {
    const state = buildInitialState();
    completeAllGroupsRandomly(state);
    const b = buildBracket(state.groups);
    for (const round of ['r32', 'r16', 'qf', 'sf', 'tp', 'f']) {
      for (const m of b[round]) {
        assert.equal(m.played, false, `${round} ${m.id} should start unplayed`);
        assert.equal(m.winner, null);
      }
    }
  });
});

// ─── Simulation ───────────────────────────────────────────────────────────────

describe('randomGoals', () => {
  test('always returns integer 0-5', () => {
    for (let i = 0; i < 1000; i++) {
      const g = randomGoals();
      assert.ok(Number.isInteger(g), `not integer: ${g}`);
      assert.ok(g >= 0 && g <= 5, `out of range: ${g}`);
    }
  });
});

describe('simulatePenalties', () => {
  test('returns [h, a] tuple with both non-negative integers', () => {
    for (let i = 0; i < 200; i++) {
      const [h, a] = simulatePenalties();
      assert.ok(Number.isInteger(h));
      assert.ok(Number.isInteger(a));
      assert.ok(h >= 0);
      assert.ok(a >= 0);
    }
  });

  test('always has a winner (h !== a)', () => {
    for (let i = 0; i < 200; i++) {
      const [h, a] = simulatePenalties();
      assert.notEqual(h, a, `pens tied at ${h}-${a}`);
    }
  });
});

describe('simulateGroupScore', () => {
  test('returns valid score shape', () => {
    for (let i = 0; i < 200; i++) {
      const { homeScore, awayScore } = simulateGroupScore();
      assert.ok(Number.isInteger(homeScore));
      assert.ok(Number.isInteger(awayScore));
      assert.ok(homeScore >= 0 && homeScore <= 5);
      assert.ok(awayScore >= 0 && awayScore <= 5);
    }
  });
});

describe('simulateKnockoutScore', () => {
  test('returns valid shape with all required fields', () => {
    for (let i = 0; i < 200; i++) {
      const r = simulateKnockoutScore();
      assert.ok('homeScore' in r);
      assert.ok('awayScore' in r);
      assert.ok('homePens' in r);
      assert.ok('awayPens' in r);
      assert.ok('winner' in r);
      assert.ok('resultType' in r);
    }
  });

  test('resultType is normal/aet/pens', () => {
    for (let i = 0; i < 200; i++) {
      const r = simulateKnockoutScore();
      assert.ok(['normal', 'aet', 'pens'].includes(r.resultType), `bad resultType ${r.resultType}`);
    }
  });

  test('winner is home or away', () => {
    for (let i = 0; i < 200; i++) {
      const r = simulateKnockoutScore();
      assert.ok(['home', 'away'].includes(r.winner));
    }
  });

  test('normal result: scores differ, no pens', () => {
    for (let i = 0; i < 500; i++) {
      const r = simulateKnockoutScore();
      if (r.resultType === 'normal') {
        assert.notEqual(r.homeScore, r.awayScore);
        assert.equal(r.homePens, null);
        assert.equal(r.awayPens, null);
      }
    }
  });

  test('pens result: pens differ, scores equal', () => {
    let sawPens = false;
    for (let i = 0; i < 2000 && !sawPens; i++) {
      const r = simulateKnockoutScore();
      if (r.resultType === 'pens') {
        sawPens = true;
        assert.equal(r.homeScore, r.awayScore, 'pens implies scores tied');
        assert.ok(Number.isInteger(r.homePens));
        assert.ok(Number.isInteger(r.awayPens));
        assert.notEqual(r.homePens, r.awayPens);
      }
    }
  });

  test('aet result: scores differ after extra time, no pens', () => {
    let sawAet = false;
    for (let i = 0; i < 2000 && !sawAet; i++) {
      const r = simulateKnockoutScore();
      if (r.resultType === 'aet') {
        sawAet = true;
        assert.notEqual(r.homeScore, r.awayScore, 'aet implies post-ET scores differ');
        assert.equal(r.homePens, null);
        assert.equal(r.awayPens, null);
      }
    }
  });
});
