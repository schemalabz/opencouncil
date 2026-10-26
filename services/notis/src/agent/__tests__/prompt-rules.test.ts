import fs from "node:fs";
import path from "node:path";
import { CLIENT_TOOLS } from "../tools";

/**
 * The rules below each answer a defect seen in a production conversation
 * (2026-10). The tests pin their presence, not their wording: a rewrite of
 * system.md that drops one brings the defect back silently.
 */
const PROMPTS = path.join(__dirname, "../../../prompts");
// Line wraps are not wording: a reflow of a paragraph must not read as a dropped rule.
const system = fs.readFileSync(path.join(PROMPTS, "system.md"), "utf8").replace(/\s+/g, " ");
const boundaries = fs.readFileSync(path.join(PROMPTS, "context-pack/95-notis-boundaries.md"), "utf8");
const communities = fs.readFileSync(
  path.join(PROMPTS, "context-pack/06-dimotikes-koinotites.md"),
  "utf8",
);

describe("system prompt rules from the 2026-10 conversation review", () => {
  it("links are copied from tool results, never composed from a name", () => {
    expect(system).toContain("copied, never composed");
    expect(system).toContain("/people/dukas");
  });

  it("«anything new?» names the most recent item for their place before saying nothing", () => {
    expect(system).toContain("«Έχουμε κάτι νεότερο;»");
    expect(system).toContain("returns nothing from the last month");
    expect(system).toContain("«εβδομαδιαία ενημέρωση»");
  });

  it("«what happened with…» leads with the latest decision and distrusts an empty filtered search", () => {
    expect(system).toContain("the latest decision, not the latest mention");
    expect(system).toContain("A filtered search that returns nothing proves nothing");
  });

  it("a body the reader asked about makes its next thin agenda news", () => {
    expect(system).toContain("«το 4ο διαμέρισμα τίποτα;»");
    expect(system).toContain("is news to them even when it is thin");
  });

  it("an unpublished record is an agenda, and is worded as one", () => {
    expect(system).toContain("η απομαγνητοφώνηση δεν έχει βγει ακόμα");
    expect(system).toContain("never «ασχολήθηκε με»");
  });

  it("never promises to watch a city outside the reader's subscription", () => {
    expect(system).toContain("you are woken only for meetings of the cities in <user_profile>");
    expect(system).toContain("never record_commitment about its meetings");
    expect(system).toContain("never schedule_wakeup to check on it yourself");
    expect(system).toContain("once they add it, you write about it too");
    expect(system).toContain("the door is the question, never the offer");
    const tool = (name: string) => CLIENT_TOOLS.find((t) => t.name === name)?.description ?? "";
    expect(tool("record_commitment")).toContain("Never for the meetings of a city outside their profile");
    expect(tool("schedule_wakeup")).toContain("Never to follow a city outside the reader's profile");
    expect(boundaries).toContain("Δεν παρακολουθεί δήμο που δεν είναι στις εγγραφές του χρήστη");
  });

  it("names the four signals that always update the profile", () => {
    expect(system).toContain("Four things are lasting whatever words carry them");
    expect(system).toContain("«όχι μόνο τα δικά μου θέματα»");
  });
});

describe("context pack — neighbourhood to κοινότητα", () => {
  it("tells the agent to resolve a neighbourhood's κοινότητα from the record, not from memory", () => {
    expect(communities).toContain("administrativeBodyTypes: community");
    expect(communities).toContain("Μην υποθέσεις την αντιστοίχιση από μνήμης");
    // No hardcoded map: the record is the source for which κοινότητα covers a neighbourhood.
    expect(communities).not.toMatch(/^- [1-7]η:/m);
  });
});

describe("support requests", () => {
  it("files first for each of the four kinds, and never argues", () => {
    expect(system).toContain("File a support request with open_support_request, without asking first");
    for (const kind of ["«dissatisfaction»", "«contact»", "«help»", "«data_error»"]) {
      expect(system).toContain(kind);
    }
    expect(system).toContain("Never argue.");
    expect(system).toContain("Promise no outcome and no time.");
  });

  it("does not file twice, and withdraws on request", () => {
    expect(system).toContain("never file an open one twice");
    expect(system).toContain("call withdraw_support_request when they decline contact");
  });

  it("keeps municipality complaints, city changes and opt-outs out", () => {
    expect(system).toContain("a complaint about the municipality");
    expect(system).toContain("a request to stop the messages (unsubscribe_user)");
    expect(boundaries).toContain("δεν διαβιβάζει αιτήματα ή καταγγελίες προς τις δημοτικές υπηρεσίες");
    expect(boundaries).toContain("ομάδα του OpenCouncil");
  });
});
