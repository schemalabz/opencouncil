const mockEnv: { NOTIS_ALERT_WEBHOOK_URL?: string } = {};
jest.mock("@/env.mjs", () => ({ env: mockEnv }));

import { alert, notify } from "../alert";

describe("alert and notify", () => {
  const fetchMock = jest.fn();
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
    global.fetch = fetchMock;
    log = jest.spyOn(console, "log").mockImplementation(() => {});
    error = jest.spyOn(console, "error").mockImplementation(() => {});
    mockEnv.NOTIS_ALERT_WEBHOOK_URL = "https://discord.test/webhook";
  });

  afterEach(() => {
    log.mockRestore();
    error.mockRestore();
  });

  function postedContent(): string {
    const init = fetchMock.mock.calls[0][1] as { body: string };
    return (JSON.parse(init.body) as { content: string }).content;
  }

  it("notify posts with its own emoji and leaves the logging to the caller", async () => {
    await notify("support", "Νέο αίτημα.");
    expect(postedContent()).toBe("📮 notis support: Νέο αίτημα.");
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("lets no mention in the message ping the channel", async () => {
    await notify("support", "@everyone γιατί;");
    const init = fetchMock.mock.calls[0][1] as { body: string };
    expect(JSON.parse(init.body).allowed_mentions).toEqual({ parse: [] });
  });

  it("alert keeps posting to the error log", async () => {
    await alert("queue", "Κάτι χάλασε.");
    expect(postedContent()).toBe("🚨 notis queue: Κάτι χάλασε.");
    expect(error).toHaveBeenCalledWith("[notis:queue] Κάτι χάλασε.");
  });

  it("never throws when the webhook fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(notify("support", "Νέο αίτημα.")).resolves.toBeUndefined();
  });

  it("posts nothing without a webhook", async () => {
    mockEnv.NOTIS_ALERT_WEBHOOK_URL = undefined;
    await notify("support", "Νέο αίτημα.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
