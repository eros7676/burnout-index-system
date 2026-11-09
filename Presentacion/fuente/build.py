"""Parse guion-equipo.txt, time every block and print the per-slide clock.

Timing model (same as tiempos.py, plus explicit waits):
articulation 200 wpm, 170 wpm inside [lento]; 0.6 s per sentence, 1.5 s per [pausa],
3 s per [pausa larga], 1 s per question, 1.5 s per slide change, [espera N]/[silencio N] = N s.
"""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).parent
NAMES = json.loads((HERE / "reparto.json").read_text(encoding="utf-8"))


def fill(text):
    for k, v in NAMES.items():
        text = text.replace("{" + k + "}", v)
    return text


def parse():
    parts, part, block = [], None, None
    for raw in (HERE / "guion-equipo.txt").read_text(encoding="utf-8").splitlines():
        if raw.startswith("#") or not raw.strip():
            continue
        line = fill(raw)
        if line.startswith("@parte"):
            n, who, title, budget, q = line[7:].split("|")
            m, s = budget.split(":")
            part = dict(n=int(n), who=who, title=title, budget=int(m) * 60 + int(s), q=q, blocks=[])
            parts.append(part)
        elif line.startswith("@L"):
            sid, cue = line[3:].split("|", 1)
            block = dict(slide=sid.strip(), cue=cue.strip(), lines=[])
            part["blocks"].append(block)
        else:
            block["lines"].append(line)
    return parts


def time_line(line, slow):
    secs = 0.0
    for tok in re.findall(r"\[(?:espera|silencio) (\d+)\]", line):
        secs += int(tok)
    spoken = re.sub(r"\*\[[^\]]*\]\*", "", line)
    secs += 1.5 * len(re.findall(r"\[pausa\]", spoken)) + 3 * len(re.findall(r"\[pausa larga\]", spoken))
    spoken = re.sub(r"\[[^\]]*\]", "", spoken)
    words = len(re.findall(r"[\wáéíóúñü]+", spoken))
    sentences = len(re.findall(r"[.?!…]", spoken))
    secs += words / (170 if slow else 200) * 60 + 0.6 * sentences + spoken.count("?")
    return secs, words


def timed(parts):
    clock, slow = 0.0, False
    for p in parts:
        p["start"] = clock
        p["words"] = 0
        for b in p["blocks"]:
            b["start"] = clock
            secs, words = 1.5, 0
            for line in b["lines"]:
                if "[lento]" in line:
                    slow = True
                if "[normal]" in line:
                    slow = False
                s, w = time_line(line, slow)
                secs += s
                words += w
            b["secs"], b["words"] = secs, words
            clock += secs
            p["words"] += words
        p["secs"] = clock - p["start"]
        slow = False
    return parts


def mmss(s):
    s = round(s)
    return f"{s // 60}:{s % 60:02d}"


if __name__ == "__main__":
    parts = timed(parse())
    budget_clock = 0
    for p in parts:
        print(f"Parte {p['n']} {NAMES[p['who'] + 'n']:9} {mmss(p['secs'])} de {mmss(p['budget'])}"
              f"  ({p['words']} palabras)  empieza {mmss(p['start'])}, en el plan a las {mmss(budget_clock)}")
        for b in p["blocks"]:
            print(f"   {mmss(b['start']):>6}  {b['slide']:11} {b['secs']:5.0f} s")
        budget_clock += p["budget"]
    total = sum(p["secs"] for p in parts)
    print("total", mmss(total), "de 28:30 de plan sin margen")
