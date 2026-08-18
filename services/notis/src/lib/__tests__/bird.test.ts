import { extractConflictingConversationId, realBird } from "../bird";

jest.mock("@/env.mjs", () => ({
  env: {
    BIRD_API_KEY: "key",
    BIRD_WORKSPACE_ID: "ws-1",
    BIRD_WHATSAPP_CHANNEL_ID: "wa-channel",
    BIRD_SMS_CHANNEL_ID: "sms-channel",
    BIRD_WHATSAPP_TEMPLATE_DEMOS_TRANSITION: "proj-transition",
    BIRD_WHATSAPP_TEMPLATE_DEMOS_UPDATE_NEWS: "proj-news",
    // demos_followup deliberately unset: the missing-id path.
  },
}));

function mockFetch(status: number, body: unknown): jest.Mock {
  const fn = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }));
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("sendTemplate", () => {
  it("posts the project-id template body with the demos_text parameter", async () => {
    const fetchMock = mockFetch(200, { id: "bm-1" });

    const result = await realBird.sendTemplate({
      conversationId: "conv-1",
      phone: "+306900000001",
      template: "demos_update_news",
      text: "Νέα από τον δήμο.",
      idempotencyKey: "msg-1",
    });

    expect(result).toMatchObject({ success: true, messageId: "bm-1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.bird.com/workspaces/ws-1/conversations/conv-1/messages");
    expect(init.headers["Idempotency-Key"]).toBe("msg-1");
    expect(JSON.parse(init.body)).toEqual({
      participantId: "wa-channel",
      participantType: "flow",
      recipients: [
        { type: "to", identifierKey: "phonenumber", identifierValue: "+306900000001" },
      ],
      template: {
        projectId: "proj-news",
        version: "latest",
        locale: "el",
        parameters: [{ type: "string", key: "demos_text", value: "Νέα από τον δήμο." }],
      },
    });
  });

  it("fails visibly and non-retryably when the project id is missing", async () => {
    const fetchMock = mockFetch(200, {});
    const result = await realBird.sendTemplate({
      conversationId: "conv-1",
      phone: "+306900000001",
      template: "demos_followup",
      text: "x",
      idempotencyKey: "msg-2",
    });
    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.error).toContain("demos_followup");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createConversationWithTemplate", () => {
  it("sends creation with the fixed transition template (no parameters) and returns the ids", async () => {
    const fetchMock = mockFetch(200, {
      id: "conv-9",
      initialMessage: { id: "bm-9" },
    });

    const result = await realBird.createConversationWithTemplate({
      phone: "+306900000001",
      name: "Notis +306900000001",
      template: "demos_transition",
      text: "",
      idempotencyKey: "msg-3",
    });

    expect(result).toMatchObject({ success: true, conversationId: "conv-9", messageId: "bm-9" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.bird.com/workspaces/ws-1/conversations");
    const payload = JSON.parse(init.body);
    expect(payload.channelId).toBe("wa-channel");
    expect(payload.participants).toEqual([
      { type: "contact", identifierKey: "phonenumber", identifierValue: "+306900000001" },
    ]);
    expect(payload.initialMessage.template).toEqual({
      projectId: "proj-transition",
      version: "latest",
      locale: "el",
      parameters: [],
    });
  });

  it("recovers the existing conversation id from a 409", async () => {
    mockFetch(409, {
      details: { conflictingResource: "0198c1e2-aaaa-bbbb-cccc-1234567890ab" },
    });

    const result = await realBird.createConversationWithTemplate({
      phone: "+306900000001",
      name: "n",
      template: "demos_transition",
      text: "",
      idempotencyKey: "msg-4",
    });

    expect(result).toMatchObject({
      success: false,
      alreadyExisted: true,
      conversationId: "0198c1e2-aaaa-bbbb-cccc-1234567890ab",
    });
  });
});

describe("sendSms", () => {
  it("posts the channels-API shape (no idempotency header)", async () => {
    const fetchMock = mockFetch(200, { id: "sms-1" });

    const result = await realBird.sendSms({ phone: "+306900000001", text: "γεια" });

    expect(result).toMatchObject({ success: true, messageId: "sms-1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.bird.com/workspaces/ws-1/channels/sms-channel/messages");
    expect(init.headers["Idempotency-Key"]).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({
      receiver: { contacts: [{ identifierValue: "+306900000001" }] },
      body: { type: "text", text: { text: "γεια" } },
    });
  });
});

describe("extractConflictingConversationId", () => {
  it("reads a UUID out of any details value, including a path", () => {
    expect(
      extractConflictingConversationId(
        { details: { resource: "conversations/9d0a2b1c-1111-2222-3333-444455556666" } },
        null,
      ),
    ).toBe("9d0a2b1c-1111-2222-3333-444455556666");
  });

  it("does NOT scan the raw body — a trace id there must never be adopted", () => {
    // The adopted id is persisted on the subscription and every later
    // proactive send goes into it, so guessing is worse than reporting no
    // recoverable id.
    expect(
      extractConflictingConversationId(
        { message: "conflict" },
        'trace "9d0a2b1c-1111-2222-3333-444455556666" — conversation exists',
      ),
    ).toBeUndefined();
  });

  it("returns undefined when nothing looks like a UUID", () => {
    expect(extractConflictingConversationId({}, "nope")).toBeUndefined();
  });
});
