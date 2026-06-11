/**
 * Shared UI state machine for the admin Conversations send forms
 * (`ReplyForm`, `SendTemplateDialog`). Centralizing the state machine here
 * keeps the success/error banner copy and the disabled-button logic in
 * lockstep across every send surface.
 */
export type SendStatus = 'idle' | 'sending' | 'sent' | 'error';
