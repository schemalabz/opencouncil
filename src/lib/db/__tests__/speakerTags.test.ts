/** @jest-environment node */

const mockIdentificationFindMany = jest.fn();
const mockWithUserAuthorizedToEdit = jest.fn();

jest.mock('server-only', () => ({}));
jest.mock('../prisma', () => ({
  __esModule: true,
  default: {
    speakerIdentification: { findMany: (...args: unknown[]) => mockIdentificationFindMany(...args) },
  },
}));
jest.mock('../../auth', () => ({
  withUserAuthorizedToEdit: (...args: unknown[]) => mockWithUserAuthorizedToEdit(...args),
}));

import { getSpeakerIdentificationsForMeeting } from '../speakerTags';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getSpeakerIdentificationsForMeeting', () => {
  it('reads nothing for a user who may not edit the city', async () => {
    mockWithUserAuthorizedToEdit.mockRejectedValue(new Error('Not authorized'));

    await expect(getSpeakerIdentificationsForMeeting('city-1', 'meeting-1')).rejects.toThrow('Not authorized');

    expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'city-1' });
    expect(mockIdentificationFindMany).not.toHaveBeenCalled();
  });

  it('returns the identifications of that city\'s meeting to an editor', async () => {
    const rows = [{ speakerTagId: 't1', method: 'transcript', personId: 'anna', actionable: true, confidence: 90, evidence: 'e' }];
    mockWithUserAuthorizedToEdit.mockResolvedValue(undefined);
    mockIdentificationFindMany.mockResolvedValue(rows);

    await expect(getSpeakerIdentificationsForMeeting('city-1', 'meeting-1')).resolves.toEqual(rows);

    // The city the rights were checked for is the city the rows are read from.
    expect(mockIdentificationFindMany.mock.calls[0][0].where).toEqual({
      speakerTag: { speakerSegments: { some: { cityId: 'city-1', meetingId: 'meeting-1' } } },
    });
  });
});
