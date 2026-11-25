"""Bold word starts: a line-for-line port of packages/core/src/boldStarts.js.

Bold the first few letters of each word. ``packages/core/fixtures/boldStarts.json``
is the shared parity table; ``tests/test_bold_starts.py`` runs it.

Offsets: the JS returns UTF-16 offsets; this port works in code points
(Python string indices). Both produce identical segments, which is what the
fixture compares. Do not call this "Bionic Reading" (a registered trademark).
"""

from __future__ import annotations

import math

import regex

# A word core starts with a letter or digit and may continue with letters,
# digits, apostrophes and hyphens.
WORD_RE = regex.compile(r"^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'\u2019-]*)(.*)$", regex.DOTALL)

# Words containing these characters are left whole (joining scripts, Indic,
# South-East Asian, CJK and kana). Same ranges as COMPLEX_SCRIPT_RE in JS.
COMPLEX_SCRIPT_RE = regex.compile(
    "[\u0600-\u08ff\u0900-\u0dff\u0e00-\u0fff\u1000-\u109f\u1780-\u18af\u3040-\u30ff"
    "\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufb1d-\ufdff\ufe70-\ufeff]"
)

# JavaScript's \s (ECMAScript WhiteSpace + LineTerminator), so word splitting matches /\S+/g.
_JS_SPACE = "\t\n\u000b\u000c\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
_TOKEN_RE = regex.compile(f"[^{_JS_SPACE}]+")


def is_complex_script(text) -> bool:
    return bool(COMPLEX_SCRIPT_RE.search("" if text is None else str(text)))


# Strength presets (share of each word that is bold), as in the original app.
BOLD_INTENSITY = {"light": 0.35, "medium": 0.45, "strong": 0.55}
DEFAULT_BOLD_RATIO = BOLD_INTENSITY["medium"]


def ratio_of(r) -> float:
    try:
        n = float(r)
    except (TypeError, ValueError):
        return DEFAULT_BOLD_RATIO
    if not math.isfinite(n) or n <= 0:
        return DEFAULT_BOLD_RATIO
    return min(0.8, max(0.2, n))


def bold_length(core_length: int, ratio=DEFAULT_BOLD_RATIO) -> int:
    if core_length <= 0:
        return 0
    if core_length <= 3:
        return 1
    # Round to 6 decimals first, like the JS (toFixed(6)), so float noise never rounds up.
    return min(core_length, math.ceil(round(core_length * ratio_of(ratio), 6)))


def split_word_start(word, ratio=DEFAULT_BOLD_RATIO) -> tuple[str, str, str]:
    s = "" if word is None else str(word)
    m = WORD_RE.match(s)
    if not m:
        return ("", "", s)
    pre, core, post = m.group(1), m.group(2), m.group(3)
    if is_complex_script(core):
        return ("", "", s)
    n = bold_length(len(core), ratio)
    return (pre, core[:n], core[n:] + post)


def bold_ranges(text, ratio=DEFAULT_BOLD_RATIO) -> list[dict]:
    """Bold ranges as code-point offsets [{start, end}], in order."""
    s = "" if text is None else str(text)
    out = []
    for m in _TOKEN_RE.finditer(s):
        pre, bold, _ = split_word_start(m.group(0), ratio)
        if not bold:
            continue
        start = m.start() + len(pre)
        out.append({"start": start, "end": start + len(bold)})
    return out


def bold_segments(text, ratio=DEFAULT_BOLD_RATIO) -> list[dict]:
    s = "" if text is None else str(text)
    segs = []
    at = 0
    for r in bold_ranges(s, ratio):
        if r["start"] > at:
            segs.append({"text": s[at:r["start"]], "bold": False})
        segs.append({"text": s[r["start"]:r["end"]], "bold": True})
        at = r["end"]
    if at < len(s):
        segs.append({"text": s[at:], "bold": False})
    return segs
