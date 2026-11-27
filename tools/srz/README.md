# Sreznevsky: column scan fragments

Source: the three 300 dpi PDFs (vol. I А–К, II Л–П, III Р–Ѣ). PDF page i of vol. I = scan 1000+i (vol. II 2000+i, vol. III 3000+i); column numbers = 2*(page-1)+1 (left) / +1 (right). Check them against the running head (OCR).

- `srz.tsv.gz` is the oldrusdict.ru index (S. Balyberdin), one line per entry in `data/srz.json` order: hw, variants, refs, meanings, scan, POS.
- `pdfimages -f A -l B -png vol.pdf pdf/p` extracts pages; `runA.py` writes the grey 4-level images (`g/<scan>.png`) and `data/srz-scan/s<scan>.webp`.
- `runA2.py` finds the entry blocks (`seg.py`: hanging indent; `match.py`: tesseract `rus` heads + fuzzy match against the index), handles continuations, and rewrites the last line of each entry as `\x0bСрезн. I, Col. N\x0c\x12s<scan>:x0,y0,x1,y1;…\x13`.
- Done: letter А (scans 1012–1030; 304/315 matched). Ranges and the letter filter are hard-coded in runA*.py: generalise them for the other letters.
