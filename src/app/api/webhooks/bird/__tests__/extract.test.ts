/** @jest-environment node */
import {
    buildDedupeId,
    extractBody,
    extractChannel,
    extractDirection,
    extractInboundPhone,
    extractMessageFields,
    extractOutboundPhone,
    extractPhone,
    unwrapEvent,
    type BirdMessageLike,
    type ExtractedMessageFields,
} from '../extract';

// ---------------------------------------------------------------------------
// unwrapEvent
// ---------------------------------------------------------------------------

describe('unwrapEvent', () => {
    it('treats a conversation.updated event as the conversation, pulling lastMessage', () => {
        const result = unwrapEvent({
            event: 'conversation.updated',
            payload: {
                id: 'conv-123',
                channelId: 'ch-wa',
                lastMessage: { id: 'msg-1', body: 'hi' },
            },
        });

        expect(result.conversationId).toBe('conv-123');
        expect(result.payloadChannelId).toBe('ch-wa');
        expect(result.message?.id).toBe('msg-1');
    });

    it('falls back to payload.message when the event is not conversation.updated', () => {
        const result = unwrapEvent({
            event: 'message.created',
            payload: {
                message: {
                    id: 'msg-9',
                    conversationId: 'conv-9',
                    channelId: 'ch-sms',
                },
            },
        });

        expect(result.message?.id).toBe('msg-9');
        expect(result.conversationId).toBe('conv-9');
        expect(result.payloadChannelId).toBe('ch-sms');
    });

    it('accepts the legacy `data` envelope alongside `payload`', () => {
        const result = unwrapEvent({
            data: { message: { id: 'msg-d', conversation_id: 'conv-d' } },
        });

        expect(result.message?.id).toBe('msg-d');
        // Note `conversation_id` (snake) — extractor recognizes both forms.
        expect(result.conversationId).toBe('conv-d');
    });

    it('treats the raw object as the payload when no wrapper is present', () => {
        const result = unwrapEvent({
            id: 'msg-raw',
            conversationId: 'conv-raw',
            channelId: 'ch-raw',
            body: 'unwrapped',
        });

        expect(result.message?.id).toBe('msg-raw');
        expect(result.conversationId).toBe('conv-raw');
        expect(result.payloadChannelId).toBe('ch-raw');
    });

    it('does not crash on null / undefined / non-objects', () => {
        expect(unwrapEvent(null).message).toBeDefined();
        expect(unwrapEvent(undefined).message).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// extractDirection
// ---------------------------------------------------------------------------

describe('extractDirection', () => {
    it('respects an explicit `direction: outbound` hint', () => {
        expect(extractDirection({ direction: 'outbound' })).toBe('outbound');
        expect(extractDirection({ direction: 'OUT' })).toBe('outbound');
    });

    it('respects an explicit `direction: inbound` hint', () => {
        expect(extractDirection({ direction: 'inbound' })).toBe('inbound');
        expect(extractDirection({ direction: 'IN' })).toBe('inbound');
    });

    it('reads `kind` as an alternative direction hint', () => {
        expect(extractDirection({ kind: 'outbound' })).toBe('outbound');
        expect(extractDirection({ kind: 'inbound' })).toBe('inbound');
    });

    it('falls back to sender.type=contact → inbound', () => {
        expect(extractDirection({ sender: { type: 'contact' } })).toBe('inbound');
    });

    it('treats any non-contact sender.type as outbound (e.g. flow)', () => {
        expect(extractDirection({ sender: { type: 'flow' } })).toBe('outbound');
        expect(extractDirection({ sender: { type: 'agent' } })).toBe('outbound');
    });

    it('defaults to inbound when no signal is present', () => {
        expect(extractDirection({})).toBe('inbound');
        expect(extractDirection(undefined)).toBe('inbound');
    });
});

// ---------------------------------------------------------------------------
// extractInboundPhone
// ---------------------------------------------------------------------------

describe('extractInboundPhone', () => {
    it('prefers sender.contact.identifierValue', () => {
        expect(
            extractInboundPhone({
                sender: { contact: { identifierValue: '+306900000001' } },
            }),
        ).toBe('+306900000001');
    });

    it('falls back to sender.contact.platformAddress', () => {
        expect(
            extractInboundPhone({
                sender: { contact: { platformAddress: '+306900000002' } },
            }),
        ).toBe('+306900000002');
    });

    it('reads `from` as an object with identifierValue', () => {
        expect(
            extractInboundPhone({ from: { identifierValue: '+306900000003' } }),
        ).toBe('+306900000003');
    });

    it('reads `from` as a string', () => {
        expect(extractInboundPhone({ from: '+306900000004' })).toBe('+306900000004');
    });

    it('falls back to sender.identifierValue', () => {
        expect(
            extractInboundPhone({ sender: { identifierValue: '+306900000005' } }),
        ).toBe('+306900000005');
    });

    it('falls back to contact.identifierValue', () => {
        expect(
            extractInboundPhone({ contact: { identifierValue: '+306900000006' } }),
        ).toBe('+306900000006');
    });

    it('falls back to participant.identifierValue last', () => {
        expect(
            extractInboundPhone({ participant: { identifierValue: '+306900000007' } }),
        ).toBe('+306900000007');
    });

    it('does NOT look at recipients (that is an outbound-only path)', () => {
        expect(
            extractInboundPhone({ recipients: [{ identifierValue: '+306900000008' }] }),
        ).toBeUndefined();
    });

    it('returns undefined when nothing is set', () => {
        expect(extractInboundPhone({})).toBeUndefined();
        expect(extractInboundPhone(undefined)).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// extractOutboundPhone
// ---------------------------------------------------------------------------

describe('extractOutboundPhone', () => {
    it('reads the first recipient on the message', () => {
        expect(
            extractOutboundPhone(
                { recipients: [{ identifierValue: '+306900000010' }] },
                {},
            ),
        ).toBe('+306900000010');
    });

    it('falls back to the conversation contact in featuredParticipants', () => {
        expect(
            extractOutboundPhone(
                {},
                {
                    featuredParticipants: [
                        { type: 'flow', contact: { identifierValue: '+30ignore' } },
                        { type: 'contact', contact: { identifierValue: '+306900000011' } },
                    ],
                },
            ),
        ).toBe('+306900000011');
    });

    it('ignores non-contact featuredParticipants', () => {
        expect(
            extractOutboundPhone(
                {},
                {
                    featuredParticipants: [
                        { type: 'flow', contact: { identifierValue: '+30nope' } },
                    ],
                },
            ),
        ).toBeUndefined();
    });

    it('does NOT look at sender fields (that is an inbound-only path)', () => {
        expect(
            extractOutboundPhone(
                { sender: { contact: { identifierValue: '+30nope' } } },
                {},
            ),
        ).toBeUndefined();
    });

    it('returns undefined when nothing is set', () => {
        expect(extractOutboundPhone({}, {})).toBeUndefined();
        expect(extractOutboundPhone(undefined, {})).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// extractPhone (dispatcher)
// ---------------------------------------------------------------------------

describe('extractPhone', () => {
    it('uses the inbound chain for inbound direction', () => {
        const msg: BirdMessageLike = { sender: { contact: { identifierValue: '+30inbound' } } };
        expect(extractPhone('inbound', msg, {})).toBe('+30inbound');
    });

    it('uses the outbound chain for outbound direction', () => {
        const msg: BirdMessageLike = { recipients: [{ identifierValue: '+30outbound' }] };
        expect(extractPhone('outbound', msg, {})).toBe('+30outbound');
    });

    it('does not cross paths — outbound never reads sender fields', () => {
        const msg: BirdMessageLike = { sender: { contact: { identifierValue: '+30wrong' } } };
        expect(extractPhone('outbound', msg, {})).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// extractBody
// ---------------------------------------------------------------------------

describe('extractBody', () => {
    it('prefers preview.text', () => {
        expect(extractBody({ preview: { text: 'preview wins' }, text: 'loses' })).toBe('preview wins');
    });

    it('reads body.text.text (nested object form)', () => {
        expect(extractBody({ body: { text: { text: 'nested' } } })).toBe('nested');
    });

    it('reads body.text (flat string-on-object form)', () => {
        expect(extractBody({ body: { text: 'flat' } })).toBe('flat');
    });

    it('reads top-level text', () => {
        expect(extractBody({ text: 'top' })).toBe('top');
    });

    it('reads body when it is a plain string', () => {
        expect(extractBody({ body: 'string-body' })).toBe('string-body');
    });

    it('returns empty string when nothing is set', () => {
        expect(extractBody({})).toBe('');
        expect(extractBody(undefined)).toBe('');
    });
});

// ---------------------------------------------------------------------------
// extractChannel
// ---------------------------------------------------------------------------

describe('extractChannel', () => {
    const channelIds = { sms: 'ch-sms-id', whatsapp: 'ch-wa-id' };

    it('matches SMS channel ID', () => {
        expect(extractChannel('ch-sms-id', {}, channelIds)).toBe('sms');
    });

    it('matches WhatsApp channel ID', () => {
        expect(extractChannel('ch-wa-id', {}, channelIds)).toBe('whatsapp');
    });

    it('falls back to message.channel string hint containing "sms"', () => {
        expect(extractChannel(undefined, { channel: 'channel-sms-eu' }, channelIds)).toBe('sms');
        expect(extractChannel('unknown-id', { channel: 'SMS' }, channelIds)).toBe('sms');
    });

    it('defaults to whatsapp when no signal is present', () => {
        expect(extractChannel(undefined, {}, channelIds)).toBe('whatsapp');
        expect(extractChannel(undefined, undefined, channelIds)).toBe('whatsapp');
    });

    it('ignores an unknown payloadChannelId and falls through', () => {
        expect(extractChannel('different-id', {}, channelIds)).toBe('whatsapp');
    });

    it('still works when channelIds are unconfigured', () => {
        expect(extractChannel('any', { channel: 'sms' }, {})).toBe('sms');
        expect(extractChannel('any', {}, {})).toBe('whatsapp');
    });
});

// ---------------------------------------------------------------------------
// extractMessageFields (orchestrator integration)
// ---------------------------------------------------------------------------

describe('extractMessageFields', () => {
    const channelIds = { sms: 'ch-sms-id', whatsapp: 'ch-wa-id' };

    it('extracts a typical inbound WhatsApp message.created event', () => {
        const event = {
            event: 'message.created',
            payload: {
                message: {
                    id: 'msg-inbound-1',
                    conversationId: 'conv-1',
                    channelId: 'ch-wa-id',
                    direction: 'inbound',
                    status: 'delivered',
                    sender: {
                        type: 'contact',
                        contact: { identifierValue: '+306900000100' },
                    },
                    body: { text: { text: 'STOP' } },
                },
            },
        };

        const fields = extractMessageFields(event, channelIds);

        expect(fields).toEqual({
            birdMessageId: 'msg-inbound-1',
            conversationId: 'conv-1',
            direction: 'inbound',
            phone: '+306900000100',
            body: 'STOP',
            channel: 'whatsapp',
            status: 'delivered',
            failureReason: undefined,
        });
    });

    it('extracts a typical outbound conversation.updated event', () => {
        const event = {
            event: 'conversation.updated',
            payload: {
                id: 'conv-2',
                channelId: 'ch-wa-id',
                lastMessage: {
                    id: 'msg-outbound-1',
                    direction: 'outbound',
                    status: 'sent',
                    sender: { type: 'flow' },
                    recipients: [{ identifierValue: '+306900000200' }],
                },
                featuredParticipants: [
                    { type: 'contact', contact: { identifierValue: '+30ignored' } },
                ],
            },
        };

        const fields = extractMessageFields(event, channelIds);

        expect(fields.birdMessageId).toBe('msg-outbound-1');
        expect(fields.direction).toBe('outbound');
        expect(fields.phone).toBe('+306900000200');
        expect(fields.conversationId).toBe('conv-2');
        expect(fields.channel).toBe('whatsapp');
        expect(fields.status).toBe('sent');
    });

    it('uses featuredParticipants as outbound phone fallback when recipients is missing', () => {
        const event = {
            event: 'conversation.updated',
            payload: {
                id: 'conv-3',
                channelId: 'ch-wa-id',
                lastMessage: {
                    id: 'msg-3',
                    direction: 'outbound',
                    sender: { type: 'flow' },
                },
                featuredParticipants: [
                    { type: 'contact', contact: { identifierValue: '+306900000300' } },
                ],
            },
        };

        expect(extractMessageFields(event, channelIds).phone).toBe('+306900000300');
    });

    it('maps a failed status and surfaces the failure reason', () => {
        const event = {
            payload: {
                message: {
                    id: 'msg-fail',
                    status: 'delivery_failed',
                    failure: { description: 'outside 24h window' },
                    direction: 'outbound',
                    recipients: [{ identifierValue: '+306900000400' }],
                },
            },
        };

        const fields = extractMessageFields(event, channelIds);

        expect(fields.status).toBe('failed');
        expect(fields.failureReason).toBe('outside 24h window');
    });

    it('matches SMS channel by ID', () => {
        const event = {
            payload: {
                message: {
                    id: 'msg-sms',
                    channelId: 'ch-sms-id',
                    direction: 'inbound',
                    sender: { type: 'contact', contact: { identifierValue: '+306900000500' } },
                    body: 'sms text',
                },
            },
        };

        expect(extractMessageFields(event, channelIds).channel).toBe('sms');
    });

    it('reads messageId as a fallback for id', () => {
        const event = {
            payload: { message: { messageId: 'msg-alt-id', body: 'x' } },
        };

        expect(extractMessageFields(event, channelIds).birdMessageId).toBe('msg-alt-id');
    });

    it('returns undefined phone when nothing matches — the route guard catches this', () => {
        const event = {
            payload: { message: { id: 'msg-no-phone', body: 'x' } },
        };

        expect(extractMessageFields(event, channelIds).phone).toBeUndefined();
    });

    it('handles a malformed / unknown event without throwing', () => {
        expect(() => extractMessageFields(null, channelIds)).not.toThrow();
        expect(() => extractMessageFields({}, channelIds)).not.toThrow();
        expect(() => extractMessageFields('not an object', channelIds)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// buildDedupeId
// ---------------------------------------------------------------------------

describe('buildDedupeId', () => {
    const fields = (overrides: Partial<ExtractedMessageFields> = {}): ExtractedMessageFields => ({
        direction: 'inbound',
        body: 'hi',
        channel: 'whatsapp',
        status: 'delivered',
        birdMessageId: 'msg-1',
        ...overrides,
    });

    it('composes payload.id, message id and status joined by "|"', () => {
        expect(buildDedupeId({ payload: { id: 'evt-1' } }, fields())).toBe('evt-1|msg-1|delivered');
    });

    it('prefers payload.id over data.id', () => {
        expect(buildDedupeId({ payload: { id: 'p' }, data: { id: 'd' } }, fields())).toBe(
            'p|msg-1|delivered',
        );
    });

    it('falls back to data.id when payload.id is absent', () => {
        expect(buildDedupeId({ data: { id: 'd-2' } }, fields())).toBe('d-2|msg-1|delivered');
    });

    it('falls back to "-" for the event id when neither payload.id nor data.id is present', () => {
        expect(buildDedupeId({}, fields())).toBe('-|msg-1|delivered');
        expect(buildDedupeId(null, fields())).toBe('-|msg-1|delivered');
    });

    it('falls back to "-" for a missing birdMessageId', () => {
        expect(buildDedupeId({ payload: { id: 'evt-1' } }, fields({ birdMessageId: undefined }))).toBe(
            'evt-1|-|delivered',
        );
    });

    it('keeps distinct keys across status progressions of the same message', () => {
        const sent = buildDedupeId({ payload: { id: 'evt-1' } }, fields({ status: 'sent' }));
        const delivered = buildDedupeId({ payload: { id: 'evt-1' } }, fields({ status: 'delivered' }));
        expect(sent).not.toBe(delivered);
    });

    it('does not let a value containing the legacy ":" forge a collision', () => {
        // With ":" the keys "a:b" + "c" and "a" + "b:c" used to collide; "|" keeps them distinct.
        const a = buildDedupeId({ payload: { id: 'a:b' } }, fields({ birdMessageId: 'c' }));
        const b = buildDedupeId({ payload: { id: 'a' } }, fields({ birdMessageId: 'b:c' }));
        expect(a).not.toBe(b);
    });
});
