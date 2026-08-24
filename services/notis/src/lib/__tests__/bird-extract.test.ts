/**
 * Ported from the main app's src/app/api/webhooks/bird/__tests__/extract.test.ts.
 * One deliberate divergence: notis maps Bird's `read` to its own `read`
 * status instead of collapsing it into `delivered`.
 */
import {
  bodyIsPreviewOnly,
  extractBody,
  extractChannel,
  extractDirection,
  extractInboundPhone,
  extractMessageFields,
  extractOutboundPhone,
  extractPhone,
  mapBirdMessageStatus,
  unwrapEvent,
  type BirdMessageLike,
} from "../bird-extract";

describe("unwrapEvent", () => {
  it("treats a conversation.updated event as the conversation, pulling lastMessage", () => {
    const result = unwrapEvent({
      event: "conversation.updated",
      payload: {
        id: "conv-123",
        channelId: "ch-wa",
        lastMessage: { id: "msg-1", body: "hi" },
      },
    });

    expect(result.conversationId).toBe("conv-123");
    expect(result.payloadChannelId).toBe("ch-wa");
    expect(result.message?.id).toBe("msg-1");
  });

  it("falls back to payload.message when the event is not conversation.updated", () => {
    const result = unwrapEvent({
      event: "message.created",
      payload: {
        message: { id: "msg-9", conversationId: "conv-9", channelId: "ch-sms" },
      },
    });

    expect(result.message?.id).toBe("msg-9");
    expect(result.conversationId).toBe("conv-9");
    expect(result.payloadChannelId).toBe("ch-sms");
  });

  it("accepts the legacy `data` envelope alongside `payload`", () => {
    const result = unwrapEvent({
      data: { message: { id: "msg-d", conversation_id: "conv-d" } },
    });

    expect(result.message?.id).toBe("msg-d");
    expect(result.conversationId).toBe("conv-d");
  });

  it("treats the raw object as the payload when no wrapper is present", () => {
    const result = unwrapEvent({
      id: "msg-raw",
      conversationId: "conv-raw",
      channelId: "ch-raw",
      body: "unwrapped",
    });

    expect(result.message?.id).toBe("msg-raw");
    expect(result.conversationId).toBe("conv-raw");
    expect(result.payloadChannelId).toBe("ch-raw");
  });

  it("does not crash on null / undefined / non-objects", () => {
    expect(unwrapEvent(null).message).toBeDefined();
    expect(unwrapEvent(undefined).message).toBeDefined();
  });
});

describe("extractDirection", () => {
  it("respects explicit direction hints", () => {
    expect(extractDirection({ direction: "outbound" })).toBe("outbound");
    expect(extractDirection({ direction: "OUT" })).toBe("outbound");
    expect(extractDirection({ direction: "inbound" })).toBe("inbound");
    expect(extractDirection({ kind: "outbound" })).toBe("outbound");
  });

  it("falls back to sender.type: contact → inbound, anything else → outbound", () => {
    expect(extractDirection({ sender: { type: "contact" } })).toBe("inbound");
    expect(extractDirection({ sender: { type: "flow" } })).toBe("outbound");
  });

  it("defaults to inbound when no signal is present", () => {
    expect(extractDirection({})).toBe("inbound");
    expect(extractDirection(undefined)).toBe("inbound");
  });
});

describe("extractInboundPhone", () => {
  it("prefers sender.contact.identifierValue", () => {
    expect(
      extractInboundPhone({ sender: { contact: { identifierValue: "+306900000001" } } }),
    ).toBe("+306900000001");
  });

  it("walks the fallback chain (from-object, from-string, sender, contact, participant)", () => {
    expect(extractInboundPhone({ from: { identifierValue: "+306900000003" } })).toBe(
      "+306900000003",
    );
    expect(extractInboundPhone({ from: "+306900000004" })).toBe("+306900000004");
    expect(extractInboundPhone({ sender: { identifierValue: "+306900000005" } })).toBe(
      "+306900000005",
    );
    expect(extractInboundPhone({ contact: { identifierValue: "+306900000006" } })).toBe(
      "+306900000006",
    );
    expect(extractInboundPhone({ participant: { identifierValue: "+306900000007" } })).toBe(
      "+306900000007",
    );
  });

  it("does NOT look at recipients (outbound-only path)", () => {
    expect(extractInboundPhone({ recipients: [{ identifierValue: "+306900000008" }] })).toBeUndefined();
  });
});

