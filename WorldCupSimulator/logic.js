// ─── Flags ───────────────────────────────────────────────────────────────────

const FLAGS = {
  'Mexico':                   '🇲🇽',
  'South Africa':             '🇿🇦',
  'South Korea':              '🇰🇷',
  'Czech Republic':           '🇨🇿',
  'Canada':                   '🇨🇦',
  'Bosnia and Herzegovina':   '🇧🇦',
  'Qatar':                    '🇶🇦',
  'Switzerland':              '🇨🇭',
  'Brazil':                   '🇧🇷',
  'Morocco':                  '🇲🇦',
  'Haiti':                    '🇭🇹',
  'Scotland':                 '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'United States':            '🇺🇸',
  'Paraguay':                 '🇵🇾',
  'Australia':                '🇦🇺',
  'Turkey':                   '🇹🇷',
  'Germany':                  '🇩🇪',
  'Curaçao':                  '🇨🇼',
  "Côte d'Ivoire":            '🇨🇮',
  'Ecuador':                  '🇪🇨',
  'Netherlands':               '🇳🇱',
  'Japan':                    '🇯🇵',
  'Sweden':                   '🇸🇪',
  'Tunisia':                  '🇹🇳',
  'Belgium':                  '🇧🇪',
  'Egypt':                    '🇪🇬',
  'Iran':                     '🇮🇷',
  'New Zealand':              '🇳🇿',
  'Spain':                    '🇪🇸',
  'Cape Verde':               '🇨🇻',
  'Saudi Arabia':             '🇸🇦',
  'Uruguay':                  '🇺🇾',
  'France':                   '🇫🇷',
  'Senegal':                  '🇸🇳',
  'Iraq':                     '🇮🇶',
  'Norway':                   '🇳🇴',
  'Argentina':                '🇦🇷',
  'Algeria':                  '🇩🇿',
  'Austria':                  '🇦🇹',
  'Jordan':                   '🇯🇴',
  'Portugal':                 '🇵🇹',
  'DR Congo':                 '🇨🇩',
  'Uzbekistan':               '🇺🇿',
  'Colombia':                 '🇨🇴',
  'England':                  '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Croatia':                  '🇭🇷',
  'Ghana':                    '🇬🇭',
  'Panama':                   '🇵🇦',
};

function getFlag(team) {
  return FLAGS[team] || '';
}

// ─── Team Data ───────────────────────────────────────────────────────────────

const GROUPS = {
  A: ['Mexico', 'South Africa', 'South Korea', 'Czech Republic'],
  B: ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'],
  C: ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
  D: ['United States', 'Paraguay', 'Australia', 'Turkey'],
  E: ['Germany', 'Curaçao', "Côte d'Ivoire", 'Ecuador'],
  F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
  G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
  H: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'],
  I: ['France', 'Senegal', 'Iraq', 'Norway'],
  J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
  K: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'],
  L: ['England', 'Croatia', 'Ghana', 'Panama'],
};

// ─── State Initialization ─────────────────────────────────────────────────────

// Official FIFA match order: MD1: 1v2, 3v4 | MD2: 1v3, 4v2 | MD3: 4v1, 2v3
const MATCH_DAY_ORDER = [
  { day: 1, home: 0, away: 1 },
  { day: 1, home: 2, away: 3 },
  { day: 2, home: 0, away: 2 },
  { day: 2, home: 3, away: 1 },
  { day: 3, home: 3, away: 0 },
  { day: 3, home: 1, away: 2 },
];

function generateMatches(groupKey, teams) {
  return MATCH_DAY_ORDER.map(({ day, home, away }, idx) => ({
    id: `${groupKey}-${idx}`,
    home: teams[home],
    away: teams[away],
    matchDay: day,
    homeScore: null,
    awayScore: null,
    played: false,
  }));
}

function buildInitialState() {
  const groups = {};
  for (const [key, teams] of Object.entries(GROUPS)) {
    groups[key] = { teams: [...teams], matches: generateMatches(key, teams) };
  }
  return {
    phase: 'group',
    groups,
    bracket: null,
    champion: null,
  };
}

// ─── Standings ────────────────────────────────────────────────────────────────

