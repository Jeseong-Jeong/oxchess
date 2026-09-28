// 사람이 바로 쓸 수 있는 단순 규칙의 실전 승률. 모든 규칙에 "안전 규칙"(바로 이기는 수는 두고, 바로 지는 수는 피함)을 붙인다.
const OX = require('../app/engine.js');
const bit = c => (c === 'O' ? 0 : 1);
const flip = c => (c === 'O' ? 'X' : 'O');
const N = +process.argv[2] || 300;

const BASE = {
  '반대로 두기 (상대 글자의 반대)': g => flip(g.str[g.n - 1] || 'X'),
  '따라 두기 (상대 글자와 같게)': g => g.str[g.n - 1] || 'O',
  '한 글자만 고집 (내 직전 수와 같게)': g => g.str[g.n - 2] || 'O',
  '세 칸 전 글자 따라하기': g => g.str[g.n - 3] || flip(g.str[g.n - 1] || 'X'),
  '무작위 (안전 규칙만)': () => (Math.random() < 0.5 ? 'O' : 'X'),
};

function withSafety(rule) {
  return g => {
    const me = g.turn === 0 ? 1 : -1;
    const pv = g.preview();
    const win = ['O', 'X'].filter(c => pv[c].res === me);
    if (win.length) return win[0];
    const safe = ['O', 'X'].filter(c => pv[c].res !== -me);
    const c = rule(g);
    return safe.length === 1 ? safe[0] : c;
  };
}

function read4(g) {
  let first = true;
  return OX.chooseMove(g, null, 'mid', () => { if (first) { first = false; return 0.99; } return Math.random(); });
}

for (const preset of ['classic', 'balance']) {
  const rules = OX.makeRules(preset);
  const solver = new OX.Solver(rules);
  const opps = { '신': g => OX.chooseMove(g, solver, 'god'), '3~4수 읽는 사람': read4, '안전 규칙만': withSafety(BASE['무작위 (안전 규칙만)']) };
  for (const side of [0, 1]) {
    const me = side === 0 ? 1 : -1;
    console.log(`\n## ${OX.PRESETS[preset].name} · 내가 ${side ? 'P2' : 'P1'} — 규칙별 승률`);
    console.log('   ' + '규칙'.padEnd(26) + Object.keys(opps).map(o => ('vs ' + o).padStart(16)).join(''));
    for (const [name, rule] of Object.entries(BASE)) {
      const pol = withSafety(rule);
      const cells = [];
      for (const opp of Object.values(opps)) {
        let w = 0;
        for (let t = 0; t < N; t++) {
          const g = new OX.Game(rules);
          while (g.res === null) g.play(bit(g.turn === side ? pol(g) : opp(g)));
          if (g.res === me) w++;
        }
        cells.push(((w / N) * 100).toFixed(0).padStart(15) + '%');
      }
      console.log('   ' + name.padEnd(26) + cells.join(''));
    }
  }
}
