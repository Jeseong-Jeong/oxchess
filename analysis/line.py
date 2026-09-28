"""Principal variation + how forgiving the current rules are."""
import random
from solver import *

rules = make_rules(4, 3, 2, True)
v, d, m, g, val = solve(rules)

def why(st):
    s, c3, _, c5, _ = st
    for i, (c, t) in enumerate(zip(c3, g.th3)):
        if c >= t: return f'P2 승 ({P3[i]} {c}회)'
    for i, c in enumerate(c5):
        if c >= g.th5: return f'P1 승 ({P5[i]} {c}회)'
    return '무승부'

# principal variation, and at each ply: is the choice forced (only one move keeps the value)?
st = g.initial()
line = []
while g.result(st) is None:
    n = len(st[0]); p1 = n % 2 == 0
    a, b = val(g.play(st, 'O')), val(g.play(st, 'X'))
    ch = ('O' if a >= b else 'X') if p1 else ('O' if a <= b else 'X')
    sign = lambda x: (x > 0) - (x < 0)
    forced = sign(a) != sign(b)
    line.append((n + 1, 'P1' if p1 else 'P2', ch, 'O:' + '+-0'[[1, -1, 0].index(sign(a))], 'X:' + '+-0'[[1, -1, 0].index(sign(b))], '★유일' if forced else ''))
    st = g.play(st, ch)
print('최적 수순:', st[0], '→', why(st))
for row in line: print(*row)

# How often is P1 in a spot where exactly one move keeps the win (along random P2 play vs perfect P1)?
rng = random.Random(7)
tot = forced = 0
p1wins = 0
for _ in range(3000):
    st = g.initial()
    while g.result(st) is None:
        n = len(st[0])
        if n % 2 == 0:
            a, b = val(g.play(st, 'O')), val(g.play(st, 'X'))
            if max(a, b) > 0:
                tot += 1
                forced += (a > 0) != (b > 0)
            ch = 'O' if a >= b else 'X'
        else:
            ch = rng.choice('OX')
        st = g.play(st, ch)
    p1wins += g.result(st) == 1
print(f'\n완벽P1 vs 랜덤P2: P1 {p1wins/3000:.1%} 승, P1의 이기는 국면 중 "한 수만 정답" 비율 {forced/tot:.1%}')

# perfect P2 vs random P1
rng = random.Random(8); p2wins = 0
for _ in range(3000):
    st = g.initial()
    while g.result(st) is None:
        n = len(st[0])
        if n % 2 == 1:
            a, b = val(g.play(st, 'O')), val(g.play(st, 'X'))
            ch = 'O' if a <= b else 'X'
        else:
            ch = rng.choice('OX')
        st = g.play(st, ch)
    p2wins += g.result(st) == -1
print(f'랜덤P1 vs 완벽P2: P2 {p2wins/3000:.1%} 승')
