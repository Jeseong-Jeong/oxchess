// 오프닝을 B수까지 외우고(완벽), 그 뒤엔 사람 수준(몇 수 앞 읽기)으로 두면 신 상대로 몇 % 이기나?
// + 외울 오프닝 트리를 사람이 읽을 수 있게 출력.
const OX = require('../app/engine.js');
const bit = c => (c === 'O' ? 0 : 1);
const flip = c => (c === 'O' ? 'X' : 'O');
const N = +process.argv[2] || 300;

// 사람 수준: 몇 수 앞까지 실수 없이 읽기 (중수에서 실수를 뺀 것 = 3~4수)
function human(g, depth) {
  const me = g.turn === 0 ? 1 : -1;
  const lv = depth <= 1 ? 'novice' : depth <= 4 ? 'read4' : 'expert';
  if (lv === 'read4') {
    // mid와 같되 실수 없음
    const saved = Math.random; let r = 0.99;
    return OX.chooseMove(g, null, 'mid', () => { const v = r; r = saved(); return v; });
  }
  return OX.chooseMove(g, null, lv);
}

// 외우는 오프닝: 이기는 수가 둘이면 "사람이 기억하기 쉬운 쪽" = 직전 글자와 반대(교대)로 둔다.
function bookMove(g, solver, me) {
  const ev = solver.evaluate(g);
  const good = ['O', 'X'].filter(c => ev[c] === me);
  if (!good.length) return null;
  if (g.n === 0) return 'O';
  const pref = flip(g.str[g.n - 1]);
  return good.includes(pref) ? pref : good[0];
}

for (const [preset, side] of [['classic', 0], ['balance', 1]]) {
  const rules = OX.makeRules(preset);
  const solver = new OX.Solver(rules);
  const me = side === 0 ? 1 : -1;
  console.log(`\n## ${OX.PRESETS[preset].name} · ${side ? 'P2' : 'P1'}(필승 쪽) — 오프닝 B수까지 완벽 + 이후 사람 수준, 상대 = 신, ${N}판`);
  console.log('   B(외운 수까지)   1수앞   3~4수앞   5~6수앞');
  for (const B of [0, 5, 7, 9, 11, 13, 15, 17, 40]) {
    const row = [];
    for (const depth of [1, 4, 6]) {
      let w = 0;
      for (let t = 0; t < N; t++) {
        const g = new OX.Game(rules);
        while (g.res === null) {
          let c;
          if (g.turn === side) c = g.n < B ? (bookMove(g, solver, me) || human(g, depth)) : human(g, depth);
          else c = OX.chooseMove(g, solver, 'god');
          g.play(bit(c));
        }
        if (g.res === me) w++;
      }
      row.push(((w / N) * 100).toFixed(0).padStart(6) + '%');
    }
    console.log(`   ${String(B === 40 ? '전부' : B + '수').padEnd(14)}${row.join('   ')}`);
  }

  // 외울 오프닝 트리 출력 (필승 쪽은 bookMove, 상대는 O/X 모두)
  const depthLimit = side === 0 ? 9 : 10;
  console.log(`\n   오프닝 트리 (${depthLimit}수까지, 필승 쪽 수는 [대괄호])`);
  let lines = 0, exceptions = 0, decisions = 0;
  (function walk(g, prefix) {
    if (g.res !== null || g.n >= depthLimit) { console.log('     ' + prefix + (g.res !== null ? `  → 끝 (${g.winPat})` : '')); lines++; return; }
    if (g.turn === side) {
      const c = bookMove(g, solver, me);
      decisions++;
      if (g.n > 0 && c !== flip(g.str[g.n - 1])) exceptions++;
      g.play(bit(c)); walk(g, prefix + `[${c}]`); g.undo();
    } else {
      for (const c of ['O', 'X']) {
        if (side === 1 && g.n === 0 && c === 'X') continue; // 대칭: P1 첫 수 O만
        g.play(bit(c)); walk(g, prefix + c); g.undo();
      }
    }
  })(new OX.Game(rules), '');
  console.log(`   → 끝까지 ${lines}갈래, 내 결정 ${decisions}번 중 "직전 글자와 반대로" 규칙의 예외 ${exceptions}번`);
}
