# Entries that are a variant/second headword of an already cut block: share that block.
import json, glob, os, re, sys, difflib
from run import key, cols
from match import nz
REPO = '/home/claude/lexeikon'; FIRST = {1: 1012, 2: 2018, 3: 3004}
d = json.load(open(REPO + '/data/srz.json'))
rows = [l.rstrip('\n').split('\t') for l in open('srz.tsv')]
P = {int(os.path.basename(f)[:-5]): json.load(open(f)) for f in glob.glob('g/*.json')}
def headtoks(h):
    # headword zone: capitalised words only (headwords are set in capitals), up to the first lowercase word
    out = []
    for w in re.split(r'[\s,;.()=—:-]+', h):
        if not w: continue
        up = sum(c.isupper() or c.isdigit() for c in w) / len(w)
        if up < 0.7: break
        t = nz(w)
        if len(t) >= 2: out.append(t)
    return out
TH = float(sys.argv[2]) if len(sys.argv) > 2 else 0.85
new = {}
for i, r in enumerate(rows):
    if '\x12' in d['entries'][i][1] or not r[4].isdigit(): continue
    pg = int(r[4]); nn = nz(r[0]).replace(' ', ''); best = (0, None)
    if len(nn) < 3: continue
    for s in (pg, pg - 1, pg + 1):
        for bi, b in enumerate(P.get(s, [])):
            if b.get('cont'): continue
            T = headtoks(b['head'])
            for j in range(len(T)):
                for k in (1, 2, 3):
                    c = ''.join(T[j:j + k])
                    if c[:1] != nn[:1] or abs(len(c) - len(nn)) > 1: continue
                    x = difflib.SequenceMatcher(None, nn, c).ratio() - (0 if s == pg else 0.05)
                    if x > best[0]: best = (x, (s, bi))
    if best[0] >= 0.999: new[i] = best[1]
print('new', len(new))
if sys.argv[1] == 'dry':
    import random; random.seed(7)
    for i in random.sample(sorted(new), 20): s, bi = new[i]; print(rows[i][0], '|', P[s][bi]['head'][:60])
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
