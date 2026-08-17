import type { TemplateName } from "../../agent/templates";
import type { BirdLike, BirdSendResult } from "../bird";

/**
 * The shared Bird fake: records every call per method. Without an explicit
 * result it succeeds with auto-numbered message ids (bird-1, bird-2, ...)
 * counted across all send kinds.
 */
export class FakeBird implements BirdLike {
  public sends: Array<{ conversationId: string; text: string; idempotencyKey: string }> = [];
  public templateSends: Array<{
    conversationId: string;
    template: TemplateName;
    text: string;
    idempotencyKey: string;
  }> = [];
  public created: Array<{
    phone: string;
    name: string;
    template: TemplateName;
    text: string;
    idempotencyKey: string;
  }> = [];
  public smsSends: Array<{ phone: string; text: string }> = [];

  constructor(
    private result?: BirdSendResult,
    private createResult?: BirdSendResult & { conversationId?: string; alreadyExisted?: boolean },
  ) {}

  private nextResult(): BirdSendResult {
    if (this.result) return this.result;
    const n =
      this.sends.length + this.templateSends.length + this.created.length + this.smsSends.length;
    return { success: true, messageId: `bird-${n}` };
  }

  async sendText(input: { conversationId: string; text: string; idempotencyKey: string }) {
    this.sends.push(input);
    return this.nextResult();
  }

  async sendTemplate(input: {
    conversationId: string;
    template: TemplateName;
    text: string;
    idempotencyKey: string;
  }) {
    this.templateSends.push(input);
    return this.nextResult();
  }

  async createConversationWithTemplate(input: {
    phone: string;
    name: string;
    template: TemplateName;
    text: string;
    idempotencyKey: string;
  }) {
    this.created.push(input);
    if (this.createResult) return this.createResult;
    return { ...this.nextResult(), conversationId: `conv-new-${this.created.length}` };
  }

  async sendSms(input: { phone: string; text: string }) {
    this.smsSends.push(input);
    return this.nextResult();
  }
}
