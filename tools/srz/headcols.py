# Left column number of every scan, read from the running head (OCR digits) and smoothed:
# within a run of pages the offset col-2*scan is constant; a running median removes OCR errors.
# usage: python3 headcols.py  -> colmap.json {scan: left column}
import glob, json, os, re, subprocess, tempfile
from multiprocessing import Pool
from PIL import Image

def num(scan):
    g = 'g/%d.png' % scan
    im = Image.open(g if os.path.exists(g) else '/home/claude/lexeikon/data/srz-scan/s%d.webp' % scan).convert('L')
    best = None
    for box in [(0, 0, 220, 140), (1020, 0, 1240, 140)]:
        cr = im.crop(box); cr = cr.resize((cr.width * 2, cr.height * 2))
        f = tempfile.NamedTemporaryFile(suffix='.png', delete=False).name; cr.save(f)
        t = subprocess.run(['tesseract', f, '-', '--psm', '6', '-c', 'tessedit_char_whitelist=0123456789'],
                           capture_output=True, text=True).stdout
        os.unlink(f)
        m = re.findall(r'\d{1,4}', t)
        if m:
            v = int(m[0]) - (1 if box[0] else 0)   # right head = left + 1
            if best is None: best = v
    return scan, best

if __name__ == '__main__':
    scans = sorted(int(os.path.basename(p)[:-4]) for p in glob.glob('g/*.png'))
    if os.path.exists('rawheads.json'): raw = {int(k): v for k, v in json.load(open('rawheads.json')).items()}
    else:
        with Pool(os.cpu_count()) as p: raw = dict(p.map(num, scans))
        json.dump(raw, open('rawheads.json', 'w'))
    out = {}
    for vol in (1, 2, 3):
        S = [s for s in scans if s // 1000 == vol]
        off = {s: raw[s] - 2 * s for s in S if raw[s] and raw[s] % 2 == 1}
        # trusted: offset equal to the most common one among neighbours (±4 scans)
        # trusted: same offset as the previous or the next recognised scan (two equal OCR errors in a row are unlikely)
        K = sorted(off); tr = {}
        for j, s in enumerate(K):
            nb = [off[K[j + d]] for d in (-1, 1) if 0 <= j + d < len(K) and abs(K[j + d] - s) <= 3]
            w = [off[t] for t in K if abs(t - s) <= 8]
            if off[s] in nb and w.count(off[s]) == max(w.count(v) for v in set(w)): tr[s] = off[s]
        T = sorted(tr)
        for s in S:
            nxt = [t for t in T if t >= s]; prv = [t for t in T if t < s]
            if nxt or prv: out[s] = 2 * s + tr[nxt[0] if nxt else prv[-1]]
    json.dump(out, open('colmap.json', 'w'))
    bad = [(s, raw[s], out.get(s)) for s in scans if raw[s] != out.get(s)]
    print(len(out), 'of', len(scans), 'disagree', len(bad), bad[:60])
