# Sreznevsky: column scan fragments

Source: the three 300 dpi PDFs (vol. I А–К, II Л–П, III Р–Ѣ). PDF page i of vol. I = scan 1000+i (vol. II 2000+i, vol. III 3000+i); column numbers = 2*(page-1)+1 (left) / +1 (right). Check them against the running head (OCR).

- `srz.tsv.gz` is the oldrusdict.ru index (S. Balyberdin), one line per entry in `data/srz.json` order: hw, variants, refs, meanings, scan, POS.
- `pdfimages -f A -l B -png vol.pdf pdf/p` extracts pages; `runA.py` writes the grey 4-level images (`g/<scan>.png`) and `data/srz-scan/s<scan>.webp`.
- `runA2.py` finds the entry blocks (`seg.py`: hanging indent; `match.py`: tesseract `rus` heads + fuzzy match against the index), handles continuations, and rewrites the last line of each entry as `\x0bСрезн. I, Col. N\x0c\x12s<scan>:x0,y0,x1,y1;…\x13`.
- Done: letter А (scans 1012–1030; 304/315 matched). Ranges and the letter filter are hard-coded in runA*.py: generalise them for the other letters.
- All volumes (2026-11-27): `run.py` (generalised runA*.py), `headcols.py` → `colmap.json` (left column of every scan from the running heads; letter title pages such as 1415, 3459 have none), `strict.py` (strict re-match: score ≥ 0.72 and same first two letters; 10/10 correct in a sample), `fixcols.py` ('Col. N–M' when an entry runs on into the next column). Supplement (III, scans 3848ff.) has its own column numbers: `Срезн. Доп., Col. N`. 22 199 of 40 046 entries have fragments; the rest keep the page-scan link. Then `align.py` (alignment by order between matched neighbours) and `relax.py` (score ≥ 0.7, same first letter, between neighbours) add the rest: 24 288 in total.
- 2026-11-27, later: `shared.py` (a variant headword in capitals of an already cut block shares it), `relax.py` accepts score ≥ 0.8 when OCR spoilt the first letter: 25980 entries.
- Blocks rebuilt (`reblock.py`): small-caps headwords read as lowercase by OCR are no longer merged into the previous entry; full run `all.sh` (strict → align → relax → shared): 31458 entries.
