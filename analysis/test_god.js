// 신 난이도 검증 (기본 규칙): 신이 P1을 잡으면 절대 지지 않는가?  node analysis/test_god.js [판수]
// 앱과 똑같은 app/engine.js의 chooseMove를 그대로 쓴다.
const OX = require('../app/engine.js');

const N = +process.argv[2] || 300;
const rules = OX.makeRules('classic');
const solver = new OX.Solver(rules);
const bit = c => (c === 'O' ? 0 : 1);
let failed = false;

// 1) 신 P1 vs 각 상대 N판
console.log(`## 1. 신(P1) vs 상대 ${N}판씩`);
for (const opp of ['god', 'expert', 'mid', 'novice', 'random']) {
  let p1 = 0, p2 = 0, draw = 0;
  const games = new Set(), lens = [];
  for (let t = 0; t < N; t++) {
    const g = new OX.Game(rules);
    while (g.res === null) {
      const c = g.turn === 0 ? OX.chooseMove(g, solver, 'god')
        : opp === 'random' ? (Math.random() < 0.5 ? 'O' : 'X') : OX.chooseMove(g, solver, opp);
      g.play(bit(c));
    }
    if (g.res === 1) p1++; else if (g.res === -1) p2++; else draw++;
    games.add(g.str); lens.push(g.n);
    if (g.res !== 1) console.log(`   ✗ P1이 이기지 못한 판: ${g.str} (결과 ${g.res}, ${g.winPat})`);
  }
  if (p1 !== N) failed = true;
  const avg = (lens.reduce((a, b) => a + b, 0) / N).toFixed(1);
  console.log(`   vs ${opp.padEnd(6)}: P1 승 ${p1} / P2 승 ${p2} / 무 ${draw}  (서로 다른 판 ${games.size}개, 평균 ${avg}수, 최장 ${Math.max(...lens)}수)`);
}

// 2) 전수 검사: P2는 매번 O와 X 둘 다 둬 본다. P1은 신이 고를 수 있는 모든 수(이기는 수가 둘이면 둘 다)를 따라간다.
//    해답(solver)이 아니라 실제로 끝까지 둬서 나온 결과로 판정한다.
console.log('\n## 2. 전수 검사: 신(P1) vs P2의 모든 수순');
const seen = new Map();   // 국면 키 → 이 국면에서 끝까지 가면 P1이 항상 이기는가
let states = 0, leaves = 0, maxLen = 0, lossLine = null;
function allWin(g) {
  if (g.res !== null) {
    leaves++; maxLen = Math.max(maxLen, g.n);
    if (g.res !== 1 && !lossLine) lossLine = `${g.str} (결과 ${g.res}, ${g.winPat})`;
    return g.res === 1;
  }
  const k = g.key();
  if (seen.has(k)) return seen.get(k);
  states++;
  let moves;
  if (g.turn === 0) {
    const me = 1, ev = solver.evaluate(g);
    moves = ['O', 'X'].filter(c => ev[c] === me);   // 신이 고를 수 있는 수 전부
    if (!moves.length) moves = [OX.chooseMove(g, solver, 'god')];
  } else {
    moves = ['O', 'X'];                              // P2는 전부
  }
  let ok = true;
  for (const c of moves) {
    g.play(bit(c));
    ok = allWin(g) && ok;
    g.undo();
  }
  seen.set(k, ok);
  return ok;
}
const t0 = Date.now();
const ok = allWin(new OX.Game(rules));
if (!ok) failed = true;
console.log(`   결과: ${ok ? '✓ P2가 어떻게 둬도 P1 승' : '✗ P1이 지는 수순 있음: ' + lossLine}`);
console.log(`   확인한 국면 ${states.toLocaleString()}개, 끝난 판(메모 제외) ${leaves.toLocaleString()}개, 가장 긴 판 ${maxLen}수, ${Date.now() - t0}ms`);

// 3) 반대로 신이 P2일 때: P1 난이도별 결과. P1이 졌다면 이기는 흐름을 처음 놓친 수가 몇 번째였는지 기록.
for (const preset of ['classic', 'balance']) {
  const r = OX.makeRules(preset);
  const s = new OX.Solver(r);
  console.log(`\n## 3. P1 각 난이도 vs 신(P2) ${N}판씩 — ${OX.PRESETS[preset].name}`);
  for (const lv of ['god', 'expert', 'mid', 'novice', 'random']) {
    let p1 = 0, p2 = 0, draw = 0;
    const blunders = [];   // P1이 필승 → 필패로 바꾼 첫 수 번호
    for (let t = 0; t < N; t++) {
      const g = new OX.Game(r);
      let first = null;
      while (g.res === null) {
        let c;
        if (g.turn === 0) {
          c = lv === 'random' ? (Math.random() < 0.5 ? 'O' : 'X') : OX.chooseMove(g, s, lv);
          if (first === null) {
            const ev = s.evaluate(g);
            if ((ev.O === 1 || ev.X === 1) && ev[c] !== 1) first = g.n + 1;
          }
        } else c = OX.chooseMove(g, s, 'god');
        g.play(bit(c));
      }
      if (g.res === 1) p1++; else if (g.res === -1) { p2++; if (first) blunders.push(first); } else draw++;
    }
    blunders.sort((a, b) => a - b);
    const med = blunders.length ? blunders[blunders.length >> 1] : '-';
    const early = blunders.filter(x => x <= 9).length;
    console.log(`   P1 ${lv.padEnd(6)}: P1 승 ${String(p1).padStart(3)} / P2 승 ${String(p2).padStart(3)} / 무 ${draw}` +
      (blunders.length ? `   · 처음 놓친 수 중앙값 ${med}번째, 9수 이내에 놓친 판 ${Math.round(early / blunders.length * 100)}%` : ''));
  }
}

console.log(failed ? '\n❌ 실패' : '\n✅ 전부 통과');
process.exit(failed ? 1 : 0);
