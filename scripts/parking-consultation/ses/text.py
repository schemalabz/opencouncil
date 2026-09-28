"""Greek text helpers: matching names across the drawing, the report and OpenStreetMap, and stable ids."""
import re
import unicodedata

_TRANSLIT_DIGRAPHS = [("ου", "ou"), ("αυ", "av"), ("ευ", "ev"), ("γγ", "ng"), ("γκ", "gk"), ("μπ", "b"), ("ντ", "nt")]
_TRANSLIT = {
    "α": "a", "β": "v", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "i", "θ": "th", "ι": "i", "κ": "k",
    "λ": "l", "μ": "m", "ν": "n", "ξ": "x", "ο": "o", "π": "p", "ρ": "r", "σ": "s", "ς": "s", "τ": "t",
    "υ": "y", "φ": "f", "χ": "ch", "ψ": "ps", "ω": "o",
}


def strip_accents(text: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn")


def normalize(text: str) -> str:
    """Accent-free upper case with single spaces, for comparing names from different sources."""
    text = strip_accents(text).upper().replace("Ϊ", "Ι").replace("Ϋ", "Υ")
    text = re.sub(r"[\s\.]+", " ", text)
    return text.strip()


def transliterate(text: str) -> str:
    """Deterministic Greek → Latin. Not orthographically perfect, but stable, which ids need."""
    text = strip_accents(text).lower()
    for greek, latin in _TRANSLIT_DIGRAPHS:
        text = text.replace(greek, latin)
    return "".join(_TRANSLIT.get(ch, ch) for ch in text)


def slug(text: str) -> str:
    """ASCII id fragment: letters, digits and single dashes."""
    latin = transliterate(text)
    latin = re.sub(r"[^a-z0-9]+", "-", latin)
    return latin.strip("-")
