"""Write laminas.html, one 1920x1080 page per slide in deck order, without speaker notes.

Chrome prints it to PDF (see Presentacion/README.md). It is an approximate export: the official
deck downloads as .pptx or PDF from the Slides artifact.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
DECK = HERE / "laminas"
CSS = """@page{size:1920px 1080px;margin:0}html,body{margin:0;padding:0}
section{position:relative;width:1920px;height:1080px;box-sizing:border-box;overflow:hidden;break-after:page}
*{box-sizing:border-box}p,h1,h2,h3{margin:0}table{border-collapse:collapse;width:100%}
th,td{padding:14px 16px;border-bottom:2px solid #D6D0C4;vertical-align:top}th{border-bottom:3px solid currentColor}"""


def main():
    deck = json.loads((DECK / "deck.json").read_text(encoding="utf-8"))
    fonts = "".join(f'<link rel="stylesheet" href="{f["href"]}">' for f in deck["faces"].values())
    slides = []
    for sid in deck["order"]:
        html = (DECK / "slides" / f"{sid}.html").read_text(encoding="utf-8")
        slides.append(re.sub(r"<aside>.*?</aside>", "", html, flags=re.S))
    page = (f'<!doctype html><html lang="es"><head><meta charset="utf-8">{fonts}<style>{CSS}</style></head>'
            f'<body>{"".join(slides)}</body></html>')
    (HERE / "laminas.html").write_text(page, encoding="utf-8")
    print("laminas:", len(slides))


if __name__ == "__main__":
    main()
