import { env } from "@/env.mjs";
import { TEMPLATES, type TemplateName } from "@/agent/templates";

/**
 * The Bird (WhatsApp/SMS) client: free-form text and template shells into
 * conversations, conversation creation for cold sends, and the notify-only
 * SMS fallback. Payload shapes mirror the main app's
 * src/lib/notifications/bird.ts, the battle-tested reference.
 *
 * Conversation sends carry an Idempotency-Key derived from the message row
 * id: the row is committed before Bird is called, so a retry replays the
 * same key and Bird returns the original message instead of delivering
 * twice. The SMS channels API has no idempotency support, which is why SMS
 * rows are never re-sent by the sweeper.
 */

export interface BirdSendResult {
  success: boolean;
  messageId?: string;
  status?: number;
  error?: string;
  /** A retry with the same idempotency key can succeed: network errors and
   *  5xx. False for 4xx, Bird-side rejections and missing configuration. */
  retryable?: boolean;
}

export interface BirdLike {
  sendText(input: {
    conversationId: string;
    text: string;
    idempotencyKey: string;
  }): Promise<BirdSendResult>;
  /** A template shell into an EXISTING conversation (cold send, window
   *  closed). `text` fills {{demos_text}}; ignored for fixed templates. */
  sendTemplate(input: {
    conversationId: string;
    template: TemplateName;
    text: string;
    idempotencyKey: string;
  }): Promise<BirdSendResult>;
  /** Cold send to a phone with no conversation yet (enrollment intro, or a
   *  proactive send before any inbound). Bird requires an initialMessage on
   *  creation; a 409 means the conversation already exists — the id is
   *  extracted and the caller re-sends into it. */
  createConversationWithTemplate(input: {
    phone: string;
    name: string;
    template: TemplateName;
    text: string;
    idempotencyKey: string;
  }): Promise<BirdSendResult & { conversationId?: string; alreadyExisted?: boolean }>;
  /** Notify-only SMS (fallback when WhatsApp delivery fails). No
   *  idempotency key — the channels API does not support one. */
  sendSms(input: { phone: string; text: string }): Promise<BirdSendResult>;
}

export function hasBird(): boolean {
  return Boolean(env.BIRD_API_KEY && env.BIRD_WORKSPACE_ID && env.BIRD_WHATSAPP_CHANNEL_ID);
}

/** Bird addresses templates by project id, not by name. */
export function templateProjectId(name: TemplateName): string | undefined {
  switch (name) {
    case "demos_transition":
      return env.BIRD_WHATSAPP_TEMPLATE_DEMOS_TRANSITION;
    case "demos_intro":
      return env.BIRD_WHATSAPP_TEMPLATE_DEMOS_INTRO;
    case "demos_update_agenda":
      return env.BIRD_WHATSAPP_TEMPLATE_DEMOS_UPDATE_AGENDA;
    case "demos_update_news":
      return env.BIRD_WHATSAPP_TEMPLATE_DEMOS_UPDATE_NEWS;
    case "demos_followup":
      return env.BIRD_WHATSAPP_TEMPLATE_DEMOS_FOLLOWUP;
    default:
      // demos_checkin has no send path and deliberately no project id.
      return undefined;
  }
}

interface BirdResponseEnvelope {
  id?: string;
  status?: string;
  detail?: string;
  title?: string;
}

const NOT_CONFIGURED: BirdSendResult = {
  success: false,
  retryable: false,
  error: "Bird is not configured (BIRD_* env vars missing)",
};

/** The Bird wire shape for a template send; parameters only when the shell
 *  carries {{demos_text}}. Null when the project id env var is missing. */
function templateBody(template: TemplateName, text: string) {
  const projectId = templateProjectId(template);
  if (!projectId) return null;
  return {
    projectId,
    version: "latest",
    locale: "el",
    parameters: TEMPLATES[template].hasVariable
      ? [{ type: "string", key: "demos_text", value: text }]
      : [],
  };
}

interface RawBirdResponse {
  ok: boolean;
  status: number;
  json: Record<string, unknown> | null;
  text: string | null;
  networkError?: string;
}

