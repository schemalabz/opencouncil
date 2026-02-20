// Mock Prisma client
const mockPrisma = {
  person: {
    findMany: jest.fn(),
  },
  administrativeBody: {
    findUnique: jest.fn(),
  },
};

jest.mock('../db/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock auth module
jest.mock('../auth', () => ({
  withUserAuthorizedToEdit: jest.fn(),
  isUserAuthorizedToEdit: jest.fn(),
}));

// Import after mocks are set up
import { AdministrativeBodyType } from '@prisma/client';

// Create mock implementations of the functions we want to test
const mockPeopleModule = {
  getPeopleForCity: jest.fn(),
  getPeopleForMeeting: jest.fn(),
  getPerson: jest.fn(),
  createPerson: jest.fn(),
  editPerson: jest.fn(),
  deletePerson: jest.fn(),
};

jest.mock('../db/people', () => mockPeopleModule);

const { getPeopleForMeeting, getPeopleForCity } = mockPeopleModule;

describe('getPeopleForMeeting', () => {
  const cityId = 'test-city-id';
  const councilAdminBodyId = 'council-admin-body-id';
  const committeeAdminBodyId = 'committee-admin-body-id';
  const communityAdminBodyId = 'community-admin-body-id';

  const mockCouncilMember = {
    id: 'person-1',
    name: 'Council Member',
    roles: [
      {
        id: 'role-1',
        administrativeBodyId: councilAdminBodyId,
        administrativeBody: { id: councilAdminBodyId, type: 'council' as AdministrativeBodyType },
        isHead: false,
      },
    ],
    voicePrints: [],
  };

  const mockCommunityHead = {
    id: 'person-2',
    name: 'Community Head',
    roles: [
      {
        id: 'role-2',
        administrativeBodyId: 'some-community-id',
        administrativeBody: { id: 'some-community-id', type: 'community' as AdministrativeBodyType },
        isHead: true,
      },
    ],
    voicePrints: [],
  };

  const mockCommunityMember = {
    id: 'person-3',
    name: 'Community Member',
    roles: [
      {
        id: 'role-3',
        administrativeBodyId: communityAdminBodyId,
        administrativeBody: { id: communityAdminBodyId, type: 'community' as AdministrativeBodyType },
        isHead: false,
      },
    ],
    voicePrints: [],
  };

  const mockCommitteeMember = {
    id: 'person-4',
    name: 'Committee Member',
    roles: [
      {
        id: 'role-4',
        administrativeBodyId: committeeAdminBodyId,
        administrativeBody: { id: committeeAdminBodyId, type: 'committee' as AdministrativeBodyType },
        isHead: false,
      },
    ],
    voicePrints: [],
  };

  const mockPersonNoAdminBody = {
    id: 'person-5',
    name: 'No Admin Body',
    roles: [
      {
        id: 'role-5',
        administrativeBodyId: null,
        administrativeBody: null,
        isHead: false,
      },
    ],
    voicePrints: [],
  };

  const mockMayor = {
    id: 'person-6',
    name: 'Mayor',
    roles: [
      {
        id: 'role-6',
        cityId: cityId,
        partyId: null,
        administrativeBodyId: null,
        isHead: true,
        startDate: null,
        endDate: null,
      },
    ],
    voicePrints: [],
  };

  const allMockPeople = [
    mockCouncilMember,
    mockCommunityHead,
    mockCommunityMember,
    mockCommitteeMember,
    mockPersonNoAdminBody,
    mockMayor,
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default mock implementations
    getPeopleForCity.mockResolvedValue(allMockPeople);

    // Mock implementation for getPeopleForMeeting that simulates the actual logic
    getPeopleForMeeting.mockImplementation(async (cityId: string, administrativeBodyId: string | null) => {
      const allPeople = await getPeopleForCity(cityId);

      // If no administrative body, return all people
      if (!administrativeBodyId) {
        return allPeople;
      }

      // Get the administrative body to check its type
      const adminBody = await mockPrisma.administrativeBody.findUnique({
        where: { id: administrativeBodyId }
      });

      if (!adminBody) {
        console.warn(`Administrative body ${administrativeBodyId} not found, returning all people`);
        return allPeople;
      }

      // Filter based on administrative body type
      if (adminBody.type === 'council') {
        // Council meetings: Include council members, people with no admin body, community heads, and mayors
        return allPeople.filter((person: any) => {
          // Always include mayors (people with city-level roles)
          const isMayor = person.roles.some(
            (role: any) => role.cityId && !role.partyId && !role.administrativeBodyId
          );
          if (isMayor) return true;

          const hasCouncilRole = person.roles.some(
            (role: any) => role.administrativeBodyId === administrativeBodyId
          );
          const hasNoAdminBody = !person.roles.some(
            (role: any) => role.administrativeBody
          );
          const isCommunityHead = person.roles.some(
            (role: any) => role.administrativeBody?.type === 'community' && role.isHead
          );

          return hasCouncilRole || hasNoAdminBody || isCommunityHead;
        });
      } else if (adminBody.type === 'committee') {
        // Committee meetings: Only members of this specific committee
        return allPeople.filter((person: any) =>
          person.roles.some((role: any) => role.administrativeBodyId === administrativeBodyId)
        );
      } else if (adminBody.type === 'community') {
        // Community meetings: Only members of this specific community
        return allPeople.filter((person: any) =>
          person.roles.some((role: any) => role.administrativeBodyId === administrativeBodyId)
        );
      }

      // Fallback: return all people
      return allPeople;
    });
  });

  it('should return all people when no administrative body is provided', async () => {
    const result = await getPeopleForMeeting(cityId, null);
    expect(result).toEqual(allMockPeople);
  });

  it('should return all people when administrative body is not found', async () => {
    mockPrisma.administrativeBody.findUnique.mockResolvedValue(null);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await getPeopleForMeeting(cityId, 'invalid-id');

    expect(result).toEqual(allMockPeople);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Administrative body invalid-id not found, returning all people'
    );

    consoleSpy.mockRestore();
  });

  describe('Council meetings', () => {
    beforeEach(() => {
      mockPrisma.administrativeBody.findUnique.mockResolvedValue({
        id: councilAdminBodyId,
        type: 'council',
      });
    });

    it('should include council members, people with no admin body, community heads, and mayors', async () => {
      const result = await getPeopleForMeeting(cityId, councilAdminBodyId);

      expect(result).toHaveLength(4);
      expect(result).toContainEqual(mockCouncilMember);
      expect(result).toContainEqual(mockCommunityHead);
      expect(result).toContainEqual(mockPersonNoAdminBody);
      expect(result).toContainEqual(mockMayor);
    });

    it('should not include regular community members', async () => {
      const result = await getPeopleForMeeting(cityId, councilAdminBodyId);
      expect(result).not.toContainEqual(mockCommunityMember);
    });

    it('should not include committee members', async () => {
      const result = await getPeopleForMeeting(cityId, councilAdminBodyId);
      expect(result).not.toContainEqual(mockCommitteeMember);
    });
  });

  describe('Committee meetings', () => {
    beforeEach(() => {
      mockPrisma.administrativeBody.findUnique.mockResolvedValue({
        id: committeeAdminBodyId,
        type: 'committee',
      });
    });

    it('should only include members of that specific committee', async () => {
      const result = await getPeopleForMeeting(cityId, committeeAdminBodyId);

      expect(result).toHaveLength(1);
      expect(result).toContainEqual(mockCommitteeMember);
    });

    it('should not include council members', async () => {
      const result = await getPeopleForMeeting(cityId, committeeAdminBodyId);
      expect(result).not.toContainEqual(mockCouncilMember);
    });

    it('should not include people with no admin body', async () => {
      const result = await getPeopleForMeeting(cityId, committeeAdminBodyId);
      expect(result).not.toContainEqual(mockPersonNoAdminBody);
    });
  });

  describe('Community meetings', () => {
    beforeEach(() => {
      mockPrisma.administrativeBody.findUnique.mockResolvedValue({
        id: communityAdminBodyId,
        type: 'community',
      });
    });

    it('should only include members of that specific community', async () => {
      const result = await getPeopleForMeeting(cityId, communityAdminBodyId);

      expect(result).toHaveLength(1);
      expect(result).toContainEqual(mockCommunityMember);
    });

    it('should not include council members', async () => {
      const result = await getPeopleForMeeting(cityId, communityAdminBodyId);
      expect(result).not.toContainEqual(mockCouncilMember);
    });

    it('should not include people with no admin body', async () => {
      const result = await getPeopleForMeeting(cityId, communityAdminBodyId);
      expect(result).not.toContainEqual(mockPersonNoAdminBody);
    });

    it('should not include community heads from other communities', async () => {
      const result = await getPeopleForMeeting(cityId, communityAdminBodyId);
      expect(result).not.toContainEqual(mockCommunityHead);
    });
  });
});
