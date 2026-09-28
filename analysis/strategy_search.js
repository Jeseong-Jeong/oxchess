// 사람이 외울 수 있는 필승 전략 찾기.
// "최근 k글자 → 다음 수" 규칙표 하나로, 상대의 모든 응수에 대해 이기는 전략이 있는지 백트래킹으로 찾는다.
// 사용: node analysis/strategy_search.js <classic|balance> <P1|P2> <kMax>
const OX = require('../app/engine.js');

const preset = process.argv[2] || 'classic';
const sideName = process.argv[3] || 'P1';
const kMax = +process.argv[4] || 6;
const rules = OX.makeRules(preset);
const solver = new OX.Solver(rules);
const side = sideName === 'P1' ? 0 : 1;
const goal = side === 0 ? 1 : -1;
const bit = c => (c === 'O' ? 0 : 1);

function childValue(g, c) { g.play(bit(c)); const v = solver.value(g); g.undo(); return v; }

// 규칙표 키: 최근 k글자 (앞쪽이 모자라면 있는 만큼). 첫 수는 O/X 대칭이라 O로 고정.
function searchPolicy(k, budget) {
  const policy = new Map();
  const trail = [];
  let nodes = 0;
  function abs(g) { return g.str.slice(-k) + '|' + Math.min(g.n, k); }
  function node(g) {
    if (++nodes > budget) throw new Error('budget');
    if (g.res !== null) return g.res === goal;
    if (g.turn !== side) {
      for (const c of ['O', 'X']) { g.play(bit(c)); const ok = node(g); g.undo(); if (!ok) return false; }
      return true;
    }
    if (g.n === 0) { g.play(0); const ok = node(g); g.undo(); return ok; }
    const a = abs(g);
    if (policy.has(a)) {
      const c = policy.get(a);
      if (childValue(g, c) !== goal) return false;
      g.play(bit(c)); const ok = node(g); g.undo(); return ok;
    }
    const cands = ['O', 'X'].filter(c => childValue(g, c) === goal);
    for (const c of cands) {
      const mark = trail.length;
      policy.set(a, c); trail.push(a);
      g.play(bit(c)); const ok = node(g); g.undo();
      if (ok) return true;
      while (trail.length > mark) policy.delete(trail.pop());
    }
    return false;
  }
  try {
    const g = new OX.Game(rules);
    if (side === 1) {
      // P2: P1의 첫 수 O/X 대칭 → O만 보면 됨
      g.play(0);
    }
    const ok = node(g);
    return { ok, policy, nodes };
  } catch (e) { return { ok: null, policy, nodes }; }
}

console.log(`## ${OX.PRESETS[preset].name} · ${sideName} · 시작 국면 값 ${solver.value(new OX.Game(rules))}`);
for (let k = 1; k <= kMax; k++) {
  const t = Date.now();
  const r = searchPolicy(k, 3e7);
  const status = r.ok === true ? '✓ 찾음' : r.ok === false ? '✗ 없음(탐색 범위 내)' : '? 시간 초과';
  console.log(`k=${k}: ${status}  규칙 ${r.policy.size}개, 노드 ${r.nodes.toLocaleString()}, ${Date.now() - t}ms`);
  if (r.ok) {
    const rows = [...r.policy.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [a, c] of rows) console.log(`   ${a.split('|')[0].padStart(k, '·')} → ${c}`);
    break;
  }
}