describe("extractOutboundPhone", () => {
  it("reads the first recipient on the message", () => {
    expect(extractOutboundPhone({ recipients: [{ identifierValue: "+306900000010" }] }, {})).toBe(
      "+306900000010",
    );
  });

  it("falls back to the conversation contact in featuredParticipants", () => {
    expect(
      extractOutboundPhone(
        {},
        {
          featuredParticipants: [
            { type: "flow", contact: { identifierValue: "+30ignore" } },
            { type: "contact", contact: { identifierValue: "+306900000011" } },
          ],
        },
      ),
    ).toBe("+306900000011");
  });

  it("does NOT look at sender fields (inbound-only path)", () => {
    expect(
      extractOutboundPhone({ sender: { contact: { identifierValue: "+30nope" } } }, {}),
    ).toBeUndefined();
  });
});

describe("extractPhone", () => {
  it("dispatches by direction without crossing paths", () => {
    const inboundMsg: BirdMessageLike = { sender: { contact: { identifierValue: "+30in" } } };
    const outboundMsg: BirdMessageLike = { recipients: [{ identifierValue: "+30out" }] };
    expect(extractPhone("inbound", inboundMsg, {})).toBe("+30in");
    expect(extractPhone("outbound", outboundMsg, {})).toBe("+30out");
    expect(extractPhone("outbound", inboundMsg, {})).toBeUndefined();
  });
});

describe("extractBody", () => {
  it("prefers the full body over the truncated preview snippet", () => {
    expect(extractBody({ preview: { text: "truncated…" }, text: "full body wins" })).toBe(
      "full body wins",
    );
    expect(
      extractBody({ preview: { text: "truncated…" }, body: { text: { text: "nested full" } } }),
    ).toBe("nested full");
    expect(extractBody({ preview: { text: "truncated…" }, body: "full string body" })).toBe(
      "full string body",
    );
  });

  it("reads every body variant and falls back to preview, then empty", () => {
    expect(extractBody({ body: { text: { text: "nested" } } })).toBe("nested");
    expect(extractBody({ body: { text: "flat" } })).toBe("flat");
    expect(extractBody({ text: "top" })).toBe("top");
    expect(extractBody({ body: "string-body" })).toBe("string-body");
    expect(extractBody({ preview: { text: "preview fallback" } })).toBe("preview fallback");
    expect(extractBody({})).toBe("");
    expect(extractBody(undefined)).toBe("");
  });
});

describe("bodyIsPreviewOnly", () => {
  it("marks a body that is only Bird's truncated conversation-list snippet", () => {
    expect(bodyIsPreviewOnly({ preview: { text: "cut at ~140 chars…" } })).toBe(true);
  });

  it("clears every shape that carries the message's own text", () => {
    expect(bodyIsPreviewOnly({ preview: { text: "cut…" }, text: "full" })).toBe(false);
    expect(bodyIsPreviewOnly({ preview: { text: "cut…" }, body: { text: { text: "full" } } })).toBe(
      false,
    );
    expect(bodyIsPreviewOnly({ preview: { text: "cut…" }, body: { text: "full" } })).toBe(false);
    expect(bodyIsPreviewOnly({ preview: { text: "cut…" }, body: "full" })).toBe(false);
  });

  it("clears an event with no text at all — an empty body is not a truncation", () => {
    expect(bodyIsPreviewOnly({})).toBe(false);
    expect(bodyIsPreviewOnly(undefined)).toBe(false);
    expect(bodyIsPreviewOnly({ preview: {} })).toBe(false);
  });

  it("flags the conversation.updated shape end to end", () => {
    const fields = extractMessageFields(
      {
        event: "conversation.updated",
        payload: {
          id: "conv-1",
          lastMessage: {
            id: "bm-1",
            sender: { type: "contact", contact: { identifierValue: "+3069" } },
            preview: { text: "Mou ehoun erthei dio emails gia theseis stathmefsis, kai" },
          },
        },
      },
      {},
    );
    expect(fields.bodyFromPreview).toBe(true);
    expect(fields.body).toBe("Mou ehoun erthei dio emails gia theseis stathmefsis, kai");
  });
});

