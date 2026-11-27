# Re-match all entries from cached blocks with strict acceptance; rebuild srz.json from git HEAD.
import json, glob, os, re, subprocess
import run
from run import sim, toks, key, cols
from match import nz
REPO = '/home/claude/lexeikon'
FIRST = {1: 1012, 2: 2018, 3: 3004}
d = json.loads(subprocess.run(['git', '-C', REPO, 'show', 'b3952b0:data/srz.json'], capture_output=True, text=True).stdout)
rows = [l.rstrip('\n').split('\t') for l in open('srz.tsv')]
P = {int(os.path.basename(f)[:-5]): json.load(open(f)) for f in glob.glob('g/*.json')}
def ok(n, b, sc):
    T = toks(b['head']); a = nz(n).replace(' ', '')
    return sc >= 0.72 and T and T[0][:2] == a[:2]
cand = []
for i, r in enumerate(rows):
    if '\x12' in d['entries'][i][1] or not r[4].isdigit(): continue
    pg = int(r[4])
    for s in (pg, pg - 1, pg + 1):
        for bi, b in enumerate(P.get(s, [])):
            if b.get('cont'): continue
            sc = sim(r[0], b) - (0 if s == pg else 0.08)
            if ok(r[0], b, sc): cand.append((sc, i, s, bi))
cand.sort(reverse=True); res = {}; used = set()
for sc, i, s, bi in cand:
    if i in res or (s, bi) in used: continue
    res[i] = (s, bi); used.add((s, bi))
order = [(s, bi) for s in sorted(P) for bi in range(len(P[s]))]; idx = {o: k for k, o in enumerate(order)}
for i, (s, bi) in res.items():
    segs = [key(s, P[s][bi])]; k = idx[(s, bi)] + 1
    while k < len(order) and P[order[k][0]][order[k][1]].get('cont') and order[k][0] - s <= 1:
        segs.append(key(order[k][0], P[order[k][0]][order[k][1]])); k += 1
    v = s // 1000; lab = 'Срезн. Доп.' if s >= 3848 else 'Срезн. ' + ['', 'I', 'II', 'III'][v]
    t = d['entries'][i][1].split('\n')
    t[-1] = '\x0b%s, Col. %s\x0c\x12%s\x13' % (lab, cols(segs, FIRST[v]), ';'.join(segs))
    d['entries'][i][1] = '\n'.join(t)
json.dump(d, open(REPO + '/data/srz.json', 'w'), ensure_ascii=False, separators=(',', ':'))
subprocess.run(['python3', 'fixcols.py', REPO + '/data/srz.json'])   # ranges for the А entries too
ref = set(int(g[1:].split(':')[0]) for e in d['entries'] for m in re.findall(r'\x12([^\x13]*)\x13', e[1]) for g in m.split(';'))
rm = [f for f in glob.glob(REPO + '/data/srz-scan/s*.webp') if int(os.path.basename(f)[1:5]) not in ref and int(os.path.basename(f)[1:5]) > 1030]
for f in rm: os.unlink(f)
print('new', len(res), 'total', sum('\x12' in e[1] for e in d['entries']), 'of', len(d['entries']), 'removed webp', len(rm))
