import json
import os

import pytest

from export.bold_starts import bold_ranges, bold_segments, split_word_start

FIXTURE = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "core", "fixtures", "boldStarts.json")
with open(FIXTURE, encoding="utf-8") as f:
    TABLE = json.load(f)


@pytest.mark.parametrize("word,expected", TABLE["words"])
def test_words(word, expected):
    assert list(split_word_start(word)) == expected


@pytest.mark.parametrize("text,expected", TABLE["texts"])
def test_texts(text, expected):
    assert [[s["text"], s["bold"]] for s in bold_segments(text)] == expected


def test_ranges_are_code_points():
    s = "😀 reading"
    (r,) = bold_ranges(s)
    assert s[r["start"]:r["end"]] == "rea"
