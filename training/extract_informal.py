"""
Extract raw sentences from a Språkbanken Sparv XML corpus (Flashback /
Familjeliv "meningsmängder"/full exports, CC BY 4.0) into token JSONL for the
v14 pseudo-labeling pipeline (docs/ROADMAP.md, "the main bet").

Reads the .xml.bz2 byte stream on STDIN and decompresses incrementally, so it
can be fed by a streaming curl and stopped early once --max sentences are
kept; the multi-GB archives never touch disk:

    curl -sL https://spraakbanken.gu.se/resurser/meningsmangder/flashback-dator.xml.bz2 \
      | python3 extract_informal.py --src flashback-dator --max 100000 \
      >> .benchmark/informal-raw.jsonl

Output rows: {"tokens": [...], "src": "flashback-dator"}. Tokens come from
Sparv's <token> elements (one per line in the export), so rows match the
training data's whitespace token format. Filters are register-neutral quality
gates only (length, letter share, no URL/code debris); register-targeted
sampling happens later in convert_pseudo.mjs, after labeling.
"""

import argparse
import bz2
import json
import re
import sys

TOKEN_RE = re.compile(r"<token[^>]*>(.*?)</token>")
SENT_OPEN = "<sentence"
SENT_CLOSE = "</sentence>"

ENTITIES = [("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&apos;", "'"), ("&amp;", "&")]


def decode(text):
    for src, dst in ENTITIES:
        text = text.replace(src, dst)
    return text


def keep(tokens):
    if not 4 <= len(tokens) <= 40:
        return False
    letters = sum(1 for t in tokens if any(c.isalpha() for c in t))
    if letters < 3 or letters / len(tokens) < 0.5:
        return False
    for t in tokens:
        if len(t) > 30 or "http" in t or "www." in t or "@" in t:
            return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="corpus id stored on every row")
    ap.add_argument("--max", type=int, default=100_000, help="kept sentences before stopping")
    args = ap.parse_args()

    dec = bz2.BZ2Decompressor()
    buf = ""
    tokens = []
    in_sentence = False
    kept = 0
    seen = 0

    out = sys.stdout
    for chunk in iter(lambda: sys.stdin.buffer.read(1 << 20), b""):
        buf += dec.decompress(chunk).decode("utf-8", errors="replace")
        lines = buf.split("\n")
        buf = lines.pop()  # keep the trailing partial line
        for line in lines:
            s = line.strip()
            if not in_sentence:
                if s.startswith(SENT_OPEN):
                    in_sentence = True
                    tokens = []
                continue
            if s.startswith(SENT_CLOSE):
                in_sentence = False
                seen += 1
                if keep(tokens):
                    out.write(json.dumps({"tokens": tokens, "src": args.src}, ensure_ascii=False) + "\n")
                    kept += 1
                    if kept >= args.max:
                        print(f"{args.src}: kept {kept}/{seen} sentences (cap reached)", file=sys.stderr)
                        return
                continue
            m = TOKEN_RE.search(s)
            if m:
                tok = decode(m.group(1)).strip()
                if tok:
                    tokens.append(tok)
    print(f"{args.src}: kept {kept}/{seen} sentences (stream ended)", file=sys.stderr)


if __name__ == "__main__":
    main()
