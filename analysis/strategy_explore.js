// 사람이 쓸 수 있는 전략 탐색: 완벽한 수순의 모양 + 단순 규칙의 실전 승률.
const OX = require('../app/engine.js');
const bit = c => (c === 'O' ? 0 : 1);
const flip = c => (c === 'O' ? 'X' : 'O');
const N = 400;

for (const preset of ['classic', 'balance']) {
  const rules = OX.makeRules(preset);
  const solver = new OX.Solver(rules);
  const winnerSide = solver.value(new OX.Game(rules)) === 1 ? 0 : 1;
  console.log(`\n==================== ${OX.PRESETS[preset].name}: 필승 = ${winnerSide ? 'P2' : 'P1'}`);

  // 1) 신 vs 신: 이기는 패턴 분포, 대표 수순
  const pats = {}, lines = {};
  for (let t = 0; t < 600; t++) {
    const g = new OX.Game(rules);
    while (g.res === null) g.play(bit(OX.chooseMove(g, solver, 'god')));
    pats[g.winPat] = (pats[g.winPat] || 0) + 1;
    lines[g.str] = (lines[g.str] || 0) + 1;
  }
  console.log('신 vs 신 이기는 패턴:', Object.entries(pats).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p, c]) => `${p}×${c}`).join(' '));
  console.log('대표 수순:'); Object.entries(lines).sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([s, c]) => console.log('  ', s, c));

  // 2) 필승 쪽의 "정답이 하나뿐인 자리" 통계: 전략 트리 (상대는 모든 수, 필승 쪽은 이기는 수 전부)
  const me = winnerSide === 0 ? 1 : -1;
  const ruleHit = {}, ruleTot = {}; let crit = 0, total = 0;
  const critByPly = {};
  const seen = new Set();
  const RULES = {
    '상대 따라두기(직전 글자와 같게)': g => g.str.slice(-1) || 'O',
    '반대로 두기(직전 글자와 반대)': g => flip(g.str.slice(-1) || 'X'),
    '내 직전 수와 같게': g => g.str.slice(-2, -1) || 'O',
    '내 직전 수와 반대': g => flip(g.str.slice(-2, -1) || 'X'),
    '두 칸 전 글자와 같게(2주기)': g => g.str.slice(-2, -1) || 'O',
    '다섯 칸 전 글자 따라하기(5주기 복사)': g => g.n >= 5 ? g.str[g.n - 5] : null,
    '세 칸 전 글자 따라하기(3주기 복사)': g => g.n >= 3 ? g.str[g.n - 3] : null,
  };
  (function walk(g) {
    if (g.res !== null) return;
    const k = g.key(); if (seen.has(k)) return; seen.add(k);
    if (g.turn !== winnerSide) { for (const b of [0, 1]) { g.play(b); walk(g); g.undo(); } return; }
    const ev = solver.evaluate(g);
    const good = ['O', 'X'].filter(c => ev[c] === me);
    total++;
    if (good.length === 1) {
      crit++; critByPly[g.n + 1] = (critByPly[g.n + 1] || 0) + 1;
      for (const [name, f] of Object.entries(RULES)) {
        const c = f(g); if (!c) continue;
        ruleTot[name] = (ruleTot[name] || 0) + 1;
        if (c === good[0]) ruleHit[name] = (ruleHit[name] || 0) + 1;
      }
    }
    for (const c of good) { g.play(bit(c)); walk(g); g.undo(); }
  })(new OX.Game(rules));
  console.log(`필승 쪽 결정 자리 ${total}개 중 정답이 하나뿐인 자리 ${crit}개 (${(crit / total * 100).toFixed(0)}%)`);
  console.log('정답 하나뿐인 자리, 몇 번째 수인지:', Object.entries(critByPly).sort((a, b) => a[0] - b[0]).slice(0, 14).map(([p, c]) => `${p}수:${c}`).join(' '));
  console.log('그 자리에서 단순 규칙이 정답을 맞힌 비율:');
  for (const name of Object.keys(RULES)) if (ruleTot[name]) console.log(`   ${name}: ${(ruleHit[name] / ruleTot[name] * 100).toFixed(0)}%`);
}
