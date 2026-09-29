// OX체스 게임 엔진 + AI. 브라우저(window.OX)와 node(module.exports) 둘 다에서 동작.
(function (root) {
  'use strict';

  const MAXLEN = 40;
  const O = 0, X = 1;
  const CH = ['O', 'X'];

  // 패턴 인덱스: O=0, X=1, 첫 글자가 최상위 비트 ('OOO'=0, 'OOX'=1, ... 'XXX'=7)
  const P3 = [], P5 = [];
  for (let i = 0; i < 8; i++) P3.push(idxToStr(i, 3));
  for (let i = 0; i < 32; i++) P5.push(idxToStr(i, 5));
  function idxToStr(i, len) {
    let s = '';
    for (let k = len - 1; k >= 0; k--) s += CH[(i >> k) & 1];
    return s;
  }

  const PRESETS = {
    classic: { name: '기본 규칙', p2: 4, p1: 2, house: 3, housePats: ['OOO', 'XXX'] },
    balance: { name: '밸런스 패치', p2: 4, p1: 2, house: 3, housePats: ['OOO', 'XXX', 'OXO', 'XOX'] },
  };

  function makeRules(presetKey) {
    const p = PRESETS[presetKey] || PRESETS.classic;
    const th3 = new Int8Array(8);
    for (let i = 0; i < 8; i++) th3[i] = p.housePats.includes(P3[i]) ? p.house : p.p2;
    return { key: presetKey in PRESETS ? presetKey : 'classic', th3, th5: p.p1 };
  }

  class Game {
    constructor(rules) {
      this.rules = rules;
      this.reset();
    }

    reset() {
      this.s = [];          // 0/1 배열
      this.n = 0;
      this.c3 = new Int8Array(8);
      this.l3 = new Int8Array(8).fill(-99);   // 마지막으로 인정된 시작 위치
      this.c5 = new Int8Array(32);
      this.l5 = new Int8Array(32).fill(-99);
      this.undoStack = [];
      this.res = null;      // null 진행 / 1 P1 승 / -1 P2 승 / 0 무승부
      this.winPat = null;
    }

    // 지금 차례: 0 = P1, 1 = P2
    get turn() { return this.n & 1; }
    get str() { return this.s.map(b => CH[b]).join(''); }

    play(bit) {
      const s = this.s;
      s.push(bit);
      const n = ++this.n;
      const rec = { i3: -1, old3: 0, i5: -1, old5: 0, res: this.res, winPat: this.winPat };
      let hit3 = -1, hit5 = -1;
      if (n >= 3) {
        const p = n - 3;
        const i = (s[p] << 2) | (s[p + 1] << 1) | s[p + 2];
        if (p >= this.l3[i] + 3) {
          rec.i3 = i; rec.old3 = this.l3[i];
          this.c3[i]++; this.l3[i] = p; hit3 = i;
        }
      }
      if (n >= 5) {
        const p = n - 5;
        const i = (s[p] << 4) | (s[p + 1] << 3) | (s[p + 2] << 2) | (s[p + 3] << 1) | s[p + 4];
        if (p >= this.l5[i] + 5) {
          rec.i5 = i; rec.old5 = this.l5[i];
          this.c5[i]++; this.l5[i] = p; hit5 = i;
        }
      }
      // 게임은 첫 승리 조건에서 멈추므로 방금 늘어난 패턴만 보면 됨. 동시에 만족되면 P2 우선.
      if (hit3 >= 0 && this.c3[hit3] >= this.rules.th3[hit3]) { this.res = -1; this.winPat = P3[hit3]; }
      else if (hit5 >= 0 && this.c5[hit5] >= this.rules.th5) { this.res = 1; this.winPat = P5[hit5]; }
      else if (n >= MAXLEN) { this.res = 0; this.winPat = null; }
      this.undoStack.push(rec);
    }

    undo() {
      const rec = this.undoStack.pop();
      if (!rec) return;
      if (rec.i3 >= 0) { this.c3[rec.i3]--; this.l3[rec.i3] = rec.old3; }
      if (rec.i5 >= 0) { this.c5[rec.i5]--; this.l5[rec.i5] = rec.old5; }
      this.res = rec.res; this.winPat = rec.winPat;
      this.s.pop(); this.n--;
    }

    clone() {
      const g = new Game(this.rules);
      for (const b of this.s) g.play(b);
      return g;
    }

    // 전치표 키: 앞으로의 진행에 영향을 주는 정보만 (길이, 마지막 4글자, 횟수, 겹침 차단 상태)
    key() {
      const n = this.n, s = this.s;
      let k = n * 16;
      for (let j = Math.max(0, n - 4); j < n; j++) k = k * 2 + s[j];
      let out = k.toString(36) + ':';
      for (let i = 0; i < 8; i++) {
        const b = this.l3[i] + 3 - (n - 2);
        out += (this.c3[i] * 3 + (b > 0 ? b : 0)).toString(36);
      }
      out += ':';
      for (let i = 0; i < 32; i++) {
        const b = this.l5[i] + 5 - (n - 4);
        const v = this.c5[i] * 5 + (b > 0 ? b : 0);
        if (v) out += i.toString(36) + v;
      }
      return out;
    }

    counts3() { return P3.map((p, i) => ({ pat: p, count: this.c3[i], need: this.rules.th3[i] })); }
    counts5() { return P5.map((p, i) => ({ pat: p, count: this.c5[i], need: this.rules.th5 })); }

    // 지금 차례인 사람이 O/X를 뒀을 때 즉시 결과 (체크 판정용)
    preview() {
      const out = {};
      for (const b of [O, X]) {
        if (this.res !== null) { out[CH[b]] = null; continue; }
        this.play(b);
        out[CH[b]] = { res: this.res, winPat: this.winPat };
        this.undo();
      }
      return out;
    }

    // 0 진행 / 2 체크 / 3 체크메이트 / 4 종료 / 5 무승부
    status() {
      if (this.res === 0) return { code: 5 };
      if (this.res !== null) return { code: 4 };
      const pv = this.preview();
      const me = this.turn === 0 ? 1 : -1;
      const danger = ['O', 'X'].filter(c => pv[c].res === -me);
      if (danger.length === 2) return { code: 3, danger, pv };
      if (danger.length === 1) return { code: 2, danger, pv };
      return { code: 1, pv };
    }
  }

  // ---------- AI ----------
  // 완전 탐색(승/패만) + 전치표. 값은 P1 관점 (+1 P1 필승, -1 P2 필승, 0 무승부).
  class Solver {
    constructor(rules) {
      this.rules = rules;
      this.tt = new Map();
    }

    value(g) {
      if (g.res !== null) return g.res;
      const k = g.key();
      const hit = this.tt.get(k);
      if (hit !== undefined) return hit;
      const max = g.turn === 0;
      const goal = max ? 1 : -1;
      let best = max ? -2 : 2;
      // 즉시 이기는 수를 먼저
      let order = [O, X];
      g.play(X); const quick = g.res === goal; g.undo();
      if (quick) order = [X, O];
      for (const b of order) {
        g.play(b);
        const v = this.value(g);
        g.undo();
        if (max ? v > best : v < best) best = v;
        if (best === goal) break;
      }
      this.tt.set(k, best);
      if (this.tt.size > 6e6) this.tt.clear();
      return best;
    }

    // 각 수의 값: { O: v, X: v }
    evaluate(g) {
      const out = {};
      for (const b of [O, X]) { g.play(b); out[CH[b]] = this.value(g); g.undo(); }
      return out;
    }
  }

  // 지는 국면에서 쓸 휴리스틱: 무작위 진행 시 내가 이기는 비율
  function rolloutScore(g, bit, me, n, rng) {
    let wins = 0;
    for (let t = 0; t < n; t++) {
      const h = g.clone();
      h.play(bit);
      while (h.res === null) h.play(rng() < 0.5 ? O : X);
      if (h.res === me) wins++;
    }
    return wins / n;
  }

  // 몇 수(한 글자 = 1수) 앞까지만 읽는 탐색. 값은 me 관점: 빨리 이길수록 크고, 늦게 질수록 덜 나쁨. 못 본 곳은 0.
  function lookahead(g, depth, me) {
    if (g.res !== null) return g.res === 0 ? 0 : (g.res === me ? 100 - g.n : g.n - 100);
    if (depth === 0) return 0;
    const mine = (g.turn === 0 ? 1 : -1) === me;
    let best = mine ? -Infinity : Infinity;
    for (const b of [O, X]) {
      g.play(b);
      const v = lookahead(g, depth - 1, me);
      g.undo();
      best = mine ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  }

  // 상대가 최근 k번 연속으로 같은 글자를 뒀는가
  function opponentRepeats(g, k) {
    let seen = null, count = 0;
    for (let i = g.n - 1; i >= 0 && count < k; i -= 2, count++) {
      if (seen === null) seen = g.s[i];
      else if (g.s[i] !== seen) return false;
    }
    return count === k;
  }

  function lookaheadMove(g, depth, me, pick) {
    const score = {};
    for (const b of [O, X]) { g.play(b); score[CH[b]] = lookahead(g, depth - 1, me); g.undo(); }
    if (score.O === score.X) return pick(['O', 'X']);
    return score.O > score.X ? 'O' : 'X';
  }

  // 난이도: 몇 수 앞을 보는가
  const LEVELS = {
    novice: { name: '하수', depth: '2수', note: '2수 앞까지 보지만 자주 실수해요.' },
    mid: { name: '중수', depth: '3~4수', note: '3~4수 앞을 보지만 가끔 실수해요.' },
    expert: { name: '고수', depth: '5~6수', note: '5~6수 앞을 보고 실수하지 않아요.' },
    god: { name: '신', depth: '끝까지', note: '끝까지 전부 계산해요. 이길 수 있는 판은 절대 놓치지 않아요.' },
  };
  // 실수 = 그 수에서는 1수 앞(바로 지는 수 피하기)만 보고 둠. 단계 간격이 고르도록 대전 통계로 맞춘 값 (analysis/ai_levels.js)
  const NOVICE_MISTAKE = 0.3;
  // 한 글자만 누르는 꼼수를 알아챌 확률. 꼼수 쪽이 P1(선공)일 때 하수 약 85%, 중수 약 90% 승리하도록 맞춘 값
  const NOVICE_NOTICE_REPEAT = 0.8;
  const MID_NOTICE_REPEAT = 0.5;
  const MID_MISTAKE = 0.1;

  function chooseMove(g, solver, level, rng = Math.random) {
    const me = g.turn === 0 ? 1 : -1;
    const pv = g.preview();
    const safe = ['O', 'X'].filter(c => pv[c].res !== -me);
    const pick = arr => arr[Math.floor(rng() * arr.length)];

    if (level === 'novice') {
      // 상대가 한 글자만 계속 누르면(꼼수) 대개 알아채고 그 수만 실수 없이 조금 더 멀리 본다
      if (opponentRepeats(g, 3) && rng() < NOVICE_NOTICE_REPEAT) return lookaheadMove(g, 3, me, pick);
      if (rng() < NOVICE_MISTAKE) return lookaheadMove(g, 1, me, pick);
      return lookaheadMove(g, 2, me, pick);
    }
    if (level === 'mid') {
      if (opponentRepeats(g, 3) && rng() < MID_NOTICE_REPEAT) return lookaheadMove(g, 4, me, pick);
      if (rng() < MID_MISTAKE) return lookaheadMove(g, 1, me, pick);
      return lookaheadMove(g, rng() < 0.5 ? 3 : 4, me, pick);
    }
    if (level === 'expert') return lookaheadMove(g, rng() < 0.5 ? 5 : 6, me, pick);

    // 신: 끝까지 계산
    const ev = solver.evaluate(g);
    const good = ['O', 'X'].filter(c => ev[c] === me);
    if (good.length) return pick(good);
    const draw = ['O', 'X'].filter(c => ev[c] === 0);
    if (draw.length) return pick(draw);

    // 지는 국면: 바로 지는 수는 피하고, 버티기 좋은 쪽
    if (safe.length === 1) return safe[0];
    const cands = safe.length ? safe : ['O', 'X'];
    const sO = rolloutScore(g, O, me, 60, rng), sX = rolloutScore(g, X, me, 60, rng);
    return sO === sX ? pick(cands) : (sO > sX ? 'O' : 'X');
  }

  const api = { MAXLEN, P3, P5, PRESETS, LEVELS, makeRules, Game, Solver, chooseMove, CH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OX = api;
})(typeof window !== 'undefined' ? window : globalThis);
