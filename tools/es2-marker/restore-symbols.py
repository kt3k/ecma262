#!/usr/bin/env python3
# Offline symbol-restoration for the ES2 Marker conversion (P4). Marker drops the
# PDF's symbol-font glyphs (− × ∞ π ≥ ≠); the surrounding text survives. For each
# math-dense section this aligns the *local* significant-character streams of the
# Marker body and the PDF section text (local alignment avoids the global
# reordering Marker does) and re-inserts the dropped symbols. Emits a JSON sidecar
# {sectionNumber: patchedBody} the ingester applies before its pipeline. Run with
# the Marker venv libs:
#   PYTHONPATH=.venv/lib/python3.12/site-packages python3 restore-symbols.py 15.8,15.9
import json, re, sys
import pypdfium2 as pdfium

import os, glob
HERE=__file__.rsplit("/",1)[0]
ED=os.environ.get("ED","es2")  # edition: es1 or es2
BASE=f"{HERE}/../../ecma262/{ED}"
SPEC=f"{BASE}/spec.html"
PDF=sorted(glob.glob(f"{BASE}/*.pdf"))[0]
OUT=f"{BASE}/symbol-fixes.json"
SYM={'\x03':'≥','\x04':'−','\x05':'×','\x06':'∞','\x07':'π','\x08':'≠'}
SYMSET=set(SYM.values())

pdf=pdfium.PdfDocument(PDF)
pdftext="".join(pdf[i].get_textpage().get_text_bounded() for i in range(len(pdf)))
pdftext="".join(SYM.get(c,c) for c in pdftext)
pdftext=re.sub(r'-\s*\d{1,3}\s*-\s*(?=\n)',' ',pdftext)  # page footers like '- 83 -'
pdftext="".join(c for c in pdftext if ord(c)>=0x20 or c in "\n\t")  # drop ™/bullet glyphs

ENT={'&lt;':'<','&gt;':'>','&amp;':'&','&nbsp;':' '}
html=open(SPEC).read()

def body_sig(s):
    """significant chars of an HTML fragment -> list of (char, index_in_s)"""
    out=[]; i=0
    while i<len(s):
        if s[i]=='<': i=s.index('>',i)+1; continue
        if s[i]=='&':
            m=re.match(r'&[a-z]+;|&#\d+;',s[i:])
            if m:
                ch=ENT.get(m.group(0),'?')
                if not ch.isspace(): out.append((ch,i))
                i+=len(m.group(0)); continue
        if not s[i].isspace(): out.append((s[i],i))
        i+=1
    return out

def psig_of(t):
    """list of (char, followed_by_space) for non-space chars"""
    out=[]
    for k,c in enumerate(t):
        if c.isspace(): continue
        nxt=t[k+1] if k+1<len(t) else ""
        out.append((c, nxt.isspace()))
    return out
def eq(a,b): return a==b or a.lower()==b.lower()

def align_insert(body, pdf_local):
    """insert symbols from pdf_local into body at aligned positions"""
    ms=body_sig(body); ps=psig_of(pdf_local)
    inserts=[]; seq=0; mi=pi=0; miss=0; count=0
    while mi<len(ms) and pi<len(ps):
        mc,_=ms[mi]; pc,_=ps[pi]
        if eq(mc,pc): mi+=1; pi+=1; miss=0; continue
        if pc in SYMSET:
            # gather a run of consecutive dropped symbols at this point
            run=""; j=pi
            while j<len(ps) and ps[j][0] in SYMSET:
                run+=ps[j][0]; ftrail=ps[j][1]; j+=1
            # guard: the char after the run must equal the current marker char,
            # else the streams are desynced — don't insert into the wrong place.
            if j<len(ps) and not eq(ps[j][0], mc):
                mi+=1; pi+=1; miss+=1
                if miss>15: break
                continue
            if ftrail: run+=" "
            inserts.append((ms[mi][1], seq, run)); seq+=1; count+=len(run.strip())
            pi=j; miss=0
            continue
        found=False
        for d in range(1,5):
            if pi+d<len(ps) and eq(ps[pi+d][0],mc): pi+=d; found=True; break
            if mi+d<len(ms) and eq(ms[mi+d][0],pc): mi+=d; found=True; break
        if not found:
            mi+=1; pi+=1; miss+=1
            if miss>20: break  # stop at desync; keep clean inserts so far
    # apply right-to-left; for equal offset, higher seq first so pdf order is kept
    for off,_s,run in sorted(inserts, key=lambda x:(x[0],x[1]), reverse=True):
        body=body[:off]+run+body[off:]
    return (body, count)

# section split (same heading rule as the ingester)
HEAD=re.compile(r'<(h[1-6])\b[^>]*>([\s\S]*?)</\1>',re.I)
plain=lambda s: re.sub(r'\s+',' ',re.sub(r'<[^>]+>','',s)).replace('&lt;','<').replace('&gt;','>').replace('&amp;','&').strip()
heads=[]
for m in HEAD.finditer(html):
    t=plain(m.group(2)); mm=re.match(r'(\d+(?:\.\d+)*)\s+(\S[\s\S]*)$',t)
    if not mm: continue
    words=mm.group(2).split()
    if len(words)>=4 and all(len(w)==1 for w in words): continue
    heads.append((mm.group(1), mm.group(2), m.start(), m.end()))

want=(sys.argv[1].split(",") if len(sys.argv)>1 else ["15.8","15.9"])
wanted=lambda n: any(n==w or n.startswith(w+".") for w in want)

def sigstr(s,n):
    return "".join(c for c in s if not c.isspace())[:n]
def find_pdf_section(num, title, body):
    """locate this section's body span in the PDF, choosing the occurrence whose
    following text matches the Marker body (skips the table-of-contents hit)."""
    key=num+" "+" ".join(title.split()[:3])
    starts=[m.start() for m in re.finditer(re.escape(key), pdftext)] or            [m.start() for m in re.finditer(re.escape(num+" "+title.split()[0]), pdftext)]
    if not starts: return -1
    want=sigstr(re.sub(r'<[^>]+>','',body),50)
    best=-1; bestscore=-1
    for s in starts:
        after=sigstr(pdftext[s+len(key): s+len(key)+120], 50)
        score=sum(1 for a,b in zip(after,want) if a.lower()==b.lower())
        if score>bestscore: bestscore=score; best=s
    return best

fixes={}; total=0; skipped=[]
for idx,(num,title,hs,he) in enumerate(heads):
    if not wanted(num): continue
    body_end=heads[idx+1][2] if idx+1<len(heads) else len(html)
    body=html[he:body_end]
    if '−' in body or '×' in body or '∞' in body: pass
    a=find_pdf_section(num,title,body)
    if a<0: skipped.append(num+"(no-pdf)"); continue
    # end = next section's heading in pdf
    nb=len(pdftext)
    if idx+1<len(heads):
        n2,t2,_,_=heads[idx+1]
        j=pdftext.find(n2+" "+" ".join(t2.split()[:3]), a+1)
        if j>a: nb=j
    pdf_local=pdftext[a:nb]
    if not any(s in pdf_local for s in SYMSET): continue  # no symbols here
    nb_body,n=align_insert(body,pdf_local)
    if n: fixes[num]=nb_body; total+=n

json.dump(fixes,open(OUT,"w"),ensure_ascii=False)
print(f"{total} symbols inserted across {len(fixes)} sections; skipped={skipped}")
print("wrote",OUT)
