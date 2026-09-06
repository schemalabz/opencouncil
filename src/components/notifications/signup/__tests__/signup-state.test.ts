import type { Topic } from '@prisma/client';
import { buildSubmission, channelIssues, initialSignupState, notisActionFor, type SignupState } from '../signup-state';

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
        const state = initialSignupState({ initialStep: 1, existing: null, account, notisStatus: null });
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
        expect(initialSignupState({ initialStep: 2, existing: null, account: null, notisStatus: null })).toMatchObject({
            step: 2,
            phone: '',
            name: '',
            email: '',
        });
    });

    it('brings back a saved preference, channels included', () => {
        const state = initialSignupState({ initialStep: 2, existing, account, notisStatus: 'active' });
        expect(state.locations).toEqual(existing.locations);
        expect(state.topics).toEqual(existing.topics);
        expect(state.phoneChannel).toBe(true);
        expect(state.emailChannel).toBe(true);
    });

    it("starts the WhatsApp card from the person's one consent, whatever the municipality", () => {
        const declined = { ...account, notifyByPhone: false };
        expect(initialSignupState({ initialStep: 2, existing, account: declined, notisStatus: null }).phoneChannel).toBe(false);
        expect(initialSignupState({ initialStep: 2, existing: null, account: declined, notisStatus: null }).phoneChannel).toBe(false);
    });

    it('does not resubscribe a reader who said ΣΤΟΠ: the WhatsApp card starts unticked, in any municipality', () => {
        const state = initialSignupState({ initialStep: 2, existing, account, notisStatus: 'unsubscribed' });
        expect(state.phoneChannel).toBe(false);
        expect(state.emailChannel).toBe(true);
        expect(initialSignupState({ initialStep: 2, existing: null, account, notisStatus: 'unsubscribed' }).phoneChannel).toBe(false);
    });

    it('asks for an explicit tick when Notis did not answer, because the reader may have said ΣΤΟΠ', () => {
        expect(initialSignupState({ initialStep: 2, existing, account, notisStatus: 'unknown' }).phoneChannel).toBe(false);
        expect(initialSignupState({ initialStep: 2, existing: null, account, notisStatus: 'unknown' }).phoneChannel).toBe(false);
    });
});

describe('notisActionFor', () => {
    const ticked = { phoneChannel: true } as SignupState;
    const unticked = { phoneChannel: false } as SignupState;

    it('re-activates only on an explicit tick from a reader Notis does not serve, or may not', () => {
        expect(notisActionFor(ticked, true, 'unsubscribed')).toBe('activate');
        expect(notisActionFor(ticked, true, 'unknown')).toBe('activate');
        expect(notisActionFor(ticked, true, 'active')).toBeNull();
        expect(notisActionFor(ticked, true, null)).toBeNull();
    });

    it('releases a served reader who unticked — the card is the profile switch — and never touches Notis for a signed-out reader', () => {
        expect(notisActionFor(unticked, true, 'active')).toBe('release');
        expect(notisActionFor(unticked, true, 'unsubscribed')).toBeNull();
        expect(notisActionFor(ticked, false, 'unsubscribed')).toBeNull();
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

    it('sends no phone for a declined WhatsApp card, and no account fields when signed in', () => {
        const submission = buildSubmission({ ...state, phoneChannel: false, emailChannel: true }, 'athens', true);
        expect(submission).not.toHaveProperty('phone');
        expect(submission).not.toHaveProperty('name');
        expect(submission).not.toHaveProperty('email');
        expect(submission).toMatchObject({ notifyByPhone: false, notifyByEmail: true });
    });
});
