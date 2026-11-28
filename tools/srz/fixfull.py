# Add whole-column continuation blocks (columns without any entry start) to the cached blocks.
import glob, json, os, seg
from multiprocessing import Pool
def fix(p):
    scan = int(os.path.basename(p)[:-5]); B = json.load(open(p))
    if len({b['col'] for b in B}) == 2: return 0
    W, H, gx, R = seg.segment('g/%d.png' % scan); n = 0
    for ci, c in enumerate(R):
        L = c['lines']
        if any(b['col'] == ci for b in B) or len(L) < 2: continue
        B.append(dict(col=ci, y0=L[1][0] - 4, y1=L[-1][1] + 3, x0=c['x0'] - 4, x1=c['x1'] + 2, head='', cont=1)); n += 1
    if n:
        B.sort(key=lambda b: (b['col'], b['y0'])); json.dump(B, open(p, 'w'), ensure_ascii=False)
    return n
with Pool(os.cpu_count()) as pool: r = pool.map(fix, sorted(glob.glob('g/*.json')))
print('added', sum(r), 'on', sum(1 for x in r if x), 'scans')
