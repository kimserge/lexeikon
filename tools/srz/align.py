# Fill gaps between strict matches by order: entries (index order) between two anchors <-> free blocks (reading order) between them.
import json, glob, os, re, subprocess, sys
from run import sim, toks, key, cols
from match import nz
REPO = '/home/claude/lexeikon'
FIRST = {1: 1012, 2: 2018, 3: 3004}
d = json.load(open(REPO + '/data/srz.json'))
rows = [l.rstrip('\n').split('\t') for l in open('srz.tsv')]
P = {int(os.path.basename(f)[:-5]): json.load(open(f)) for f in glob.glob('g/*.json')}
order = [(s, bi) for s in sorted(P) for bi in range(len(P[s])) if not P[s][bi].get('cont')]
pos = {o: k for k, o in enumerate(order)}
bykey = {key(s, P[s][bi]): (s, bi) for s, bi in order}
anch = {}
for i, e in enumerate(d['entries']):
    m = re.search(r'\x12([^;\x13]*)', e[1])
    if m and m.group(1) in bykey: anch[i] = pos[bykey[m.group(1)]]
def reg(s): return (s // 1000, s >= 3848)
A = sorted(anch); mono = sum(anch[A[k]] < anch[A[k + 1]] for k in range(len(A) - 1)) / (len(A) - 1)
used = set(anch.values())
new = {}; MODE = sys.argv[1] if len(sys.argv) > 1 else 'dry'; THR = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
RA = {}
for i in A: RA.setdefault(reg(order[anch[i]][0]), []).append(i)
pairs = [(v[k], v[k + 1]) for v in RA.values() for k in range(len(v) - 1)]
for a, b in pairs:
    pa, pb = anch[a], anch[b]
    if not (pa < pb) or b - a < 2 or pb - pa > 40: continue
    E = [i for i in range(a + 1, b) if rows[i][4].isdigit() and '\x12' not in d['entries'][i][1] and reg(int(rows[i][4])) == reg(order[pa][0])]
    F = [q for q in range(pa + 1, pb) if q not in used]
    if not E or not F: continue
    def w(i, q):
        s, bi = order[q]; T = toks(P[s][bi]['head']); n = nz(rows[i][0]).replace(' ', '')
        if not T or T[0][:1] != n[:1] or abs(s - int(rows[i][4])) > 1: return -1
        x = sim(rows[i][0], P[s][bi]); return x - THR if x >= THR else -1
    W = [[w(i, q) for q in F] for i in E]; n1, n2 = len(E), len(F)
    D = [[0.0] * (n2 + 1) for _ in range(n1 + 1)]
    for x in range(1, n1 + 1):
        for y in range(1, n2 + 1):
            D[x][y] = max(D[x - 1][y], D[x][y - 1], D[x - 1][y - 1] + W[x - 1][y - 1] if W[x - 1][y - 1] >= 0 else -1)
    x, y = n1, n2
    while x and y:
        if W[x - 1][y - 1] >= 0 and D[x][y] == D[x - 1][y - 1] + W[x - 1][y - 1]: new[E[x - 1]] = order[F[y - 1]]; x -= 1; y -= 1
        elif D[x][y] == D[x - 1][y]: x -= 1
        else: y -= 1
print('anchors', len(A), 'monotone', round(mono, 3), 'new', len(new))
if MODE == 'dry':
    import random; random.seed(1)
    from PIL import Image
    sel = random.sample(sorted(new), 12); o = Image.new('L', (640, 42 * 12), 255)
    for j, i in enumerate(sel):
        s, bi = new[i]; b = P[s][bi]; print(rows[i][0], '|', b['head'][:50])
        o.paste(Image.open('g/%d.png' % s).crop((int(b['x0']), int(b['y0']), int(b['x0']) + 620, int(b['y0']) + 40)), (0, 42 * j))
    o.save('/tmp/al.png')
else:
    allo = [(s, bi) for s in sorted(P) for bi in range(len(P[s]))]; ix = {o: k for k, o in enumerate(allo)}
    for i, (s, bi) in new.items():
        segs = [key(s, P[s][bi])]; k = ix[(s, bi)] + 1
        while k < len(allo) and P[allo[k][0]][allo[k][1]].get('cont') and allo[k][0] - s <= 1:
            segs.append(key(*[allo[k][0], P[allo[k][0]][allo[k][1]]])); k += 1
        v = s // 1000; lab = 'Срезн. Доп.' if s >= 3848 else 'Срезн. ' + ['', 'I', 'II', 'III'][v]
        t = d['entries'][i][1].split('\n'); t[-1] = '\x0b%s, Col. %s\x0c\x12%s\x13' % (lab, cols(segs, FIRST[v]), ';'.join(segs))
        d['entries'][i][1] = '\n'.join(t)
    json.dump(d, open(REPO + '/data/srz.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print('total', sum('\x12' in e[1] for e in d['entries']))
