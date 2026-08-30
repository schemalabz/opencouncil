import { compactMetadataDescription } from "../metadataDescription";

describe("compactMetadataDescription", () => {
    it("keeps link labels and drops link targets, including REF markers", () => {
        expect(
            compactMetadataDescription(
                "Μείωση [3,3 εκατ. ευρώ](REF:UTTERANCE:cmm4kznwy0f6lk2f1u6iun0rh) στο [τεχνικό πρόγραμμα](https://example.com/plan)."
            )
        ).toBe("Μείωση 3,3 εκατ. ευρώ στο τεχνικό πρόγραμμα.");
    });

    it("strips markdown tokens", () => {
        expect(compactMetadataDescription("## Τίτλος **έντονο** _πλάγιο_ `κώδικας` > παράθεση")).toBe(
            "Τίτλος έντονο πλάγιο κώδικας παράθεση"
        );
    });

    it("collapses whitespace and newlines", () => {
        expect(compactMetadataDescription("πρώτη γραμμή\n\n- δεύτερη   γραμμή\n")).toBe(
            "πρώτη γραμμή - δεύτερη γραμμή"
        );
    });

    it("caps long text with an ellipsis and no trailing space", () => {
        const out = compactMetadataDescription(`${"α".repeat(170)} ${"β".repeat(50)}`);
        expect(out.length).toBeLessThanOrEqual(180);
        expect(out.endsWith("…")).toBe(true);
        expect(out).not.toMatch(/\s…$/);
    });

    it("honors a custom maximum length", () => {
        expect(compactMetadataDescription("αβγδεζηθικ", 5)).toBe("αβγδ…");
    });

    it("returns short input unchanged", () => {
        expect(compactMetadataDescription("Σύντομη περιγραφή.")).toBe("Σύντομη περιγραφή.");
    });
});