describe("extractChannel", () => {
  const channelIds = { sms: "ch-sms-id", whatsapp: "ch-wa-id" };

  it("matches configured channel IDs", () => {
    expect(extractChannel("ch-sms-id", {}, channelIds)).toBe("sms");
    expect(extractChannel("ch-wa-id", {}, channelIds)).toBe("whatsapp");
  });

  it("falls back to the channel string hint, then whatsapp", () => {
    expect(extractChannel(undefined, { channel: "channel-sms-eu" }, channelIds)).toBe("sms");
    expect(extractChannel("different-id", {}, channelIds)).toBe("whatsapp");
    expect(extractChannel(undefined, undefined, channelIds)).toBe("whatsapp");
  });
});

describe("mapBirdMessageStatus", () => {
  it("keeps `read` distinct from `delivered` (notis divergence)", () => {
    expect(mapBirdMessageStatus("read")).toBe("read");
    expect(mapBirdMessageStatus("delivered")).toBe("delivered");
  });

  it("maps failures, pending and the sent default", () => {
    expect(mapBirdMessageStatus("rejected")).toBe("failed");
    expect(mapBirdMessageStatus("delivery_failed")).toBe("failed");
    expect(mapBirdMessageStatus("queued")).toBe("pending");
    expect(mapBirdMessageStatus("accepted")).toBe("sent");
    expect(mapBirdMessageStatus(undefined)).toBe("sent");
  });
});

describe("extractMessageFields", () => {
  const channelIds = { sms: "ch-sms-id", whatsapp: "ch-wa-id" };

  it("extracts a typical inbound WhatsApp message.created event", () => {
    const event = {
      event: "message.created",
      payload: {
        message: {
          id: "msg-inbound-1",
          conversationId: "conv-1",
          channelId: "ch-wa-id",
          direction: "inbound",
          status: "delivered",
          sender: { type: "contact", contact: { identifierValue: "+306900000100" } },
          body: { text: { text: "Τι ψηφίστηκε χθες;" } },
        },
      },
    };

    expect(extractMessageFields(event, channelIds)).toEqual({
      birdMessageId: "msg-inbound-1",
      conversationId: "conv-1",
      direction: "inbound",
      bodyFromPreview: false,
      phone: "+306900000100",
      body: "Τι ψηφίστηκε χθες;",
      channel: "whatsapp",
      status: "delivered",
      failureReason: undefined,
    });
  });

  it("extracts a typical outbound conversation.updated event", () => {
    const event = {
      event: "conversation.updated",
      payload: {
        id: "conv-2",
        channelId: "ch-wa-id",
        lastMessage: {
          id: "msg-outbound-1",
          direction: "outbound",
          status: "read",
          sender: { type: "flow" },
          recipients: [{ identifierValue: "+306900000200" }],
        },
      },
    };

    const fields = extractMessageFields(event, channelIds);
    expect(fields.birdMessageId).toBe("msg-outbound-1");
    expect(fields.direction).toBe("outbound");
    expect(fields.phone).toBe("+306900000200");
    expect(fields.conversationId).toBe("conv-2");
    expect(fields.status).toBe("read");
  });

  it("maps a failed status and surfaces the failure reason", () => {
    const event = {
      payload: {
        message: {
          id: "msg-fail",
          status: "delivery_failed",
          failure: { description: "outside 24h window" },
          direction: "outbound",
          recipients: [{ identifierValue: "+306900000400" }],
        },
      },
    };

    const fields = extractMessageFields(event, channelIds);
    expect(fields.status).toBe("failed");
    expect(fields.failureReason).toBe("outside 24h window");
  });

  it("handles a malformed / unknown event without throwing", () => {
    expect(() => extractMessageFields(null, channelIds)).not.toThrow();
    expect(() => extractMessageFields({}, channelIds)).not.toThrow();
    expect(() => extractMessageFields("not an object", channelIds)).not.toThrow();
  });
});
