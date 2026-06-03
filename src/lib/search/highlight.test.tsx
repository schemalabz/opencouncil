import React from "react";
import { render } from "@testing-library/react";
import { renderHighlighted } from "./highlight";
import { HIGHLIGHT_START, HIGHLIGHT_END } from "./constants";

const mark = (s: string) => `${HIGHLIGHT_START}${s}${HIGHLIGHT_END}`;

describe("renderHighlighted", () => {
    it("falls back to plain text when no highlight is present", () => {
        const { container } = render(<>{renderHighlighted(undefined, "Πλήρες κείμενο")}</>);
        expect(container.textContent).toBe("Πλήρες κείμενο");
        expect(container.querySelector("strong")).toBeNull();
    });

    it("falls back when the highlight has no sentinel markers", () => {
        const { container } = render(<>{renderHighlighted("no markers here", "fallback")}</>);
        expect(container.textContent).toBe("no markers here");
        expect(container.querySelector("strong")).toBeNull();
    });

    it("bolds a matched Greek term", () => {
        const frag = `Αίτηση για ${mark("Αδειοδότηση")} καταστήματος`;
        const { container } = render(<>{renderHighlighted(frag, "irrelevant")}</>);
        expect(container.textContent).toBe("Αίτηση για Αδειοδότηση καταστήματος");
        const strong = container.querySelector("strong");
        expect(strong).not.toBeNull();
        expect(strong?.textContent).toBe("Αδειοδότηση");
    });

    it("bolds an English term", () => {
        const frag = `Building ${mark("permit")} request`;
        const { container } = render(<>{renderHighlighted(frag, "x")}</>);
        const strong = container.querySelector("strong");
        expect(strong?.textContent).toBe("permit");
        expect(container.textContent).toBe("Building permit request");
    });

    it("handles multiple and adjacent matched spans", () => {
        const frag = `${mark("Άδεια")} ${mark("καταστήματος")} τέλος`;
        const { container } = render(<>{renderHighlighted(frag, "x")}</>);
        const strongs = container.querySelectorAll("strong");
        expect(strongs.length).toBe(2);
        expect(strongs[0].textContent).toBe("Άδεια");
        expect(strongs[1].textContent).toBe("καταστήματος");
        expect(container.textContent).toBe("Άδεια καταστήματος τέλος");
    });

    it("strips markdown while preserving boundary whitespace when stripMd is true", () => {
        const frag = `**bold** intro ${mark("permit")} done`;
        const { container } = render(<>{renderHighlighted(frag, "x", true)}</>);
        // ** markers removed, matched term still bolded as a node
        expect(container.textContent).toBe("bold intro permit done");
        expect(container.querySelector("strong")?.textContent).toBe("permit");
    });

    it("tolerates a missing closing tag without throwing", () => {
        const frag = `start ${HIGHLIGHT_START}unterminated tail`;
        const { container } = render(<>{renderHighlighted(frag, "x")}</>);
        expect(container.textContent).toBe("start unterminated tail");
    });
});
