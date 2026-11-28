import json, glob, os, re, sys, bisect
from run import sim, toks, key, cols
from match import nz
REPO = '/home/claude/lexeikon'; FIRST = {1: 1012, 2: 2018, 3: 3004}
d = json.load(open(REPO + '/data/srz.json'))
rows = [l.rstrip('\n').split('\t') for l in open('srz.tsv')]
P = {int(os.path.basename(f)[:-5]): json.load(open(f)) for f in glob.glob('g/*.json')}
order = [(s, bi) for s in sorted(P) for bi in range(len(P[s])) if not P[s][bi].get('cont')]
pos = {o: k for k, o in enumerate(order)}; bykey = {key(s, P[s][bi]): (s, bi) for s, bi in order}
anch = {}
for i, e in enumerate(d['entries']):
    m = re.search(r'\x12([^;\x13]*)', e[1])
    if m and m.group(1) in bykey: anch[i] = pos[bykey[m.group(1)]]
used = set(anch.values())
def reg(s): return (s // 1000, s >= 3848)
RA = {}
for i, q in anch.items(): RA.setdefault(reg(order[q][0]), []).append(i)
for v in RA.values(): v.sort()
cand = []; TH = float(sys.argv[2]) if len(sys.argv) > 2 else 0.7
for i, r in enumerate(rows):
    if i in anch or '\x12' in d['entries'][i][1] or not r[4].isdigit(): continue
    pg = int(r[4]); n = nz(r[0]).replace(' ', ''); A = RA.get(reg(pg), [])
    k = bisect.bisect(A, i); lo = anch[A[k - 1]] if k else -1; hi = anch[A[k]] if k < len(A) else 10**9
    if lo >= hi: lo, hi = -1, 10**9
    for s in (pg, pg - 1, pg + 1):
        for bi, b in enumerate(P.get(s, [])):
            if b.get('cont'): continue
            q = pos[(s, bi)]
            if q in used or not (lo < q < hi) or abs(q - (lo if lo >= 0 else q)) > 60: continue
            T = toks(b['head'])
            if not T: continue
            x = sim(r[0], b) - (0 if s == pg else 0.08)
            if x < 0.55 and abs(len(T[0]) - len(n)) > 2: continue   # weak match: lengths must agree
            if x >= (TH if T[0][:1] == n[:1] else TH + 0.1): cand.append((x, i, s, bi))   # OCR often spoils the first letter
cand.sort(reverse=True); new = {}
for x, i, s, bi in cand:
    if i in new or pos[(s, bi)] in used: continue
    new[i] = (s, bi); used.add(pos[(s, bi)])
print('new', len(new))
if sys.argv[1:2] == ['dry']:
    import random; random.seed(4)
    for i in random.sample(sorted(new), min(40, len(new))): s, bi = new[i]; print(rows[i][0], '|', P[s][bi]['head'][:45])
else:
    allo = [(s, bi) for s in sorted(P) for bi in range(len(P[s]))]; ix = {o: k for k, o in enumerate(allo)}
    for i, (s, bi) in new.items():
        segs = [key(s, P[s][bi])]; k = ix[(s, bi)] + 1
        while k < len(allo) and P[allo[k][0]][allo[k][1]].get('cont') and allo[k][0] - s <= 1:
            segs.append(key(allo[k][0], P[allo[k][0]][allo[k][1]])); k += 1
        v = s // 1000; lab = 'Срезн. Доп.' if s >= 3848 else 'Срезн. ' + ['', 'I', 'II', 'III'][v]
        t = d['entries'][i][1].split('\n'); t[-1] = '\x0b%s, Col. %s\x0c\x12%s\x13' % (lab, cols(segs, FIRST[v]), ';'.join(segs))
        d['entries'][i][1] = '\n'.join(t)
    json.dump(d, open(REPO + '/data/srz.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print('total', sum('\x12' in e[1] for e in d['entries']))
