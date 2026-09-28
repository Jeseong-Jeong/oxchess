// AI 난이도 검증: 각 단계끼리 붙여서 실력 순서가 맞는지 확인.  node analysis/ai_levels.js
const OX = require('../app/engine.js');

const LEVELS = ['random', 'onlyO', 'novice', 'mid', 'expert', 'god'];
const N = +process.argv[2] || 400;

function move(g, s, lvl) {
  if (lvl === 'random') return Math.random() < 0.5 ? 'O' : 'X';
  if (lvl === 'onlyO') return 'O';
  return OX.chooseMove(g, s, lvl);
}

for (const preset of ['classic', 'balance']) {
  const rules = OX.makeRules(preset);
  const solver = new OX.Solver(rules);
  console.log(`\n## ${OX.PRESETS[preset].name} — 행 = P1, 열 = P2, 값 = P1 승률`);
  console.log('P1\\P2'.padEnd(8) + LEVELS.map(l => l.padStart(8)).join(''));
  for (const a of LEVELS) {
    let row = a.padEnd(8);
    for (const b of LEVELS) {
      let w = 0;
      for (let t = 0; t < N; t++) {
        const g = new OX.Game(rules);
        while (g.res === null) g.play(move(g, solver, g.turn === 0 ? a : b) === 'O' ? 0 : 1);
        if (g.res === 1) w++;
      }
      row += ((w / N) * 100).toFixed(0).padStart(7) + '%';
    }
    console.log(row);
  }
}