async function birdFetch(
  url: string,
  payload: unknown,
  idempotencyKey?: string,
): Promise<RawBirdResponse> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `AccessKey ${env.BIRD_API_KEY}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, json, text };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      json: null,
      text: null,
      networkError: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/** Map a raw response to the send-result contract shared by every method:
 *  network → retryable, 5xx → retryable, 4xx and in-body rejections → not. */
function toSendResult(raw: RawBirdResponse, what: string): BirdSendResult {
  if (raw.networkError) {
    console.error(`Bird ${what} error:`, raw.networkError);
    return { success: false, retryable: true, error: raw.networkError };
  }
  if (!raw.ok) {
    console.error(`Bird ${what} failed (${raw.status}):`, raw.text);
    return {
      success: false,
      status: raw.status,
      retryable: raw.status >= 500,
      error: `API returned ${raw.status}: ${raw.text}`,
    };
  }
  const envelope = (raw.json ?? {}) as BirdResponseEnvelope;
  // A 2xx body can still carry an immediate failure status.
  if (envelope.status === "failed" || envelope.status === "rejected") {
    return {
      success: false,
      retryable: false,
      error: envelope.detail || envelope.title || `Bird status: ${envelope.status}`,
    };
  }
  return { success: true, messageId: envelope.id };
}

/** Bird's 409 carries the existing conversation in a free-form details
 *  object; try the known keys, then scan every string for a UUID (the
 *  main app's proven recovery). */
export function extractConflictingConversationId(
  json: Record<string, unknown> | null,
  text: string | null,
): string | undefined {
  const direct = json as
    | {
        conversationId?: string;
        id?: string;
        details?: Record<string, unknown>;
      }
    | null;
  for (const candidate of [
    direct?.conversationId,
    direct?.id,
    direct?.details?.conversationId,
    direct?.details?.id,
    direct?.details?.conflictingResource,
    direct?.details?.resource,
    direct?.details?.existingConversationId,
  ]) {
    if (typeof candidate === "string" && UUID_RE.test(candidate)) return candidate;
  }
  const scanned = (text ?? "").match(UUID_RE);
  return scanned?.[0];
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function conversationMessagesUrl(conversationId: string): string {
  return `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/conversations/${conversationId}/messages`;
}

export const realBird: BirdLike = {
  async sendText({ conversationId, text, idempotencyKey }) {
    if (!hasBird()) return NOT_CONFIGURED;
    const raw = await birdFetch(
      conversationMessagesUrl(conversationId),
      {
        participantId: env.BIRD_WHATSAPP_CHANNEL_ID,
        participantType: "flow",
        body: { type: "text", text: { text } },
      },
      idempotencyKey,
    );
    return toSendResult(raw, "send");
  },

  async sendTemplate({ conversationId, template, text, idempotencyKey }) {
    if (!hasBird()) return NOT_CONFIGURED;
    const body = templateBody(template, text);
    if (!body) {
      return {
        success: false,
        retryable: false,
        error: `No Bird project id configured for template ${template}`,
      };
    }
    const raw = await birdFetch(
      conversationMessagesUrl(conversationId),
      {
        participantId: env.BIRD_WHATSAPP_CHANNEL_ID,
        participantType: "flow",
        template: body,
      },
      idempotencyKey,
    );
    return toSendResult(raw, `template ${template}`);
  },

  async createConversationWithTemplate({ phone, name, template, text, idempotencyKey }) {
    if (!hasBird()) return NOT_CONFIGURED;
    const body = templateBody(template, text);
    if (!body) {
      return {
        success: false,
        retryable: false,
        error: `No Bird project id configured for template ${template}`,
      };
    }
    const recipients = [
      { type: "to", identifierKey: "phonenumber", identifierValue: phone },
    ];
    const raw = await birdFetch(
      `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/conversations`,
      {
        name,
        channelId: env.BIRD_WHATSAPP_CHANNEL_ID,
        participants: [
          { type: "contact", identifierKey: "phonenumber", identifierValue: phone },
        ],
        // Bird refuses an empty conversation — creation and the first
        // template ride together.
        initialMessage: { recipients, template: body },
      },
      idempotencyKey,
    );

    if (raw.status === 409) {
      const conversationId = extractConflictingConversationId(raw.json, raw.text);
      if (conversationId) {
        return { success: false, retryable: false, alreadyExisted: true, conversationId };
      }
      // A conflict without a recoverable id: surface it, don't retry blindly.
      return {
        success: false,
        status: 409,
        retryable: false,
        error: `Conversation conflict without a recoverable id: ${raw.text}`,
      };
    }

    const result = toSendResult(raw, `conversation for ${template}`);
    if (!result.success) return result;
    const data = (raw.json ?? {}) as {
      id?: string;
      conversationId?: string;
      conversation?: { id?: string };
      initialMessage?: { id?: string };
      lastMessage?: { id?: string };
      messageId?: string;
    };
    return {
      ...result,
      conversationId: data.id ?? data.conversationId ?? data.conversation?.id,
      messageId:
        data.initialMessage?.id ?? data.lastMessage?.id ?? data.messageId ?? result.messageId,
    };
  },

  async sendSms({ phone, text }) {
    if (!hasBird() || !env.BIRD_SMS_CHANNEL_ID) {
      return {
        success: false,
        retryable: false,
        error: "Bird SMS is not configured (BIRD_SMS_CHANNEL_ID missing)",
      };
    }
    const raw = await birdFetch(
      `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${env.BIRD_SMS_CHANNEL_ID}/messages`,
      {
        receiver: { contacts: [{ identifierValue: phone }] },
        body: { type: "text", text: { text } },
      },
    );
    return toSendResult(raw, "sms");
  },
};