function computeStandings(group) {
  const records = {};
  for (const team of group.teams) {
    records[team] = { team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  }

  for (const m of group.matches) {
    if (!m.played) continue;
    const h = records[m.home];
    const a = records[m.away];
    h.mp++; a.mp++;
    h.gf += m.homeScore; h.ga += m.awayScore;
    a.gf += m.awayScore; a.ga += m.homeScore;
    h.gd = h.gf - h.ga;
    a.gd = a.gf - a.ga;
    if (m.homeScore > m.awayScore) {
      h.w++; h.pts += 3; a.l++;
    } else if (m.homeScore < m.awayScore) {
      a.w++; a.pts += 3; h.l++;
    } else {
      h.d++; h.pts++; a.d++; a.pts++;
    }
  }

  const list = Object.values(records);
  list.sort((a, b) => sortTeams(a, b, group.matches, list));
  return list;
}

function getH2HRecord(teamA, teamB, matches) {
  let ptsA = 0, ptsB = 0, gdA = 0;
  for (const m of matches) {
    const isAB = m.home === teamA && m.away === teamB;
    const isBA = m.home === teamB && m.away === teamA;
    if (!m.played || (!isAB && !isBA)) continue;
    const hs = isAB ? m.homeScore : m.awayScore;
    const as = isAB ? m.awayScore : m.homeScore;
    gdA += hs - as;
    if (hs > as) ptsA += 3;
    else if (hs < as) ptsB += 3;
    else { ptsA++; ptsB++; }
  }
  return { ptsA, ptsB, gdA };
}

function sortTeams(a, b, matches, allTeams) {
  if (a.pts !== b.pts) return b.pts - a.pts;

  // Find all teams tied with same points
  const tiedTeams = allTeams.filter(t => t.pts === a.pts).map(t => t.team);

  if (tiedTeams.length === 2) {
    const h2h = getH2HRecord(a.team, b.team, matches);
    if (h2h.ptsA !== h2h.ptsB) return h2h.ptsB - h2h.ptsA;
    if (h2h.gdA !== 0) return -h2h.gdA;
  }

  if (a.gd !== b.gd) return b.gd - a.gd;
  if (a.gf !== b.gf) return b.gf - a.gf;
  return a.team.localeCompare(b.team);
}

// ─── Qualification ────────────────────────────────────────────────────────────

function getQualifiers(groups) {
  const qualifiers = [];
  for (const [key, group] of Object.entries(groups)) {
    const standings = computeStandings(group);
    qualifiers.push({ group: key, rank: 1, team: standings[0].team, record: standings[0] });
    qualifiers.push({ group: key, rank: 2, team: standings[1].team, record: standings[1] });
  }
  return qualifiers;
}

function rankThirdPlace(groups) {
  const thirds = [];
  for (const [key, group] of Object.entries(groups)) {
    const standings = computeStandings(group);
    thirds.push({ group: key, rank: 3, team: standings[2].team, record: standings[2] });
  }
  thirds.sort((a, b) => {
    if (a.record.pts !== b.record.pts) return b.record.pts - a.record.pts;
    if (a.record.gd !== b.record.gd) return b.record.gd - a.record.gd;
    if (a.record.gf !== b.record.gf) return b.record.gf - a.record.gf;
    return a.team.localeCompare(b.team);
  });
  return thirds.slice(0, 8);
}

// ─── Bracket Construction ─────────────────────────────────────────────────────

function makeMatch(id, home, away) {
  return { id, home, away, homeScore: null, awayScore: null,
           homePens: null, awayPens: null, winner: null, played: false };
}

// Official FIFA 2026 eligible source groups per 3rd-place slot
const THIRD_SLOT_GROUPS = {
  M74: ['A','B','C','D','F'],
  M77: ['C','D','F','G','H'],
  M79: ['C','E','F','H','I'],
  M80: ['E','H','I','J','K'],
  M81: ['B','E','F','I','J'],
  M82: ['A','E','H','I','J'],
  M85: ['E','F','G','I','J'],
  M87: ['D','E','I','J','L'],
};

// Assign the 8 best 3rd-place teams to the 8 official slots via backtracking.
// Tries most-constrained slots first to find a valid assignment faster.
function assignThirdPlaceTeams(top8thirds) {
  const qualGroups = top8thirds.map(t => t.group);

  // Sort slots by number of eligible groups that are actually in qualGroups (ascending = most constrained first)
  const slotNames = Object.keys(THIRD_SLOT_GROUPS).sort((a, b) => {
    const ca = THIRD_SLOT_GROUPS[a].filter(g => qualGroups.includes(g)).length;
    const cb = THIRD_SLOT_GROUPS[b].filter(g => qualGroups.includes(g)).length;
    return ca - cb;
  });

  const assignment = {};

  function bt(idx, remaining) {
    if (idx === slotNames.length) return true;
    const slot = slotNames[idx];
    const eligible = THIRD_SLOT_GROUPS[slot].filter(g => remaining.includes(g));
    for (const g of eligible) {
      assignment[slot] = top8thirds.find(t => t.group === g).team;
      if (bt(idx + 1, remaining.filter(x => x !== g))) return true;
      delete assignment[slot];
    }
    return false;
  }

  bt(0, qualGroups);
  return assignment; // { M74: 'TeamName', M77: '...', ... }
}

function buildBracket(groups) {
  const qual = getQualifiers(groups);
  const top8thirds = rankThirdPlace(groups);

  const byGroup = {};
  for (const q of qual) {
    if (!byGroup[q.group]) byGroup[q.group] = {};
    byGroup[q.group][q.rank] = q.team;
  }

  const w = g => byGroup[g][1]; // group winner
  const r = g => byGroup[g][2]; // group runner-up

  const ta = assignThirdPlaceTeams(top8thirds);
  const t  = slot => ta[slot] || null;

  // Official FIFA 2026 Round of 32 (M73–M88)
  const r32 = [
    { ...makeMatch('R32-0',  r('A'), r('B')),   label: 'M73' },
    { ...makeMatch('R32-1',  w('E'), t('M74')), label: 'M74' },
    { ...makeMatch('R32-2',  w('F'), r('C')),   label: 'M75' },
    { ...makeMatch('R32-3',  w('C'), r('F')),   label: 'M76' },
    { ...makeMatch('R32-4',  w('I'), t('M77')), label: 'M77' },
    { ...makeMatch('R32-5',  r('E'), r('I')),   label: 'M78' },
    { ...makeMatch('R32-6',  w('A'), t('M79')), label: 'M79' },
    { ...makeMatch('R32-7',  w('L'), t('M80')), label: 'M80' },
    { ...makeMatch('R32-8',  w('D'), t('M81')), label: 'M81' },
    { ...makeMatch('R32-9',  w('G'), t('M82')), label: 'M82' },
    { ...makeMatch('R32-10', r('K'), r('L')),   label: 'M83' },
    { ...makeMatch('R32-11', w('H'), r('J')),   label: 'M84' },
    { ...makeMatch('R32-12', w('B'), t('M85')), label: 'M85' },
    { ...makeMatch('R32-13', w('J'), r('H')),   label: 'M86' },
    { ...makeMatch('R32-14', w('K'), t('M87')), label: 'M87' },
    { ...makeMatch('R32-15', r('D'), r('G')),   label: 'M88' },
  ];

  // R16 labels: M89–M96 (order matches R16 index 0–7)
  const R16_LABELS = ['M89','M90','M91','M92','M93','M94','M95','M96'];
  const r16 = Array.from({ length: 8 }, (_, i) => ({ ...makeMatch(`R16-${i}`, null, null), label: R16_LABELS[i] }));
  // QF: M97(A), M98(B), M99(C), M100(D) — stored at indices 0,1,2,3
  const QF_LABELS = ['M97','M98','M99','M100'];
  const qf = Array.from({ length: 4 }, (_, i) => ({ ...makeMatch(`QF-${i}`, null, null), label: QF_LABELS[i] }));

  // SF: M101(SF1), M102(SF2)
  const SF_LABELS = ['M101','M102'];
  const sf = Array.from({ length: 2 }, (_, i) => ({ ...makeMatch(`SF-${i}`, null, null), label: SF_LABELS[i] }));

  const tp  = [{ ...makeMatch('TP-0', null, null), label: 'M103' }];
  const f   = [{ ...makeMatch('F-0',  null, null), label: 'M104' }];

  return { r32, r16, qf, sf, tp, f };
}

// Advance winner of a completed knockout match into the next round
// R32 → R16 official FIFA 2026 feed (non-sequential)
// R32 index → { r16 index, slot }
const R32_TO_R16 = [
  { nextIdx: 1, slot: 'home' },  // R32[0]  W73 → M90 home
  { nextIdx: 0, slot: 'home' },  // R32[1]  W74 → M89 home
  { nextIdx: 1, slot: 'away' },  // R32[2]  W75 → M90 away
  { nextIdx: 2, slot: 'home' },  // R32[3]  W76 → M91 home
  { nextIdx: 0, slot: 'away' },  // R32[4]  W77 → M89 away
  { nextIdx: 2, slot: 'away' },  // R32[5]  W78 → M91 away
  { nextIdx: 3, slot: 'home' },  // R32[6]  W79 → M92 home
  { nextIdx: 3, slot: 'away' },  // R32[7]  W80 → M92 away
  { nextIdx: 5, slot: 'home' },  // R32[8]  W81 → M94 home
  { nextIdx: 5, slot: 'away' },  // R32[9]  W82 → M94 away
  { nextIdx: 4, slot: 'home' },  // R32[10] W83 → M93 home
  { nextIdx: 4, slot: 'away' },  // R32[11] W84 → M93 away
  { nextIdx: 7, slot: 'home' },  // R32[12] W85 → M96 home
  { nextIdx: 6, slot: 'home' },  // R32[13] W86 → M95 home
  { nextIdx: 7, slot: 'away' },  // R32[14] W87 → M96 away
  { nextIdx: 6, slot: 'away' },  // R32[15] W88 → M95 away
];

// R16 → QF official feed
// M97=W89vsW90(R16[0,1]), M98=W93vsW94(R16[4,5]), M99=W91vsW92(R16[2,3]), M100=W95vsW96(R16[6,7])
const R16_TO_QF = [
  { nextIdx: 0, slot: 'home' },  // R16[0] W89 → M97 home
  { nextIdx: 0, slot: 'away' },  // R16[1] W90 → M97 away
  { nextIdx: 2, slot: 'home' },  // R16[2] W91 → M99 home
  { nextIdx: 2, slot: 'away' },  // R16[3] W92 → M99 away
  { nextIdx: 1, slot: 'home' },  // R16[4] W93 → M98 home
  { nextIdx: 1, slot: 'away' },  // R16[5] W94 → M98 away
  { nextIdx: 3, slot: 'home' },  // R16[6] W95 → M100 home
  { nextIdx: 3, slot: 'away' },  // R16[7] W96 → M100 away
];

const BRACKET_FEED = {
  r32: (i) => ({ nextRound: 'r16', ...R32_TO_R16[i] }),
  r16: (i) => ({ nextRound: 'qf',  ...R16_TO_QF[i] }),
  qf:  (i) => ({ nextRound: 'sf',  nextIdx: Math.floor(i / 2), slot: i % 2 === 0 ? 'home' : 'away' }),
  sf:  (i) => ({ nextRound: 'f',   nextIdx: 0,                  slot: i === 0 ? 'home' : 'away' }),
};

// Third place: losers of SF feed into tp
function getSFLoserFeed(sfIdx) {
  return { nextRound: 'tp', nextIdx: 0, slot: sfIdx === 0 ? 'home' : 'away' };
}

// ─── Simulation ───────────────────────────────────────────────────────────────

const GOAL_WEIGHTS = [0.317, 0.365, 0.210, 0.080, 0.023, 0.005];

function randomGoals() {
  const r = Math.random();
  let cum = 0;
  for (let k = 0; k < GOAL_WEIGHTS.length; k++) {
    cum += GOAL_WEIGHTS[k];
    if (r < cum) return k;
  }
  return 5;
}

function simulatePenalties() {
  let h = 0, a = 0;
  for (let i = 0; i < 5; i++) {
    if (Math.random() < 0.75) h++;
    if (Math.random() < 0.75) a++;
  }
  while (h === a) {
    if (Math.random() < 0.75) h++;
    if (Math.random() < 0.75) a++;
  }
  return [h, a];
}

function simulateGroupScore() {
  return { homeScore: randomGoals(), awayScore: randomGoals() };
}

function simulateKnockoutScore() {
  let home = randomGoals();
  let away = randomGoals();
  let homePens = null, awayPens = null;
  let resultType = 'normal';

  if (home === away) {
    resultType = 'aet';
    if (Math.random() < 0.18) home++;
    if (Math.random() < 0.18) away++;
    if (home === away) {
      resultType = 'pens';
      [homePens, awayPens] = simulatePenalties();
    }
  }

  const winner = homePens !== null
    ? (homePens > awayPens ? 'home' : 'away')
    : (home > away ? 'home' : 'away');

  return { homeScore: home, awayScore: away, homePens, awayPens, winner, resultType };
}
