import json,os,re,difflib
from match import page,nz
rows=[l.rstrip('\n').split('\t') for l in open('srz.tsv')]
K=1000/1240
def key(scan,b):return 's%d:%d,%d,%d,%d'%(scan,round(b['x0']*K),round(b['y0']*K),round(b['x1']*K),round(b['y1']*K))
def okhead(h):
    t=re.split(r'[\s,—=-]+',h.strip())[0] if h.strip() else ''
    return len(t)>=2 and sum(c.isupper() for c in t)>=len(t)*0.6
P={}
for scan in range(1012,1031):
    B,_=page('g/%d.png'%scan,scan,[])
    # merge false starts into previous block of same column
    M=[]
    for b in B:
        if not b.get('cont') and not okhead(b['head']) and M and M[-1]['col']==b['col']:
            M[-1]['y1']=b['y1'];continue
        if not b.get('cont') and not okhead(b['head']) and not M: b['cont']=1
        M.append(b)
    P[scan]=M
def toks(h):
    h=re.split(r'\s[—-]|\s=|=',h)[0] if h else ''
    return [t for t in re.split(r'[\s,;:.()]+',nz(h)) if t]
def sim(n,b):
    T=toks(b['head']);nn=' '.join(nz(n).split());k=len(nn.split());best=0
    for j in range(min(len(T),4)):best=max(best,difflib.SequenceMatcher(None,nn,' '.join(T[j:j+k])).ratio()-0.15*j)
    return best
res={};used=set();unm=[]
A=[(i,r) for i,r in enumerate(rows) if r[0].startswith('А') and 1012<=int(r[4] or 0)<=1029]
cand=[]
for i,r in A:
    pg=int(r[4])
    for s in (pg,pg-1,pg+1):
        if s not in P:continue
        for bi,b in enumerate(P[s]):
            if b.get('cont'):continue
            cand.append((sim(r[0],b)-(0 if s==pg else 0.08),i,s,bi))
cand.sort(reverse=True)
for sc,i,s,bi in cand:
    if i in res or (s,bi) in used or sc<0.55:continue
    res[i]=(s,bi,sc);used.add((s,bi))
for sc,i,s,bi in cand:   # second names to same block (e.g. АДАМЪ и АДАМЛЬ ЗАВѢТЪ)
    if i not in res and sc>=0.62: res[i]=(s,bi,sc)
for i,r in A:
    if i not in res: unm.append(r[0])
# segments with continuation into next page/column
order=[(s,bi) for s in sorted(P) for bi,b in enumerate(P[s])]
out={}
for i,(s,bi) in [(i,(v[0],v[1])) for i,v in res.items()]:
    b=P[s][bi];segs=[key(s,b)];col=2*(s-1012)+1+b['col']
    k=order.index((s,bi))+1
    while k<len(order):
        s2,b2=order[k];bb=P[s2][b2]
        if bb.get('cont'):segs.append(key(s2,bb));k+=1
        else:break
    out[i]=(col,';'.join(segs))
p='/home/claude/work/root/lexeikon/data/srz.json';d=json.load(open(p))
for i,(col,sg) in out.items():
    t=d['entries'][i][1].split('\n');t[-1]='\x0bСрезн. I, Col. %d\x0c\x12%s\x13'%(col,sg);d['entries'][i][1]='\n'.join(t)
json.dump(d,open(p,'w'),ensure_ascii=False,separators=(',',':'))
print('matched',len(out),'of',len(A),'unmatched',len(unm),unm)
