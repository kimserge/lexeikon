# Generalised runA.py + runA2.py: one letter (or several) of one volume.
# usage: python3 run.py VOL.pdf ROMAN FIRSTSCAN LETTERS SCAN0 SCAN1 [REPO]
#   e.g. python3 run.py tom1.pdf I 1012 Б 1029 1123
# ROMAN = volume numeral in the reference ("I"), FIRSTSCAN = scan of column 1-2.
# PDF page p of the volume = scan VOLBASE+p (VOLBASE = 1000*vol).
import json, os, re, sys, glob, subprocess, difflib, tempfile
from multiprocessing import Pool
import numpy as np
from PIL import Image
import match
from match import nz

if __name__ == "__main__":
    pdf, ROMAN, FIRST, LET, S0, S1 = sys.argv[1:7]
    FIRST, S0, S1 = int(FIRST), int(S0), int(S1)
    REPO = sys.argv[7] if len(sys.argv) > 7 else os.path.abspath("../..")
    BASE = S0 // 1000 * 1000
    OUT = REPO + "/data/srz-scan"
    os.makedirs("g", exist_ok=True); os.makedirs("pdf", exist_ok=True)
K = 1000 / 1240

def ocr(im, box):
    x0, y0, x1, y1 = box
    cr = im.crop(box).resize(((x1 - x0) * 2, (y1 - y0) * 2))
    f = tempfile.NamedTemporaryFile(suffix='.png', delete=False).name
    cr.save(f)
    r = subprocess.run(['tesseract', f, '-', '-l', 'rus', '--psm', '7'], capture_output=True, text=True).stdout.strip()
    os.unlink(f)
    return r
match.ocr = ocr

def prep(scan):
    g = 'g/%d.png' % scan
    if not os.path.exists(g):
        p = scan - BASE
        pre = 'pdf/q%d' % scan
        subprocess.run(['pdfimages', '-f', str(p), '-l', str(p), '-png', pdf, pre], check=True)
        src = sorted(glob.glob(pre + '-*.png'), key=os.path.getsize)[-1]
        im = Image.open(src).convert('L'); w = 1240
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        a = np.array(im).astype(float); q = np.digitize(a, [90, 150, 205])
        lv = np.array([0, 95, 175, 255], 'uint8')[q]
        Image.fromarray(lv).save(g)
        for f in glob.glob(pre + '-*.png'): os.unlink(f)
    w = OUT + '/s%d.webp' % scan
    if not os.path.exists(w):
        Image.open(g).save(w, 'WEBP', lossless=True)
    return g

def okhead(h):
    # a real entry start: headword (OCR often reads small caps as lowercase) followed by '—', '=' or ':';
    # false starts are run-on lines beginning with a dash, or short scraps
    h = h.strip(); t = re.split(r'[\s,—=-]+', h)[0] if h else ''
    if not t or h[:1] in '—-–': return False
    if len(t) >= 2 and sum(c.isupper() for c in t) >= len(t) * 0.6: return True
    return len(t) >= 3 and bool(re.search(r'[—=:]', h[:60]))

def blocks(scan):
    g = prep(scan)
    cache = 'g/%d.json' % scan
    if os.path.exists(cache): return scan, json.load(open(cache))
    B, _ = match.page(g, scan, [])
    M = []
    for b in B:
        if not b.get('cont') and not okhead(b['head']) and M and M[-1]['col'] == b['col']:
            M[-1]['y1'] = b['y1']; continue
        if not b.get('cont') and not okhead(b['head']) and not M: b['cont'] = 1
        M.append(b)
    json.dump(M, open(cache, 'w'), ensure_ascii=False)
    return scan, M

def toks(h):
    h = h.lstrip('*•"\'«|.,:;!^ ') if h else h      # '*' marks new words in the supplement
    h = re.split(r'\s[—-]|\s=|=', h)[0] if h else ''
    return [t for t in re.split(r'[\s,;:.()]+', nz(h)) if t]

def sim(n, b):
    T = toks(b['head']); nn = ' '.join(nz(n).split()); k = len(nn.split()); best = 0
    for j in range(min(len(T), 4)):
        best = max(best, difflib.SequenceMatcher(None, nn, ' '.join(T[j:j + k])).ratio() - 0.15 * j)
    return best

CMAP = {int(k): v for k, v in json.load(open('colmap.json')).items()} if os.path.exists('colmap.json') else {}

def cols(segs, first):
    # column of every segment (left/right half of the scan); 'a' or 'a–b' if the entry runs on.
    # Left column of a scan from colmap.json (running heads, headcols.py), else from its position.
    def left(s): return CMAP.get(s, 2 * (s - first) + 1)
    c = sorted({left(int(g[1:].split(':')[0])) + (int(g.split(':')[1].split(',')[0]) >= 300) for g in segs})
    return str(c[0]) if len(c) == 1 else '%d–%d' % (c[0], c[-1])

def key(scan, b):
    return 's%d:%d,%d,%d,%d' % (scan, round(b['x0'] * K), round(b['y0'] * K), round(b['x1'] * K), round(b['y1'] * K))

if __name__ == '__main__':
    rows = [l.rstrip('\n').split('\t') for l in open('srz.tsv')]
    with Pool(os.cpu_count()) as pool:
        P = dict(pool.map(blocks, range(S0, S1 + 1)))
    A = [(i, r) for i, r in enumerate(rows) if r[0][:1] in LET and r[4].isdigit() and S0 <= int(r[4]) <= S1]
    cand = []
    for i, r in A:
        pg = int(r[4])
        for s in (pg, pg - 1, pg + 1):
            if s not in P: continue
            for bi, b in enumerate(P[s]):
                if b.get('cont'): continue
                cand.append((sim(r[0], b) - (0 if s == pg else 0.08), i, s, bi))
    cand.sort(reverse=True)
    res = {}; used = set()
    for sc, i, s, bi in cand:
        if i in res or (s, bi) in used or sc < 0.55: continue
        res[i] = (s, bi, sc); used.add((s, bi))
    for sc, i, s, bi in cand:
        if i not in res and sc >= 0.62: res[i] = (s, bi, sc)
    unm = [r[0] for i, r in A if i not in res]
    order = [(s, bi) for s in sorted(P) for bi, b in enumerate(P[s])]
    idx = {o: k for k, o in enumerate(order)}
    out = {}
    for i, (s, bi, sc) in res.items():
        b = P[s][bi]; segs = [key(s, b)]; col = 2 * (s - FIRST) + 1 + b['col']
        k = idx[(s, bi)] + 1
        while k < len(order):
            s2, b2 = order[k]; bb = P[s2][b2]
            if bb.get('cont'): segs.append(key(s2, bb)); k += 1
            else: break
        out[i] = (cols(segs, FIRST), ';'.join(segs))
    p = REPO + '/data/srz.json'; d = json.load(open(p))
    for i, (col, sg) in out.items():
        t = d['entries'][i][1].split('\n')
        t[-1] = '\x0bСрезн. %s, Col. %s\x0c\x12%s\x13' % (ROMAN, col, sg)
        d['entries'][i][1] = '\n'.join(t)
    json.dump(d, open(p, 'w'), ensure_ascii=False, separators=(',', ':'))
    low = sorted((round(v[2], 2), rows[i][0]) for i, v in res.items() if v[2] < 0.65)
    json.dump(dict(letters=LET, scans=[S0, S1], entries=len(A), matched=len(out), unmatched=unm, low=low),
              open('report_%s.json' % LET, 'w'), ensure_ascii=False, indent=0)
    print('matched', len(out), 'of', len(A), 'unmatched', len(unm))
