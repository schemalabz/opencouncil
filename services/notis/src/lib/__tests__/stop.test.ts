import { isBareStop } from "../stop";

describe("isBareStop", () => {
  it("matches the bare keyword in either language, any case", () => {
    expect(isBareStop("ΣΤΟΠ")).toBe(true);
    expect(isBareStop("στοπ")).toBe(true);
    expect(isBareStop("Stop")).toBe(true);
    expect(isBareStop("STOP")).toBe(true);
  });

  it("tolerates surrounding whitespace and punctuation", () => {
    expect(isBareStop(" ΣΤΟΠ! ")).toBe(true);
    expect(isBareStop("stop.")).toBe(true);
    expect(isBareStop("«στοπ»")).toBe(true);
  });

  it("tolerates an accidental accent", () => {
    expect(isBareStop("στόπ")).toBe(true);
  });

  it("does NOT match longer messages — those go to the agent", () => {
    expect(isBareStop("stop the meeting")).toBe(false);
    expect(isBareStop("θέλω να απεγγραφώ")).toBe(false);
    expect(isBareStop("γιατί έγινε διακοπή νερού;")).toBe(false);
    expect(isBareStop("stop stop")).toBe(false);
  });

  it("handles empty input", () => {
    expect(isBareStop("")).toBe(false);
    expect(isBareStop(null)).toBe(false);
    expect(isBareStop(undefined)).toBe(false);
  });
});
