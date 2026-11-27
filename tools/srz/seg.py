from PIL import Image;import numpy as np,sys
def segment(path):
    im=np.array(Image.open(path).convert('L'));H,W=im.shape
    d=im<150
    # gutter: find vertical rule near middle
    def run(x):
        c=d[:,x];best=cur=0
        for v in c:
            cur=cur+1 if v else 0;best=max(best,cur)
        return best
    rr=[(run(x),x) for x in range(int(W*.42),int(W*.58))]
    gx=max(rr)[1]
    res=[]
    for x0,x1 in [(int(W*.008),gx-4),(gx+12,int(W*.992))]:
        rs=d[:,x0:x1].sum(1);lines=[];inl=False
        for y in range(int(H*.085),int(H*.985)):
            if rs[y]>3 and not inl: inl=True;s=y
            elif rs[y]<=3 and inl:
                inl=False
                if y-s>6: lines.append([s,y])
        L=[]
        for s,e in lines:
            xs=np.where(d[s:e,x0:x1].sum(0)>2)[0]
            if not len(xs):continue
            if xs[-1]-xs[0]<60:continue   # skip tiny (signature marks)
            L.append([s,e,int(xs[0])+x0])
        ys=np.array([l[0] for l in L],float);xs=np.array([l[2] for l in L],float)
        r=np.array([xs[i]-np.median(xs[max(0,i-6):i+7]) for i in range(len(L))])
        starts=[i for i in range(1,len(L)) if r[i]<-8]
        res.append(dict(x0=x0,x1=x1,lines=L,starts=starts))
    return W,H,gx,res
if __name__=='__main__':
    W,H,gx,R=segment(sys.argv[1]);print(W,H,gx)
    for c in R: print(len(c['lines']),[c['lines'][i][0] for i in c['starts']])
