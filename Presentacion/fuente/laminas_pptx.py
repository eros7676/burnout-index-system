"""Write ../laminas.pptx: one full-bleed picture per slide, in deck order, with the script as speaker notes.

Each slide is a picture, so the deck looks the same on any PowerPoint, with or without the fonts
installed; the text cannot be edited there (edit fuente/ and regenerate instead).

Usage: python3 laminas_pptx.py <folder with lamina-01.png ... lamina-35.png>
Needs python-pptx (pip install python-pptx). See Presentacion/README.md for the full command list.
"""
import json
import re
import sys
from pathlib import Path

from pptx import Presentation
from pptx.util import Emu

from build import NAMES, parse

HERE = Path(__file__).parent
ORDER = json.loads((HERE / "laminas" / "deck.json").read_text(encoding="utf-8"))["order"]
WIDTH, HEIGHT = Emu(12192000), Emu(6858000)  # 13.333 x 7.5 in, PowerPoint's 16:9


def note_line(line):
    """The script line as plain text: stage directions in parentheses, timing marks kept short."""
    s = re.sub(r"\*\[(.*?)\]\*", r"(\1)", line)
    s = re.sub(r"\[espera (\d+)\]", r"[\1 s]", s)
    s = re.sub(r"\[silencio (\d+)\]", r"[silencio \1 s]", s)
    s = s.replace("[lento]", "[más lento y grave]").replace("[normal]", "[vuelve la energía]")
    return s.strip()


def notes_by_slide():
    notes = {}
    for part in parse():
        who = NAMES[part["who"] + "n"]
        for block in part["blocks"]:
            head = f"{who} · Parte {part['n']}: {part['title']}\nEntra con: {block['cue']}"
            body = "\n\n".join(note_line(line) for line in block["lines"])
            notes[block["slide"]] = f"{head}\n\n{body}"
    return notes


def main():
    pictures = Path(sys.argv[1])
    notes = notes_by_slide()
    deck = Presentation()
    deck.slide_width, deck.slide_height = WIDTH, HEIGHT
    blank = deck.slide_layouts[6]
    for i, sid in enumerate(ORDER, start=1):
        slide = deck.slides.add_slide(blank)
        slide.shapes.add_picture(str(pictures / f"lamina-{i:02d}.png"), 0, 0, WIDTH, HEIGHT)
        slide.notes_slide.notes_text_frame.text = notes.get(sid, "Anexo: no se proyecta, sirve para las preguntas.")
    out = HERE.parent / "laminas.pptx"
    deck.save(out)
    print("laminas.pptx:", len(ORDER), "láminas,", sum(sid in notes for sid in ORDER), "con notas")


if __name__ == "__main__":
    main()
