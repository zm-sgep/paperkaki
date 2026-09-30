"""Renders the invented sample notice as two PNG "photos" (one per page).

Run after scripts/make-sample-notice.ts:  python3 scripts/make-sample-notice-photo.py
Needs PyMuPDF (pip install pymupdf). Writes tests/fixtures/notices/p3-eoy-sample-photo-1.png and -2.png,
which stand in for a parent photographing a two-page letter with a phone.
"""
from pathlib import Path

import pymupdf

root = Path(__file__).resolve().parent.parent
pdf = pymupdf.open(root / "tests/fixtures/notices/p3-eoy-sample.pdf")
for number, page in enumerate(pdf, start=1):
    pixmap = page.get_pixmap(dpi=110)
    target = root / f"tests/fixtures/notices/p3-eoy-sample-photo-{number}.png"
    pixmap.save(target)
    print(f"Wrote {target.relative_to(root)} ({pixmap.width}x{pixmap.height})")
