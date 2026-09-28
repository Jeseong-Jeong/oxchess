"""Extra balance knobs: who moves first, wider house rule."""
import sys, time, random
import solver
from solver import *


def solve_order(rules, five_first=True):
    g = Game(rules)
    memo = {}
    par = 0 if five_first else 1  # parity on which the 5-letter side (maximizer) moves

    def val(st):
        r = g.result(st)
        if r is not None:
            return r * (100 - len(st[0]))
        k = g.key(st)
        if k in memo:
            return memo[k]
        a, b = val(g.play(st, 'O')), val(g.play(st, 'X'))
        best = max(a, b) if len(st[0]) % 2 == par else min(a, b)
        memo[k] = best
        return best

    sc = val(g.initial())
    return sc, len(memo)


def rand_stats(rules, n=20000):
    g = Game(rules); rng = random.Random(1); w = 0
    for _ in range(n):
        st = g.initial()
        while g.result(st) is None:
            st = g.play(st, rng.choice('OX'))
        w += g.result(st) == 1
    return w / n


def fmt(sc):
    return '5글자측 필승' if sc > 0 else '3글자측 필승' if sc < 0 else '무승부'


th3, th5 = make_rules(4, 3, 2, True)
wide = ([3 if p in ('OOO', 'XXX', 'OXO', 'XOX') else 4 for p in P3], 2)

jobs = [
    ('현재 규칙, 3글자측이 선공', make_rules(4, 3, 2, True), False),
    ('하우스룰 확장 (OOO·XXX·OXO·XOX = 3회), 5글자측 선공', wide, True),
]
for name, rules, ff in jobs:
    t = time.time()
    sc, m = solve_order(rules, ff)
    print(f'## {name}\n  완벽한 플레이: {fmt(sc)} ({100-abs(sc)}수), 상태 {m:,}개, {time.time()-t:.0f}s')
    # random play doesn't depend on who "moves first" (both random) -> only report for rule change
    print(f'  랜덤 vs 랜덤: 5글자측 {rand_stats(rules):.1%}')
    sys.stdout.flush()
