/**
 * @jest-environment jsdom
 *
 * applyStoredAnalyticsConsent reads localStorage, so it needs jsdom despite
 * the .test.ts → node split in jest.config.js.
 */
import posthog from 'posthog-js';
import { applyStoredAnalyticsConsent, ANALYTICS_CHOICE_KEY } from '../utils/analyticsConsent';

jest.mock('posthog-js', () => ({
  __esModule: true,
  default: {
    __loaded: true,
    get_explicit_consent_status: jest.fn(),
    opt_in_capturing: jest.fn(),
    opt_out_capturing: jest.fn(),
  },
}));

const mocked = posthog as jest.Mocked<typeof posthog>;

describe('applyStoredAnalyticsConsent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mocked.__loaded = true;
    mocked.get_explicit_consent_status.mockReturnValue('pending');
  });

  it('does nothing when posthog is not initialized', () => {
    mocked.__loaded = false;
    localStorage.setItem(ANALYTICS_CHOICE_KEY, 'accepted');

    applyStoredAnalyticsConsent();

    expect(mocked.opt_in_capturing).not.toHaveBeenCalled();
    expect(mocked.opt_out_capturing).not.toHaveBeenCalled();
  });

  it.each(['granted', 'denied'] as const)(
    'leaves an explicit %s consent state untouched',
    (status) => {
      mocked.get_explicit_consent_status.mockReturnValue(status);
      localStorage.setItem(ANALYTICS_CHOICE_KEY, 'accepted');

      applyStoredAnalyticsConsent();

      expect(mocked.opt_in_capturing).not.toHaveBeenCalled();
      expect(mocked.opt_out_capturing).not.toHaveBeenCalled();
    },
  );

  it('restores opt-in without a synthetic $opt_in event when the stored choice is accepted', () => {
    localStorage.setItem(ANALYTICS_CHOICE_KEY, 'accepted');

    applyStoredAnalyticsConsent();

    expect(mocked.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: null });
    expect(mocked.opt_out_capturing).not.toHaveBeenCalled();
  });

  it('falls back to the cookieless declined default when the stored choice is declined', () => {
    localStorage.setItem(ANALYTICS_CHOICE_KEY, 'declined');

    applyStoredAnalyticsConsent();

    expect(mocked.opt_out_capturing).toHaveBeenCalled();
    expect(mocked.opt_in_capturing).not.toHaveBeenCalled();
  });

  it('falls back to the cookieless declined default when no choice is stored', () => {
    applyStoredAnalyticsConsent();

    expect(mocked.opt_out_capturing).toHaveBeenCalled();
    expect(mocked.opt_in_capturing).not.toHaveBeenCalled();
  });
});
