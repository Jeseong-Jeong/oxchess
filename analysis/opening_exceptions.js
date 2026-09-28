// "기본 규칙 + 예외 목록" 형태의 오프닝: 기본 규칙이 지는 수가 되는 자리만 골라 외우게 한다.
const OX = require('../app/engine.js');
const bit = c => (c === 'O' ? 0 : 1);
const flip = c => (c === 'O' ? 'X' : 'O');
const N = 300;

const RULE = {
  alt: { name: '반대로 두기', f: g => flip(g.str[g.n - 1] || 'X') },
  same: { name: '한 글자 고집', f: g => g.str[g.n - 2] || 'O' },
  copy3: { name: '세 칸 전 따라하기', f: g => g.str[g.n - 3] || flip(g.str[g.n - 1] || 'X') },
};

function read4(g) {
  let first = true;
  return OX.chooseMove(g, null, 'mid', () => { if (first) { first = false; return 0.99; } return Math.random(); });
}

for (const [preset, side, ruleKey] of [['classic', 0, 'alt'], ['balance', 1, 'copy3']]) {
  const rules = OX.makeRules(preset);
  const solver = new OX.Solver(rules);
  const me = side === 0 ? 1 : -1;
  const rule = RULE[ruleKey];
  // 예외 자리: 오프닝 트리에서 규칙대로 두면 필승이 깨지는 국면
  const exceptions = new Map();
  function collect(g, D) {
    if (g.res !== null || g.n >= D) return;
    if (g.turn === side) {
      const ev = solver.evaluate(g);
      let c = g.n === 0 ? 'O' : rule.f(g);
      if (ev[c] !== me) { c = flip(c); exceptions.set(g.str, c); }
      g.play(bit(c)); collect(g, D); g.undo();
    } else for (const c of ['O', 'X']) {
      if (g.n === 0 && c === 'X') continue;
      g.play(bit(c)); collect(g, D); g.undo();
    }
  }
  console.log(`\n## ${OX.PRESETS[preset].name} · ${side ? 'P2' : 'P1'} · 기본 규칙 "${rule.name}"`);
  for (const D of side === 0 ? [9, 11, 13] : [10, 12, 14]) {
    exceptions.clear();
    collect(new OX.Game(rules), D);
    // 성능: 오프닝(규칙+예외, D수까지) 후 3~4수 읽기, 상대 = 신
    const pol = g => {
      if (g.n < D) {
        if (g.n === 0) return 'O';
        if (exceptions.has(g.str)) return exceptions.get(g.str);
        // 오프닝 트리 밖(상대 첫 수가 X 등): 대칭으로 뒤집어 본다
        const mir = g.str.replace(/./g, flip);
        if (exceptions.has(mir)) return flip(exceptions.get(mir));
        return rule.f(g);
      }
      return read4(g);
    };
    let w = 0;
    for (let t = 0; t < N; t++) {
      const g = new OX.Game(rules);
      while (g.res === null) g.play(bit(g.turn === side ? pol(g) : OX.chooseMove(g, solver, 'god')));
      if (g.res === me) w++;
    }
    console.log(`   ${D}수까지: 예외 ${exceptions.size}개 → 이후 3~4수 읽기로 신 상대 ${(w / N * 100).toFixed(0)}%`);
    if (D === (side === 0 ? 9 : 10)) {
      for (const [s, c] of [...exceptions.entries()].sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0])))
        console.log(`      ${s.padEnd(D)} 다음 ${s.length + 1}번째 수 → ${c}  (규칙대로면 ${flip(c)})`);
    }
  }
}
