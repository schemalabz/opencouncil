import { FALLBACK_LINK_PATH, extractConflictingConversationId, realBird } from "../bird";

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

const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  jest.restoreAllMocks();
  // restoreAllMocks does not undo a plain assignment, and both helpers in
  // this file assign global.fetch directly — without this the stub leaks
  // into whatever runs next.
  global.fetch = ORIGINAL_FETCH;
});

describe("sendTemplate", () => {
  it("posts the project-id template body with the demos_text parameter", async () => {
    const fetchMock = mockFetch(200, { id: "bm-1" });

    const result = await realBird.sendTemplate({
      conversationId: "conv-1",
      phone: "+306900000001",
      template: "demos_update_news",
      text: "Νέα από τον δήμο.",
      linkPath: "athens/jul29_2_2026",
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
        parameters: [
          { type: "string", key: "demos_text", value: "Νέα από τον δήμο." },
          { type: "string", key: "link_path", value: "athens/jul29_2_2026" },
        ],
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

describe("fetchMessageBody", () => {
  it("GETs the message and reads its text out of the nested body shape", async () => {
    const fetchMock = mockFetch(200, { id: "bm-1", body: { text: { text: "the whole message" } } });

    const body = await realBird.fetchMessageBody({
      conversationId: "conv-1",
      messageId: "bm-1",
    });

    expect(body).toBe("the whole message");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.bird.com/workspaces/ws-1/conversations/conv-1/messages/bm-1");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("AccessKey key");
    expect(init.body).toBeUndefined();
  });

  it("returns null on an error status, so the caller keeps the preview", async () => {
    mockFetch(404, { message: "not found" });
    expect(
      await realBird.fetchMessageBody({ conversationId: "conv-1", messageId: "bm-1" }),
    ).toBeNull();
  });

  it("returns null when the message carries no text", async () => {
    mockFetch(200, { id: "bm-1" });
    expect(
      await realBird.fetchMessageBody({ conversationId: "conv-1", messageId: "bm-1" }),
    ).toBeNull();
  });
});

describe("extractConflictingConversationId", () => {
  it("reads a UUID out of a details resource path", () => {
    expect(
      extractConflictingConversationId(
        { details: { resource: "conversations/9d0a2b1c-1111-2222-3333-444455556666" } },
        null,
      ),
    ).toBe("9d0a2b1c-1111-2222-3333-444455556666");
  });

  it("reads a whole-value UUID from a named details key", () => {
    expect(
      extractConflictingConversationId(
        { details: { conversationId: "9d0a2b1c-1111-2222-3333-444455556666" } },
        null,
      ),
    ).toBe("9d0a2b1c-1111-2222-3333-444455556666");
  });

  it("NEVER adopts a root-level id — that is a request id, not a conversation", () => {
    // Adopting one poisons the subscription: every later send targets a
    // conversation that does not exist, until the reader happens to write in.
    expect(
      extractConflictingConversationId(
        { id: "9d0a2b1c-1111-2222-3333-444455556666", message: "conflict" },
        null,
      ),
    ).toBeUndefined();
    expect(
      extractConflictingConversationId(
        { conversationId: "9d0a2b1c-1111-2222-3333-444455556666" },
        null,
      ),
    ).toBeUndefined();
  });

  it("does not substring-match a UUID out of free text in details", () => {
    expect(
      extractConflictingConversationId(
        { details: { message: 'see incident "9d0a2b1c-1111-2222-3333-444455556666" for context' } },
        null,
      ),
    ).toBeUndefined();
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

describe("template parameters", () => {
  /**
   * The regression this exists for: Bird holds the three update shells with a
   * dynamic URL button, and rejects the send with a terminal 422 when
   * link_path is missing — "One or more fields provided in the request body
   * are malformed: missing value for variable 'link_path'". A 422 is not
   * retryable, so every one of those messages was simply lost.
   */
  const capture = () => {
    const calls: Array<Record<string, unknown>> = [];
    global.fetch = (async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body) as Record<string, unknown>);
      return { ok: true, status: 200, json: async () => ({ id: "m1" }), text: async () => "" };
    }) as unknown as typeof fetch;
    return calls;
  };

  it("sends link_path for a shell whose URL button is dynamic", async () => {
    const calls = capture();
    await realBird.sendTemplate({
      conversationId: "c1",
      phone: "+306900000001",
      template: "demos_update_news",
      text: "Νέα: https://opencouncil.gr/athens/jul29_2_2026",
      linkPath: "athens/jul29_2_2026",
      idempotencyKey: "k1",
    });
    const params = (calls[0]?.template as { parameters: Array<{ key: string; value: string }> })
      ?.parameters;
    expect(params).toEqual(
      expect.arrayContaining([
        { type: "string", key: "demos_text", value: "Νέα: https://opencouncil.gr/athens/jul29_2_2026" },
        { type: "string", key: "link_path", value: "athens/jul29_2_2026" },
      ]),
    );
  });

  it("substitutes a real page rather than sending an empty link_path", async () => {
    const calls = capture();
    await realBird.sendTemplate({
      conversationId: "c1",
      phone: "+306900000001",
      template: "demos_update_news",
      text: "Χωρίς σύνδεσμο.",
      idempotencyKey: "k2",
    });
    const params = (calls[0]?.template as { parameters: Array<{ key: string; value: string }> })
      ?.parameters;
    expect(params).toContainEqual({ type: "string", key: "link_path", value: FALLBACK_LINK_PATH });
  });

  it("sends no parameters at all for a fixed shell", async () => {
    const calls = capture();
    await realBird.sendTemplate({
      conversationId: "c1",
      phone: "+306900000001",
      template: "demos_transition",
      text: "ignored",
      idempotencyKey: "k3",
    });
    expect((calls[0]?.template as { parameters: unknown[] })?.parameters).toEqual([]);
  });
});
