import posthog from 'posthog-js';
import { getPlaceSuggestions, getPlaceDetails } from '@/lib/google-maps';
import { getPlaceSuggestions as fetchPlaceSuggestions, getPlaceDetails as fetchPlaceDetails } from '@/lib/actions';

jest.mock('posthog-js', () => ({
    __esModule: true,
    default: {
        __loaded: true,
        captureException: jest.fn(),
    },
}));

jest.mock('@/lib/actions', () => ({
    getPlaceSuggestions: jest.fn(),
    getPlaceDetails: jest.fn(),
}));

const mockedPosthog = posthog as jest.Mocked<typeof posthog>;
const suggestionsAction = fetchPlaceSuggestions as jest.MockedFunction<typeof fetchPlaceSuggestions>;
const detailsAction = fetchPlaceDetails as jest.MockedFunction<typeof fetchPlaceDetails>;

describe('google-maps failure reporting', () => {
    beforeEach(() => {
        // resetAllMocks, not clearAllMocks: the action stubs and any
        // captureException implementation set by one test must not reach the
        // next one. restoreAllMocks below only covers the console spy.
        jest.resetAllMocks();
        mockedPosthog.__loaded = true;
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('reports an expired API key with the Google status attached', async () => {
        // What the action returns for an expired key: Google answers 200 with
        // REQUEST_DENIED, so the status reaches the caller.
        suggestionsAction.mockResolvedValue({
            success: true,
            data: {
                status: 'REQUEST_DENIED',
                error_message: 'The provided API key is expired.',
            },
        });

        const result = await getPlaceSuggestions('Πατησίων 100');

        // The status drives the user-facing message in LocationSelector.
        expect(result.error).toMatchObject({ type: 'API_ERROR', status: 'REQUEST_DENIED' });
        expect(mockedPosthog.captureException).toHaveBeenCalledTimes(1);
        const [error, props] = mockedPosthog.captureException.mock.calls[0];
        expect((error as Error).message).toContain('The provided API key is expired.');
        expect(props).toMatchObject({
            places_operation: 'suggestions',
            places_status: 'REQUEST_DENIED',
        });
    });

    it('reports a non-OK Google status with the status attached', async () => {
        suggestionsAction.mockResolvedValue({
            success: true,
            data: { status: 'OVER_QUERY_LIMIT' },
        });

        const result = await getPlaceSuggestions('Πατησίων 100');

        expect(result.error).toMatchObject({ type: 'API_ERROR', status: 'OVER_QUERY_LIMIT' });
        expect(mockedPosthog.captureException).toHaveBeenCalledTimes(1);
        expect(mockedPosthog.captureException.mock.calls[0][1]).toMatchObject({
            places_operation: 'suggestions',
            places_status: 'OVER_QUERY_LIMIT',
        });
    });

    it('reports a failed suggestions action without a Google status', async () => {
        // A failed Result means the action itself failed (no API key, network
        // throw), so there is no Google status to attach.
        suggestionsAction.mockResolvedValue({ success: false, error: 'API configuration error' });

        const result = await getPlaceSuggestions('Πατησίων 100');

        expect(result.error).toMatchObject({ type: 'API_ERROR', status: 'UNKNOWN' });
        expect(mockedPosthog.captureException).toHaveBeenCalledTimes(1);
        const [error, props] = mockedPosthog.captureException.mock.calls[0];
        expect((error as Error).message).toContain('API configuration error');
        expect(props).toMatchObject({ places_operation: 'suggestions' });
        expect(props).not.toHaveProperty('places_status');
    });

    it('does not report ZERO_RESULTS', async () => {
        suggestionsAction.mockResolvedValue({
            success: true,
            data: { status: 'ZERO_RESULTS' },
        });

        const result = await getPlaceSuggestions('Πατησίων 100');

        expect(result).toEqual({ data: [] });
        expect(mockedPosthog.captureException).not.toHaveBeenCalled();
    });

    it('does not report a successful lookup', async () => {
        suggestionsAction.mockResolvedValue({
            success: true,
            data: {
                status: 'OK',
                predictions: [{ place_id: 'abc', description: 'Πατησίων 100, Αθήνα' }],
            },
        });

        const result = await getPlaceSuggestions('Πατησίων 100');

        expect(result.data).toHaveLength(1);
        expect(mockedPosthog.captureException).not.toHaveBeenCalled();
    });

    it('reports a failed details action to PostHog', async () => {
        detailsAction.mockResolvedValue({ success: false, error: 'API configuration error' });

        const result = await getPlaceDetails('abc');

        expect(result).toBeNull();
        expect(mockedPosthog.captureException).toHaveBeenCalledTimes(1);
        expect(mockedPosthog.captureException.mock.calls[0][1]).toMatchObject({
            places_operation: 'details',
        });
    });

    it('reports a non-OK details status with the status attached', async () => {
        detailsAction.mockResolvedValue({ success: true, data: { status: 'NOT_FOUND' } });

        const result = await getPlaceDetails('abc');

        expect(result).toBeNull();
        expect(mockedPosthog.captureException).toHaveBeenCalledTimes(1);
        expect(mockedPosthog.captureException.mock.calls[0][1]).toMatchObject({
            places_operation: 'details',
            places_status: 'NOT_FOUND',
        });
    });

    // The message assertions below separate each guard from the catch block,
    // which reports the same props and also returns null.
    it('reports an OK details response with no result', async () => {
        detailsAction.mockResolvedValue({ success: true, data: { status: 'OK' } });

        const result = await getPlaceDetails('abc');

        expect(result).toBeNull();
        expect(mockedPosthog.captureException).toHaveBeenCalledTimes(1);
        const [error, props] = mockedPosthog.captureException.mock.calls[0];
        expect((error as Error).message).toContain('Result missing in place details');
        expect(props).toMatchObject({ places_operation: 'details' });
    });

    it('reports place details with no geometry', async () => {
        detailsAction.mockResolvedValue({
            success: true,
            data: { status: 'OK', result: { formatted_address: 'Πατησίων 100, Αθήνα' } },
        });

        const result = await getPlaceDetails('abc');

        expect(result).toBeNull();
        const [error] = mockedPosthog.captureException.mock.calls[0];
        expect((error as Error).message).toContain('Location geometry missing in place details');
    });

    it('reports place details with no formatted address', async () => {
        detailsAction.mockResolvedValue({
            success: true,
            data: { status: 'OK', result: { geometry: { location: { lat: 37.99, lng: 23.73 } } } },
        });

        const result = await getPlaceDetails('abc');

        expect(result).toBeNull();
        const [error] = mockedPosthog.captureException.mock.calls[0];
        expect((error as Error).message).toContain('Formatted address missing in place details');
    });

    it('returns the address and [lng, lat] coordinates for a complete result', async () => {
        detailsAction.mockResolvedValue({
            success: true,
            data: {
                status: 'OK',
                result: {
                    formatted_address: 'Πατησίων 100, Αθήνα',
                    geometry: { location: { lat: 37.99, lng: 23.73 } },
                },
            },
        });

        const result = await getPlaceDetails('abc');

        expect(result).toEqual({ text: 'Πατησίων 100, Αθήνα', coordinates: [23.73, 37.99] });
        expect(mockedPosthog.captureException).not.toHaveBeenCalled();
    });

    it('reports an OK response that carries no prediction list', async () => {
        suggestionsAction.mockResolvedValue({ success: true, data: { status: 'OK' } });

        const result = await getPlaceSuggestions('Πατησίων 100');

        expect(result).toEqual({ data: [] });
        const [error] = mockedPosthog.captureException.mock.calls[0];
        expect((error as Error).message).toContain('Predictions missing in place suggestions');
    });

    it('reports the same failure once per page load', async () => {
        suggestionsAction.mockResolvedValue({ success: true, data: { status: 'UNKNOWN_ERROR' } });

        await getPlaceSuggestions('Πατησίων 100');
        await getPlaceSuggestions('Πατησίων 100');
        await getPlaceSuggestions('Σταδίου 5');

        // The autocomplete calls the action on every debounced keystroke, so an
        // outage would otherwise send one exception per keypress.
        expect(mockedPosthog.captureException).toHaveBeenCalledTimes(1);
    });

    it('keeps the API error when PostHog itself throws', async () => {
        mockedPosthog.captureException.mockImplementation(() => {
            throw new Error('posthog is broken');
        });
        suggestionsAction.mockResolvedValue({ success: true, data: { status: 'INVALID_REQUEST' } });

        const result = await getPlaceSuggestions('Πατησίων 100');

        // Reporting happens inside the caller's try block. A throw there would
        // be caught as a network error and mislabel the failure.
        expect(result.error).toMatchObject({ type: 'API_ERROR', status: 'INVALID_REQUEST' });
    });

    it('stays silent when PostHog is not initialised', async () => {
        mockedPosthog.__loaded = false;
        // A cause no earlier test used: the dedupe set lives for the module's
        // lifetime, so a repeated cause would mask the guard under test.
        suggestionsAction.mockResolvedValue({ success: false, error: 'Action failed while posthog is off' });

        await getPlaceSuggestions('Πατησίων 100');

        expect(mockedPosthog.captureException).not.toHaveBeenCalled();
    });
});
