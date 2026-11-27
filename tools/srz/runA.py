import json,os,sys,glob
import numpy as np
from PIL import Image
from match import page
rows=[l.rstrip('\n').split('\t') for l in open('srz.tsv')]
OUT='/home/claude/work/root/lexeikon/data/srz-scan'
os.makedirs('g',exist_ok=True)
def prep(i):
    scan=1012+i;src='pdf/p-%03d.png'%i;g='g/%d.png'%scan
    if not os.path.exists(g):
        im=Image.open(src).convert('L');w=1240;im=im.resize((w,round(im.height*w/im.width)),Image.LANCZOS)
        a=np.array(im).astype(float);p=np.digitize(a,[90,150,205]);lv=np.array([0,95,175,255],'uint8')[p]
        Image.fromarray(lv).save(g)
        Image.fromarray(lv).save(OUT+'/s%d.webp'%scan,'WEBP',lossless=True)
    return scan,g
res={};low=[];prevlast=None;report=[]
files=sorted(glob.glob('pdf/p-*.png'))
for i in range(len(files)):
    scan,g=prep(i)
    names=[r[0] for r in rows if r[4]==str(scan) and r[0].startswith('А')]
    if scan>1029: names=[]
    B,S=page(g,scan,names) if names else (None,{})
    c0=2*(scan-1012)+1
    # continuation at top of a column → previous entry
    if B:
        W=1240;K=1000/W
        for b in B:
            if b.get('cont') and prevlast:
                res[prevlast].append('s%d:%d,%d,%d,%d'%(scan,round(b['x0']*K),round(b['y0']*K),round(b['x1']*K),round(b['y1']*K)))
    lastkey=None;lasty=-1
    for n,(sc,col,seg) in S.items():
        res.setdefault(n,[]);res[n]=[seg]+res[n][1:] if False else [seg];res[n+'#col']=c0+col
        if sc<0.6: low.append((scan,n,round(sc,2)))
        y=(col,int(seg.split(',')[1]))
        if y>( lasty if lasty!=-1 else (-1,-1)): lasty=y;lastkey=n
    if names: prevlast=lastkey;report.append((scan,len(names),len([b for b in B if not b.get('cont')])))
json.dump(res,open('resA.json','w'),ensure_ascii=False)
print(report);print('low',low)
