import { extractLinks, findUngroundedLinks, isServerResultBlock, linksOnly } from "../links";

const KNOWN = [
  "SYSTEM: people pages are /{city}/people/{id}",
  '{"results":[{"id":"cmuv6azpv07caaajgb2ntxjbx","url":"https://opencouncil.gr/athens/oct8_2026/subjects/cmuv6azpv07caaajgb2ntxjbx"}]}',
  '{"introducedBy":{"id":"cm0tqeh9m08mj4o47a2xw2265","name":"Χάρης Δούκας"}}',
  "[2026-10-01] you sent: «Δες εδώ: https://opencouncil.gr/athens/sep28_2026/subjects/cmufs1t0q0ez4wyspc57pbqvk»",
].join("\n");

describe("links", () => {
  it("extracts links and drops the sentence punctuation that follows them", () => {
    expect(
      extractLinks(
        "Δες: https://opencouncil.gr/athens/oct8_2026. Και https://example.org/a?b=1, τέλος «https://opencouncil.gr/athens»",
      ),
    ).toEqual(["https://opencouncil.gr/athens/oct8_2026", "https://example.org/a?b=1", "https://opencouncil.gr/athens"]);
  });

  it("a slug composed from a name is ungrounded; the id from a tool result is not", () => {
    expect(findUngroundedLinks("Κρίνε εσύ: https://opencouncil.gr/athens/people/dukas", KNOWN)).toEqual([
      "https://opencouncil.gr/athens/people/dukas",
    ]);
    expect(
      findUngroundedLinks("Κρίνε εσύ: https://opencouncil.gr/athens/people/cm0tqeh9m08mj4o47a2xw2265", KNOWN),
    ).toEqual([]);
  });

  it("a meeting page cut from a subject url, the city page and the root are grounded", () => {
    expect(findUngroundedLinks("https://opencouncil.gr/athens/oct8_2026", KNOWN)).toEqual([]);
    expect(findUngroundedLinks("https://opencouncil.gr/athens", KNOWN)).toEqual([]);
    expect(findUngroundedLinks("https://opencouncil.gr και https://opencouncil.gr/", "")).toEqual([]);
  });

  it("a link already in the conversation is grounded, query string and trailing slash aside", () => {
    expect(
      findUngroundedLinks(
        "Ξανά: https://opencouncil.gr/athens/sep28_2026/subjects/cmufs1t0q0ez4wyspc57pbqvk/?t=120.",
        KNOWN,
      ),
    ).toEqual([]);
  });

  it("ignores other hosts and reports each bad link once", () => {
    const text =
      "https://diavgeia.gov.gr/doc/ΑΔΑ και https://opencouncil.gr/athens/people/mayor, ξανά https://opencouncil.gr/athens/people/mayor";
    expect(findUngroundedLinks(text, KNOWN)).toEqual(["https://opencouncil.gr/athens/people/mayor"]);
  });

  it("prompt prose vouches only through the links it carries", () => {
    const prose = "a slug made from a name («/people/dukas») is a 404; link to https://opencouncil.gr/explain for more";
    const known = linksOnly([prose]);
    expect(known).toBe("https://opencouncil.gr/explain");
    expect(findUngroundedLinks("https://opencouncil.gr/athens/people/dukas", known)).toEqual([
      "https://opencouncil.gr/athens/people/dukas",
    ]);
    expect(findUngroundedLinks("https://opencouncil.gr/explain", known)).toEqual([]);
  });

  it("only server-produced result blocks vouch for a link", () => {
    expect(isServerResultBlock({ type: "mcp_tool_result", content: [] })).toBe(true);
    expect(isServerResultBlock({ type: "web_search_tool_result", content: [] })).toBe(true);
    expect(isServerResultBlock({ type: "tool_use", name: "send_message" })).toBe(false);
    expect(isServerResultBlock({ type: "text", text: "https://opencouncil.gr/x/people/y" })).toBe(false);
    expect(isServerResultBlock(null)).toBe(false);
  });
});
