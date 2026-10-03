from ses.text import normalize, slug, transliterate


def test_normalize_ignores_accents_case_and_dots():
    assert normalize("Ελ. Βενιζέλου") == "ΕΛ ΒΕΝΙΖΕΛΟΥ"
    assert normalize("Αϊδινίου") == "ΑΙΔΙΝΙΟΥ"
    assert normalize("  17ης   Νοεμβρίου ") == "17ΗΣ ΝΟΕΜΒΡΙΟΥ"


def test_transliteration_vectors_are_stable():
    # Ids are built from these; a change here renames every unit and orphans its comments.
    assert slug("Βουτσινά") == "voutsina"
    assert slug("Αναστάσεως") == "anastaseos"
    assert slug("Κύπρου") == "kyprou"
    assert slug("17ης Νοεμβρίου") == "17is-noemvriou"
    assert slug("Λεωφόρος Περικλέους") == "leoforos-perikleous"
    assert slug("Ελευθερίου Βενιζέλου") == "elevtheriou-venizelou"
    assert slug("Αγίου Ιωάννη Θεολόγου") == "agiou-ioanni-theologou"
    assert slug("Ψαρών") == "psaron"
    assert slug("Χίου") == "chiou"
    assert transliterate("Ευαγγέλου") == "evangelou"


def test_slug_strips_punctuation():
    assert slug("Ι. Τσιγάντε") == "i-tsigante"
    assert slug("--Κ.Τσιάκα--") == "k-tsiaka"
