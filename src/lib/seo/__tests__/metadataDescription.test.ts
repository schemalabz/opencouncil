import { compactMetadataDescription } from "../metadataDescription";

describe("compactMetadataDescription", () => {
    it("keeps link labels and drops link targets, including REF markers", () => {
        expect(
            compactMetadataDescription(
                "Μείωση [3,3 εκατ. ευρώ](REF:UTTERANCE:cmm4kznwy0f6lk2f1u6iun0rh) στο [τεχνικό πρόγραμμα](https://example.com/plan)."
            )
        ).toBe("Μείωση 3,3 εκατ. ευρώ στο τεχνικό πρόγραμμα.");
    });

    it("strips paired markdown and heading/list markers", () => {
        expect(compactMetadataDescription("## Τίτλος\n**έντονο** _πλάγιο_ `κώδικας`\n- στοιχείο λίστας")).toBe(
            "Τίτλος έντονο πλάγιο κώδικας στοιχείο λίστας"
        );
    });

    it("preserves literal characters that are not markdown pairs", () => {
        expect(compactMetadataDescription("Θέμα #5 και ΚΑΕ 15_7135 της υπ' αρ. 3*4 απόφασης")).toBe(
            "Θέμα #5 και ΚΑΕ 15_7135 της υπ' αρ. 3*4 απόφασης"
        );
    });

    it("collapses whitespace and newlines", () => {
        expect(compactMetadataDescription("πρώτη γραμμή\n\nδεύτερη   γραμμή\n")).toBe(
            "πρώτη γραμμή δεύτερη γραμμή"
        );
    });

    it("caps long text with an ellipsis and no trailing space", () => {
        const out = compactMetadataDescription(`${"α".repeat(170)} ${"β".repeat(50)}`);
        expect(Array.from(out).length).toBeLessThanOrEqual(180);
        expect(out.endsWith("…")).toBe(true);
        expect(out).not.toMatch(/\s…$/);
    });

    it("does not split a surrogate pair at the truncation point", () => {
        const out = compactMetadataDescription(`${"α".repeat(179)}🏗️${"β".repeat(20)}`);
        expect(out.endsWith("…")).toBe(true);
        expect(out).not.toMatch(/[\uD800-\uDBFF]…$/);
        expect(out.isWellFormed()).toBe(true);
    });

    it("honors a custom maximum length", () => {
        expect(compactMetadataDescription("αβγδεζηθικ", 5)).toBe("αβγδ…");
    });

    it("returns short input unchanged", () => {
        expect(compactMetadataDescription("Σύντομη περιγραφή.")).toBe("Σύντομη περιγραφή.");
    });
});
