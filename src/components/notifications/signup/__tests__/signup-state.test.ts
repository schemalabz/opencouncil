import type { Topic } from '@prisma/client';
import {
    buildSubmission,
    channelIssues,
    initialSignupState,
    notisActionFor,
    phoneChannelDefault,
    phoneChannelLocked,
    type SignupState,
} from '../signup-state';

const topic = (id: string): Topic =>
    ({ id, name: id, name_en: id, colorHex: '#000', icon: null, description: '', deprecated: false, realm: 'greece' }) as Topic;

const account = { name: 'Μαρία', email: 'maria@example.com', phone: '+306900000001', notifyByPhone: true };
const existing = {
    locations: [{ text: 'Κυψέλη', coordinates: [23.73, 37.99] as [number, number] }],
    topics: [topic('t1')],
    notifyByEmail: true,
};

describe('initialSignupState', () => {
    it('starts a new reader with WhatsApp on, email off, and the account prefilled when signed in', () => {
        const state = initialSignupState({ initialStep: 1, existing: null, account });
        expect(state).toMatchObject({
            step: 1,
            locations: [],
            topics: [],
            phoneChannel: true,
            emailChannel: false,
            phone: '+306900000001',
            name: 'Μαρία',
            email: 'maria@example.com',
        });
        expect(initialSignupState({ initialStep: 2, existing: null, account: null })).toMatchObject({
            step: 2,
            phone: '',
            name: '',
            email: '',
        });
    });

    it('brings back a saved preference, the email channel included', () => {
        const state = initialSignupState({ initialStep: 2, existing, account });
        expect(state.locations).toEqual(existing.locations);
        expect(state.topics).toEqual(existing.topics);
        expect(state.emailChannel).toBe(true);
    });
});

describe('phoneChannelDefault', () => {
    it('lets Notis decide for a reader he knows, whatever the reader asked for here', () => {
        expect(phoneChannelDefault('active', { ...account, notifyByPhone: false })).toBe(true);
        expect(phoneChannelDefault('unsubscribed', account)).toBe(false);
    });

    it("starts from the reader's own request when Notis has not met them, whatever the municipality", () => {
        expect(phoneChannelDefault(null, account)).toBe(true);
        expect(phoneChannelDefault(null, { ...account, notifyByPhone: false })).toBe(false);
    });

    it('freezes on the reader’s request when Notis did not answer, and never shows OFF on a guess', () => {
        expect(phoneChannelDefault('unknown', account)).toBe(true);
        expect(phoneChannelDefault('unknown', { ...account, notifyByPhone: false })).toBe(false);
    });

    it('starts a signed-out reader with WhatsApp on', () => {
        expect(phoneChannelDefault(null, null)).toBe(true);
    });
});

describe('phoneChannelLocked', () => {
    it('locks the card only while Notis has not answered', () => {
        expect(phoneChannelLocked('unknown')).toBe(true);
        expect(phoneChannelLocked('active')).toBe(false);
        expect(phoneChannelLocked('unsubscribed')).toBe(false);
        expect(phoneChannelLocked(null)).toBe(false);
    });
});

describe('notisActionFor', () => {
    const ticked = { phoneChannel: true } as SignupState;
    const unticked = { phoneChannel: false } as SignupState;

    it('re-activates only on an explicit tick from a reader Notis does not serve', () => {
        expect(notisActionFor(ticked, true, 'unsubscribed')).toBe('activate');
        expect(notisActionFor(ticked, true, 'active')).toBeNull();
        expect(notisActionFor(ticked, true, null)).toBeNull();
    });

    it('releases a served reader who unticked — the card is the profile switch — and never touches Notis for a signed-out reader', () => {
        expect(notisActionFor(unticked, true, 'active')).toBe('release');
        expect(notisActionFor(unticked, true, 'unsubscribed')).toBeNull();
        expect(notisActionFor(ticked, false, 'unsubscribed')).toBeNull();
    });

    it('decides nothing in either direction while Notis has not answered', () => {
        expect(notisActionFor(ticked, true, 'unknown')).toBeNull();
        expect(notisActionFor(unticked, true, 'unknown')).toBeNull();
    });
});

describe('channelIssues', () => {
    const base: SignupState = {
        step: 3,
        locations: [],
        topics: [],
        phoneChannel: true,
        emailChannel: false,
        phone: '+306900000001',
        name: 'Μαρία',
        email: 'maria@example.com',
    };
    const ok = { phoneEmpty: false, phoneValid: true, signedIn: true };

    it('passes a complete delivery step', () => {
        expect(channelIssues(base, ok)).toEqual([]);
    });

    it('needs at least one channel', () => {
        expect(channelIssues({ ...base, phoneChannel: false }, ok)).toEqual(['no_channel']);
        expect(channelIssues({ ...base, phoneChannel: false, emailChannel: true }, ok)).toEqual([]);
    });

    it('needs a valid mobile while WhatsApp is on, and none while it is off', () => {
        expect(channelIssues(base, { ...ok, phoneEmpty: true, phoneValid: false })).toEqual(['phone_missing']);
        expect(channelIssues(base, { ...ok, phoneValid: false })).toEqual(['phone_invalid']);
        expect(
            channelIssues({ ...base, phoneChannel: false, emailChannel: true }, { ...ok, phoneEmpty: true, phoneValid: false }),
        ).toEqual([]);
    });

    it('needs a name and an email from a signed-out reader only', () => {
        const anonymous = { ...base, name: ' ', email: 'not-an-email' };
        expect(channelIssues(anonymous, { ...ok, signedIn: false })).toEqual(['name_missing', 'email_invalid']);
        expect(channelIssues(anonymous, ok)).toEqual([]);
    });
});

describe('buildSubmission', () => {
    const state: SignupState = {
        step: 3,
        locations: [{ id: 'old', text: 'Κυψέλη', coordinates: [23.73, 37.99] }],
        topics: [topic('t1'), topic('t2')],
        phoneChannel: true,
        emailChannel: false,
        phone: '+306900000001',
        name: ' Μαρία ',
        email: ' maria@example.com ',
    };

    it('sends the consent flags, the phone while WhatsApp is on, and the account fields when signed out', () => {
        expect(buildSubmission(state, 'athens', false)).toEqual({
            cityId: 'athens',
            locations: [{ text: 'Κυψέλη', coordinates: [23.73, 37.99] }],
            topicIds: ['t1', 't2'],
            notifyByPhone: true,
            notifyByEmail: false,
            phone: '+306900000001',
            name: 'Μαρία',
            email: 'maria@example.com',
        });
    });

    it('sends no consent at all for a locked card, so the save leaves the reader’s request alone', () => {
        const submission = buildSubmission(state, 'athens', true, { phoneChannelLocked: true });
        expect(submission).not.toHaveProperty('notifyByPhone');
        expect(submission).toMatchObject({ notifyByEmail: false, phone: '+306900000001' });
    });

    it('sends no phone for a declined WhatsApp card, and no account fields when signed in', () => {
        const submission = buildSubmission({ ...state, phoneChannel: false, emailChannel: true }, 'athens', true);
        expect(submission).not.toHaveProperty('phone');
        expect(submission).not.toHaveProperty('name');
        expect(submission).not.toHaveProperty('email');
        expect(submission).toMatchObject({ notifyByPhone: false, notifyByEmail: true });
    });
});
