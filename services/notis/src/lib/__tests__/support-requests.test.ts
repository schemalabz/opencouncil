import type { WakeEvent } from "@/agent/types";
import {
  READER_WORDS_MAX_CHARS,
  appendReaderWords,
  conversationUrl,
  formatSupportNotification,
  readerWordsOf,
} from "../support-requests";

describe("readerWordsOf", () => {
  it("joins only the reader's messages, oldest first", () => {
    const events: WakeEvent[] = [
      { type: "user_message", at: "2026-03-10T10:01:00.000Z", text: "Δεύτερο." },
      { type: "scheduled", at: "2026-03-10T09:00:00.000Z", reason: "έλεγχος" },
      { type: "user_message", at: "2026-03-10T10:00:00.000Z", text: "  Πρώτο.  " },
    ];
    expect(readerWordsOf(events)).toBe("Πρώτο.\nΔεύτερο.");
  });

  it("keeps the newest words when the text is too long", () => {
    const long = "α".repeat(READER_WORDS_MAX_CHARS) + "ΤΕΛΟΣ";
    const words = readerWordsOf([{ type: "user_message", at: "2026-03-10T10:00:00.000Z", text: long }]);
    expect(Array.from(words)).toHaveLength(READER_WORDS_MAX_CHARS + 1);
    expect(words.startsWith("…")).toBe(true);
    expect(words.endsWith("ΤΕΛΟΣ")).toBe(true);
  });
});

describe("appendReaderWords", () => {
  it("adds the new words on a new line, and keeps the tail", () => {
    expect(appendReaderWords("Παλιό.", "Νέο.")).toBe("Παλιό.\nΝέο.");
    expect(appendReaderWords("Παλιό.", "")).toBe("Παλιό.");
    const appended = appendReaderWords("β".repeat(READER_WORDS_MAX_CHARS), "Νέο.");
    expect(appended.endsWith("\nΝέο.")).toBe(true);
    expect(Array.from(appended)).toHaveLength(READER_WORDS_MAX_CHARS + 1);
  });
});

describe("conversationUrl", () => {
  it("joins the base and the admin path once", () => {
    expect(conversationUrl("https://notis.test/", "sub1")).toBe(
      "https://notis.test/admin/conversations/sub1",
    );
  });
});

describe("formatSupportNotification", () => {
  const url = "https://notis.test/admin/conversations/sub9";

  it("names the change and the kind, and links to the conversation", () => {
    expect(formatSupportNotification({ change: "opened", kind: "data_error", conversationUrl: url })).toBe(
      `Νέο αίτημα υποστήριξης (λάθος στοιχεία): ${url}`,
    );
    expect(formatSupportNotification({ change: "updated", kind: "help", conversationUrl: url })).toBe(
      `Ενημερώθηκε το αίτημα υποστήριξης (βοήθεια): ${url}`,
    );
    expect(formatSupportNotification({ change: "withdrawn", conversationUrl: url })).toBe(
      `Αποσύρθηκε το αίτημα υποστήριξης: ${url}`,
    );
  });
});
