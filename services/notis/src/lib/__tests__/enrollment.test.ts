import { isHeldForMarketing } from "../enrollment";

describe("isHeldForMarketing", () => {
  it("holds a +1 number only while its shell is a marketing template", () => {
    // Meta refuses marketing shells to +1 numbers (131049); utility shells go.
    expect(isHeldForMarketing("notis_intro", "+16174613635")).toBe(true);
    expect(isHeldForMarketing("demos_transition", "+16174613635")).toBe(false);
    expect(isHeldForMarketing("notis_intro", "+306943472297")).toBe(false);
  });
});
