import glob, os, run
run.OUT = '/tmp/webp'
from multiprocessing import Pool
S = sorted(int(os.path.basename(p)[:-4]) for p in glob.glob('g/*.png'))
with Pool(os.cpu_count()) as p: p.map(run.blocks, S, chunksize=8)
print('done', len(S))
