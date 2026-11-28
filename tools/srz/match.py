import seg,subprocess,difflib,re,json,sys
from PIL import Image
MAP=str.maketrans({'Ѣ':'Ъ','З':'У','8':'У','Ѧ':'Я','Ѥ':'Е','Є':'Е','Ꙗ':'Я','Ѡ':'О','Ѫ':'У','І':'И','Ї':'И','Ѵ':'И','Ы':'Ъ','Г':'Г','Т':'Г','Ь':'Ъ','Й':'И'})
def nz(s):
    s=s.upper().replace('ОУ','У').replace('Ꙋ','У').translate(MAP)
    return re.sub(r'[^А-ЯЁ ]','',s)
def ocr(im,box):
    x0,y0,x1,y1=box;cr=im.crop(box).resize(((x1-x0)*2,(y1-y0)*2));cr.save('/tmp/l.png')
    return subprocess.run(['tesseract','/tmp/l.png','-','-l','rus','--psm','7'],capture_output=True,text=True).stdout.strip()
def page(path,scan,names):
    W,H,gx,R=seg.segment(path);im=Image.open(path).convert('L');K=1000/W
    blocks=[]
    for ci,c in enumerate(R):
        L=c['lines'];st=c['starts'];bot=L[-1][1]
        for k,i in enumerate(st):
            s=L[i][0];e=L[st[k+1]][0]-2 if k+1<len(st) else bot+3
            blocks.append(dict(col=ci,y0=s-8,y1=e,x0=c['x0']-4,x1=c['x1']+2,head=ocr(im,(L[i][2]-3,L[i][0]-3,c['x1'],L[i][1]+3))))
        # lines before first start in column = continuation
        if not st and len(L)>1: blocks.append(dict(col=ci,y0=L[1][0]-4,y1=bot+3,x0=c['x0']-4,x1=c['x1']+2,head='',cont=1))   # whole column runs on
        if st and st[0]>1: blocks.insert(len(blocks)-len(st),dict(col=ci,y0=L[1][0]-4,y1=L[st[0]][0]-2,x0=c['x0']-4,x1=c['x1']+2,head='',cont=1))
    out={}
    def toks(h):
        h=re.split(r'\s[—-]|\s=|=',h)[0] if h else ''
        return [t for t in re.split(r'[\s,;:.()]+',nz(h)) if t]
    BT=[toks(b['head']) for b in blocks]
    sc=[]
    for n in names:
        nn=' '.join(nz(n).split())
        for bi,b in enumerate(blocks):
            if b.get('cont'):continue
            T=BT[bi];k=len(nn.split());best=0
            for j in range(min(len(T),4)):
                best=max(best,difflib.SequenceMatcher(None,nn,' '.join(T[j:j+k])).ratio()-0.15*j)
            sc.append((best,n,bi))
    sc.sort(reverse=True);used=set()
    for r,n,bi in sc:
        if n in out or bi in used:continue
        out[n]=(r,bi);used.add(bi)
    for r,n,bi in sc:
        if n not in out: out[n]=(r,bi)
    segs={}
    for n,(r,bi) in out.items():
        b=blocks[bi];segs[n]=(r,b['col'],'s%d:%d,%d,%d,%d'%(scan,round(b['x0']*K),round(b['y0']*K),round(b['x1']*K),round(b['y1']*K)))
    return blocks,segs
if __name__=='__main__':
    names=[l.split('\t')[0] for l in open('srz.tsv') if l.split('\t')[4]=='1014']
    B,S=page('1014.jpg',1014,names)
    for n,v in S.items():print(n,v)
