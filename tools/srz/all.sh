set -e
python3 strict.py | tail -1
python3 align.py write 0.5 | tail -1
python3 relax.py write 0.55 | tail -1
python3 shared.py write | tail -1
python3 - <<'P'
import json,re,os,random
from PIL import Image
R='/home/claude/lexeikon'
d=json.load(open(R+'/data/srz.json'))['entries']
ref=set(int(g[1:].split(':')[0]) for e in d for m in re.findall(r'\x12([^\x13]*)\x13',e[1]) for g in m.split(';'))
for s in ref:
    w=R+'/data/srz-scan/s%d.webp'%s
    if not os.path.exists(w): Image.open('g/%d.png'%s).save(w,'WEBP',lossless=True)
for f in os.listdir(R+'/data/srz-scan'):
    s=int(f[1:5])
    if s>1030 and s not in ref: os.unlink(R+'/data/srz-scan/'+f)
random.seed(13);E=[(e[0],re.search(r'\x12([^;\x13]*)',e[1]).group(1)) for e in d if '\x12' in e[1] and not e[1].count('Срезн. I,')]
o=Image.new('L',(640,42*16),255)
for k,(hw,g) in enumerate(random.sample(E,16)):
    s,b=g.split(':');x0,y0,x1,y1=map(int,b.split(','));K=1.24;print(k,hw)
    o.paste(Image.open('g/%s.png'%s[1:]).crop((int(x0*K),int(y0*K),int(x0*K)+620,int(y0*K)+40)),(0,42*k))
o.save('/tmp/fin.png')
P
