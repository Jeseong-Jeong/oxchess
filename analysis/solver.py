"""OX체스 solver: exact minimax + random/1-ply playouts, with rule variants."""
import sys, random, itertools
from functools import lru_cache

sys.setrecursionlimit(10000)

P3 = [''.join(p) for p in itertools.product('OX', repeat=3)]
P5 = [''.join(p) for p in itertools.product('OX', repeat=5)]
IDX3 = {p: i for i, p in enumerate(P3)}
IDX5 = {p: i for i, p in enumerate(P5)}
MAXLEN = 40


def make_rules(p2=4, house=3, p1=2, house_on=True):
    th3 = [(house if (house_on and p in ('OOO', 'XXX')) else p2) for p in P3]
    return th3, p1


class Game:
    """Incremental state. s = string, c3/c5 counts, l3/l5 last accepted start (-99 none)."""

    def __init__(self, rules):
        self.th3, self.th5 = rules

    def initial(self):
        return ('', (0,) * 8, (-99,) * 8, (0,) * 32, (-99,) * 32)

    def play(self, st, ch):
        s, c3, l3, c5, l5 = st
        s = s + ch
        n = len(s)
        if n >= 3:
            p = n - 3
            i = IDX3[s[p:]]
            if p >= l3[i] + 3:
                c3 = c3[:i] + (c3[i] + 1,) + c3[i + 1:]
                l3 = l3[:i] + (p,) + l3[i + 1:]
        if n >= 5:
            p = n - 5
            i = IDX5[s[p:]]
            if p >= l5[i] + 5:
                c5 = c5[:i] + (c5[i] + 1,) + c5[i + 1:]
                l5 = l5[:i] + (p,) + l5[i + 1:]
        return (s, c3, l3, c5, l5)

    def result(self, st):
        """None ongoing, +1 P1 win, -1 P2 win, 0 draw."""
        s, c3, _, c5, _ = st
        if any(c >= t for c, t in zip(c3, self.th3)):
            return -1
        if any(c >= self.th5 for c in c5):
            return 1
        if len(s) >= MAXLEN:
            return 0
        return None

    def key(self, st):
        s, c3, l3, c5, l5 = st
        n = len(s)
        # last accepted start only matters while it can still block: p >= l+L with p up to n-L+1
        b3 = tuple(max(0, l + 3 - (n - 2)) for l in l3)
        b5 = tuple(max(0, l + 5 - (n - 4)) for l in l5)
        return (n, s[-4:], c3, b3, c5, b5)


def solve(rules):
    g = Game(rules)
    memo = {}

    # score: P1 win = 100 - length (faster better), P2 win = -(100 - length), draw = 0
    def val(st):
        r = g.result(st)
        if r is not None:
            return r * (100 - len(st[0]))
        k = g.key(st)
        if k in memo:
            return memo[k]
        a, b = val(g.play(st, 'O')), val(g.play(st, 'X'))
        best = max(a, b) if len(st[0]) % 2 == 0 else min(a, b)
        memo[k] = best
        return best

    sc = val(g.initial())
    v = (sc > 0) - (sc < 0)
    return v, (100 - abs(sc)) if v else MAXLEN, len(memo), g, val


def playout(g, pol1, pol2, rng):
    st = g.initial()
    while True:
        r = g.result(st)
        if r is not None:
            return r, len(st[0])
        pol = pol1 if len(st[0]) % 2 == 0 else pol2
        st = g.play(st, pol(g, st, rng))


def pol_random(g, st, rng):
    return rng.choice('OX')


def pol_1ply(g, st, rng):
    """Win now if possible, avoid losing immediately, else random (= what the 체크 UI tells you)."""
    me = 1 if len(st[0]) % 2 == 0 else -1
    outs = {ch: g.result(g.play(st, ch)) for ch in 'OX'}
    wins = [c for c, r in outs.items() if r == me]
    if wins:
        return rng.choice(wins)
    safe = [c for c, r in outs.items() if r != -me]
    return rng.choice(safe or 'OX')


def stats(rules, pol1, pol2, n=20000, seed=1):
    g = Game(rules)
    rng = random.Random(seed)
    w1 = w2 = dr = 0
    lens = []
    for _ in range(n):
        r, L = playout(g, pol1, pol2, rng)
        lens.append(L)
        if r == 1: w1 += 1
        elif r == -1: w2 += 1
        else: dr += 1
    lens.sort()
    return w1 / n, w2 / n, dr / n, sum(lens) / n, lens[n // 2]


if __name__ == '__main__':
    import time
    variants = [
        ('현재 규칙 (4 / 하우스3 / 2)', make_rules(4, 3, 2, True)),
        ('하우스룰 없음 (4 / - / 2)', make_rules(4, 4, 2, False)),
        ('P2=5, 하우스3', make_rules(5, 3, 2, True)),
        ('P2=4, 하우스룰 4 (=없음)', make_rules(4, 4, 2, True)),
        ('P2=3, 하우스3', make_rules(3, 3, 2, True)),
    ]
    which = sys.argv[1:] and [variants[int(a)] for a in sys.argv[1:]] or variants
    for name, rules in which:
        t = time.time()
        v, d, m, g, _ = solve(rules)
        res = {1: 'P1 필승', -1: 'P2 필승', 0: '무승부'}[v]
        rr = stats(rules, pol_random, pol_random)
        o1 = stats(rules, pol_1ply, pol_1ply)
        print(f'## {name}')
        print(f'  완벽한 플레이: {res}, {d}수 만에 끝남 (탐색 상태 {m:,}개, {time.time()-t:.1f}s)')
        print(f'  랜덤 vs 랜덤:   P1 {rr[0]:.1%}  P2 {rr[1]:.1%}  무 {rr[2]:.1%}  평균 {rr[3]:.1f}수 (중앙값 {rr[4]})')
        print(f'  1수앞 vs 1수앞: P1 {o1[0]:.1%}  P2 {o1[1]:.1%}  무 {o1[2]:.1%}  평균 {o1[3]:.1f}수 (중앙값 {o1[4]})')
        sys.stdout.flush()
