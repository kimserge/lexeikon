# Rewrite 'Col. N' of every Sreznevsky reference from its segments (adds 'N–M' for run-on entries).
import json, re, sys
from run import cols
FIRST = {1: 1012, 2: 2018, 3: 3004}
p = sys.argv[1]; d = json.load(open(p)); n = 0
def fix(m):
    global n
    segs = m.group(2).split(';'); s0 = int(segs[0][1:].split(':')[0]); v = s0 // 1000
    c = cols(segs, FIRST[v]); n += '–' in c
    lab = 'Срезн. Доп.' if s0 >= 3848 else 'Срезн. ' + ['', 'I', 'II', 'III'][v]   # III 3848ff = Дополнения, own columns
    return '\x0b%s, Col. %s\x0c\x12%s\x13' % (lab, c, m.group(2))
for e in d['entries']:
    if '\x12' in e[1]:
        e[1] = re.sub(r'\x0b(Срезн\. (?:[IV]+|Доп\.)), Col\. [\d–]+\x0c\x12([^\x13]*)\x13', fix, e[1])
json.dump(d, open(p, 'w'), ensure_ascii=False, separators=(',', ':'))
print('ranges', n)
