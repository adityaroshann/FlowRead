import math
import re


def bionic_transform(text: str, intensity: float = 0.45) -> str:
    """
    Returns HTML string with bionic-bolded words.
    Bolds the first `intensity` fraction of each word.
    Preserves surrounding punctuation.
    """
    # Split on whitespace but keep the tokens
    tokens = re.split(r'(\s+)', text)
    result = []
    for token in tokens:
        if re.match(r'\s+', token):
            result.append(token)
            continue
        # Match optional leading punct, word chars, optional trailing punct
        m = re.match(r'^(\W*)([\w\u00C0-\u024F\']+)(\W*)$', token)
        if m:
            pre, core, post = m.groups()
            bold_len = max(1, math.ceil(len(core) * intensity))
            bolded = f"<b>{core[:bold_len]}</b>{core[bold_len:]}"
            result.append(f"{pre}{bolded}{post}")
        else:
            # e.g. pure punctuation — leave as-is
            result.append(token)
    return "".join(result)


def transform_paragraphs(paragraphs: list[str], intensity: float = 0.45) -> list[str]:
    """Apply bionic transform to a list of paragraph strings."""
    return [bionic_transform(p, intensity) for p in paragraphs if p.strip()]


def word_count(text: str) -> int:
    return len(re.findall(r'\b\w+\b', text))


def reading_time_minutes(text: str, wpm: int = 238) -> float:
    """Average adult reading speed ~238 wpm."""
    return round(word_count(text) / wpm, 1)
