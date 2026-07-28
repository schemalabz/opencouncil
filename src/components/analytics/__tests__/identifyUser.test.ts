/**
 * @jest-environment jsdom
 *
 * identifyPostHogUser reads localStorage, so it needs jsdom despite the
 * .test.ts → node split in jest.config.js.
 */
import posthog from 'posthog-js';
import type { Session } from 'next-auth';
import { identifyPostHogUser } from '../identifyUser';
import { INTERNAL_PERSON_KEY, INTERNAL_USER_KEY } from '@/lib/utils/analyticsConsent';

jest.mock('posthog-js', () => ({
  __esModule: true,
  default: {
    __loaded: true,
    get_explicit_consent_status: jest.fn(),
    get_distinct_id: jest.fn(),
    identify: jest.fn(),
    register: jest.fn(),
    setPersonProperties: jest.fn(),
  },
}));

const mocked = posthog as jest.Mocked<typeof posthog>;

function session(user: Partial<Session['user']>): Session {
  return { user, expires: '' } as Session;
}

const visitor = session({ id: 'user-1', email: 'someone@example.com' });
const teamMember = session({ id: 'team-1', email: 'someone@opencouncil.gr' });

describe('identifyPostHogUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mocked.__loaded = true;
    mocked.get_explicit_consent_status.mockReturnValue('granted');
    mocked.get_distinct_id.mockReturnValue('0197-anon-device-uuid');
  });

  it('identifies a consenting signed-in user on their user id', () => {
    identifyPostHogUser(visitor);

    expect(mocked.identify).toHaveBeenCalledWith('user-1');
  });

  it('does nothing when posthog is not initialized', () => {
    mocked.__loaded = false;

    identifyPostHogUser(teamMember);

    expect(mocked.register).not.toHaveBeenCalled();
    expect(mocked.identify).not.toHaveBeenCalled();
    expect(mocked.setPersonProperties).not.toHaveBeenCalled();
    expect(localStorage.getItem(INTERNAL_USER_KEY)).toBeNull();
  });

  it.each(['pending', 'denied'] as const)('does not identify while consent is %s', (status) => {
    mocked.get_explicit_consent_status.mockReturnValue(status);

    identifyPostHogUser(visitor);

    expect(mocked.identify).not.toHaveBeenCalled();
    expect(mocked.setPersonProperties).not.toHaveBeenCalled();
  });

  it('still marks the team device while consent is pending', () => {
    // The device stamp must not sit behind the consent gate: it exists
    // precisely so logged-out and cookieless visits from a team device are
    // filtered too.
    mocked.get_explicit_consent_status.mockReturnValue('pending');

    identifyPostHogUser(teamMember);

    expect(mocked.register).toHaveBeenCalledWith({ internal_user: true });
    expect(localStorage.getItem(INTERNAL_USER_KEY)).toBe('1');
    expect(mocked.identify).not.toHaveBeenCalled();
    expect(mocked.setPersonProperties).not.toHaveBeenCalled();
  });

  it('does not identify while the tab still runs cookieless', () => {
    // The cookieless sentinel is shared by every visitor: identifying
    // against it would merge all such users into one PostHog person.
    mocked.get_distinct_id.mockReturnValue('$posthog_cookieless');

    identifyPostHogUser(visitor);

    expect(mocked.identify).not.toHaveBeenCalled();
    expect(mocked.setPersonProperties).not.toHaveBeenCalled();
  });

  it('marks a team device even while cookieless', () => {
    mocked.get_distinct_id.mockReturnValue('$posthog_cookieless');

    identifyPostHogUser(teamMember);

    expect(localStorage.getItem(INTERNAL_USER_KEY)).toBe('1');
    expect(mocked.register).toHaveBeenCalledWith({ internal_user: true });
    expect(mocked.identify).not.toHaveBeenCalled();
    // Writing the person property onto the shared sentinel person would flag
    // every anonymous visitor as internal — the same class of bug as the
    // sentinel identify.
    expect(mocked.setPersonProperties).not.toHaveBeenCalled();
  });

  it('treats superadmins on external emails as team members', () => {
    const superAdmin = session({ id: 'admin-1', email: 'someone@example.com', isSuperAdmin: true });

    identifyPostHogUser(superAdmin);

    expect(mocked.register).toHaveBeenCalledWith({ internal_user: true });
    expect(mocked.setPersonProperties).toHaveBeenCalledWith({ $internal_or_test_user: true });
  });

  it('sends the internal person property once per account for team members', () => {
    identifyPostHogUser(teamMember);
    identifyPostHogUser(teamMember);

    expect(mocked.setPersonProperties).toHaveBeenCalledTimes(1);
    expect(mocked.setPersonProperties).toHaveBeenCalledWith({ $internal_or_test_user: true });
    expect(localStorage.getItem(INTERNAL_PERSON_KEY)).toBe('team-1');
  });

  it('re-sends the person property when a different team member uses the same device', () => {
    const secondTeamMember = session({ id: 'team-2', email: 'other@opencouncil.gr' });

    identifyPostHogUser(teamMember);
    identifyPostHogUser(secondTeamMember);

    expect(mocked.setPersonProperties).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(INTERNAL_PERSON_KEY)).toBe('team-2');
  });

  it('does not mark regular users as internal in any way', () => {
    identifyPostHogUser(visitor);

    expect(mocked.setPersonProperties).not.toHaveBeenCalled();
    expect(mocked.register).not.toHaveBeenCalled();
    expect(localStorage.getItem(INTERNAL_USER_KEY)).toBeNull();
    expect(localStorage.getItem(INTERNAL_PERSON_KEY)).toBeNull();
  });
});
