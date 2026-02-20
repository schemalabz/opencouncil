import { z } from 'zod';
import {
  cityFormSchema,
  baseCityFormSchema,
  createCityFormDataSchema,
  updateCityFormDataSchema,
  CITY_DEFAULTS,
} from '../city';

// Shared base data used across tests.
// All required fields are always provided — schemas do validation only,
// defaults live in CITY_DEFAULTS and are applied at the call site.
const validFrontendBase = {
  name: 'Αθήνα',
  name_en: 'Athens',
  name_municipality: 'Δήμος Αθηναίων',
  name_municipality_en: 'Municipality of Athens',
  timezone: 'Europe/Athens',
  authorityType: 'municipality' as const,
  officialSupport: false,
  status: 'pending' as const,
  supportsNotifications: false,
  consultationsEnabled: false,
  peopleOrdering: 'default' as const,
  highlightCreationPermission: 'ADMINS_ONLY' as const,
};

const validFormDataBase = {
  name: 'Athens',
  name_en: 'Athens',
  name_municipality: 'Municipality of Athens',
  name_municipality_en: 'Municipality of Athens',
  timezone: 'Europe/Athens',
  authorityType: 'municipality',
  officialSupport: 'false',
  status: 'pending',
  supportsNotifications: 'true',
  consultationsEnabled: 'false',
  peopleOrdering: 'default',
  highlightCreationPermission: 'ADMINS_ONLY',
};

const createMockFile = (name = 'logo.png'): File => {
  return new File(['content'], name, { type: 'image/png' });
};

describe('cityFormSchema (Frontend)', () => {
  const validCityData = { id: 'athens', ...validFrontendBase };

  it('should validate correct city form data', () => {
    expect(() => cityFormSchema.parse(validCityData)).not.toThrow();
    const parsed = cityFormSchema.parse(validCityData);
    expect(parsed.id).toBe('athens');
    expect(parsed.name).toBe('Αθήνα');
  });

  it('should reject invalid city ID format (uppercase)', () => {
    expect(() => cityFormSchema.parse({
      ...validCityData,
      id: 'INVALID_ID_WITH_UPPERCASE',
    })).toThrow();
  });

  it('should reject invalid city ID format (spaces)', () => {
    expect(() => cityFormSchema.parse({
      ...validCityData,
      id: 'invalid id with spaces',
    })).toThrow();
  });

  it('should reject city ID shorter than 2 characters', () => {
    expect(() => cityFormSchema.parse({
      ...validCityData,
      id: 'a',
    })).toThrow();
  });

  it('should reject name shorter than 2 characters', () => {
    expect(() => cityFormSchema.parse({
      ...validCityData,
      name: 'A',
    })).toThrow();
  });

  it('should reject name_en shorter than 2 characters', () => {
    expect(() => cityFormSchema.parse({
      ...validCityData,
      name_en: 'A',
    })).toThrow();
  });

  it('should allow optional logoImage File', () => {
    const parsed = cityFormSchema.parse({
      ...validCityData,
      logoImage: new File(['content'], 'logo.png', { type: 'image/png' }),
    });
    expect(parsed.logoImage).toBeInstanceOf(File);
  });

  it('should allow logoImage to be undefined', () => {
    const parsed = cityFormSchema.parse(validCityData);
    expect(parsed.logoImage).toBeUndefined();
  });
});

describe('createCityFormDataSchema (Backend POST)', () => {
  const validCreateData = {
    id: 'athens',
    ...validFormDataBase,
    logoImage: createMockFile(),
  };

  it('should transform string booleans to actual booleans', () => {
    const parsed = createCityFormDataSchema.parse(validCreateData);
    expect(parsed.supportsNotifications).toBe(true);
    expect(parsed.consultationsEnabled).toBe(false);
    expect(parsed.officialSupport).toBe(false);
  });

  it('should require all fields (no schema defaults)', () => {
    // Schemas do validation only — missing required fields must fail.
    // Defaults are applied at the call site via CITY_DEFAULTS.
    const incomplete = {
      id: 'athens',
      name: 'Athens',
      name_en: 'Athens',
      name_municipality: 'Municipality',
      name_municipality_en: 'Municipality',
      timezone: 'Europe/Athens',
      logoImage: createMockFile(),
      // missing: authorityType, officialSupport, status, supportsNotifications, etc.
    };
    expect(() => createCityFormDataSchema.parse(incomplete)).toThrow();
  });

  it('should require logoImage File', () => {
    const { logoImage, ...noLogo } = validCreateData;
    expect(() => createCityFormDataSchema.parse(noLogo)).toThrow();
  });

  it('should validate logoImage is a File instance', () => {
    expect(() => createCityFormDataSchema.parse({
      ...validCreateData,
      logoImage: 'not-a-file',
    })).toThrow();
  });

  it('should validate logoImage is a File instance (null)', () => {
    expect(() => createCityFormDataSchema.parse({
      ...validCreateData,
      logoImage: null,
    })).toThrow();
  });

  it('should validate required fields', () => {
    const { name, ...missingName } = validCreateData;
    expect(() => createCityFormDataSchema.parse(missingName)).toThrow();
  });
});

describe('updateCityFormDataSchema (Backend PUT)', () => {
  it('should allow all fields to be optional', () => {
    expect(() => updateCityFormDataSchema.parse({})).not.toThrow();
  });

  it('should validate provided fields', () => {
    expect(() => updateCityFormDataSchema.parse({ name: 'A' })).toThrow();
  });

  it('should accept valid partial data', () => {
    const parsed = updateCityFormDataSchema.parse({
      name: 'Athens',
      supportsNotifications: 'true',
    });
    expect(parsed.name).toBe('Athens');
    expect(parsed.supportsNotifications).toBe(true);
  });

  it('should leave unprovided fields as undefined (not filled with defaults)', () => {
    // This is the key invariant: partial updates must not silently
    // overwrite DB values with defaults for fields that weren't sent.
    const parsed = updateCityFormDataSchema.parse({ name: 'Athens' });
    expect(parsed.authorityType).toBeUndefined();
    expect(parsed.supportsNotifications).toBeUndefined();
    expect(parsed.consultationsEnabled).toBeUndefined();
    expect(parsed.highlightCreationPermission).toBeUndefined();
    expect(parsed.peopleOrdering).toBeUndefined();
    expect(parsed.officialSupport).toBeUndefined();
    expect(parsed.status).toBeUndefined();
  });

  it('should handle nullable logoImage', () => {
    const parsed = updateCityFormDataSchema.parse({ logoImage: null });
    expect(parsed.logoImage).toBeNull();
  });

  it('should handle optional logoImage File', () => {
    const parsed = updateCityFormDataSchema.parse({ logoImage: createMockFile() });
    expect(parsed.logoImage).toBeInstanceOf(File);
  });

  it('should transform string booleans to actual booleans', () => {
    const parsed = updateCityFormDataSchema.parse({
      supportsNotifications: 'true',
      consultationsEnabled: 'false',
    });
    expect(parsed.supportsNotifications).toBe(true);
    expect(parsed.consultationsEnabled).toBe(false);
  });

  it('should handle optional officialSupport for superadmin', () => {
    const parsed = updateCityFormDataSchema.parse({ officialSupport: 'true' });
    expect(parsed.officialSupport).toBe(true);
  });

  it('should handle optional status for superadmin', () => {
    const parsed = updateCityFormDataSchema.parse({ status: 'listed' });
    expect(parsed.status).toBe('listed');
  });

  it('should handle peopleOrdering as optional (not nullable)', () => {
    expect(updateCityFormDataSchema.parse({ peopleOrdering: 'default' }).peopleOrdering).toBe('default');
    expect(updateCityFormDataSchema.parse({ peopleOrdering: 'partyRank' }).peopleOrdering).toBe('partyRank');
    expect(updateCityFormDataSchema.parse({}).peopleOrdering).toBeUndefined();
  });
});

describe('Enum validation', () => {
  describe('authorityType', () => {
    it('should accept valid authorityType values', () => {
      ['municipality', 'region'].forEach(authorityType => {
        expect(() => baseCityFormSchema.parse({
          ...validFrontendBase,
          authorityType,
        })).not.toThrow();
      });
    });

    it('should reject invalid authorityType', () => {
      expect(() => baseCityFormSchema.parse({
        ...validFrontendBase,
        authorityType: 'invalid',
      })).toThrow();
    });
  });

  describe('status', () => {
    it('should accept valid status values', () => {
      ['pending', 'unlisted', 'listed'].forEach(status => {
        expect(() => baseCityFormSchema.parse({
          ...validFrontendBase,
          status,
        })).not.toThrow();
      });
    });

    it('should reject invalid status', () => {
      expect(() => baseCityFormSchema.parse({
        ...validFrontendBase,
        status: 'invalid',
      })).toThrow();
    });
  });

  describe('peopleOrdering', () => {
    it('should accept valid peopleOrdering values', () => {
      ['default', 'partyRank'].forEach(ordering => {
        expect(() => baseCityFormSchema.parse({
          ...validFrontendBase,
          peopleOrdering: ordering,
        })).not.toThrow();
      });
    });

    it('should reject invalid peopleOrdering', () => {
      expect(() => baseCityFormSchema.parse({
        ...validFrontendBase,
        peopleOrdering: 'invalid',
      })).toThrow();
    });
  });

  describe('highlightCreationPermission', () => {
    it('should accept valid highlightCreationPermission values', () => {
      ['ADMINS_ONLY', 'EVERYONE'].forEach(permission => {
        expect(() => baseCityFormSchema.parse({
          ...validFrontendBase,
          highlightCreationPermission: permission,
        })).not.toThrow();
      });
    });

    it('should reject invalid highlightCreationPermission', () => {
      expect(() => baseCityFormSchema.parse({
        ...validFrontendBase,
        highlightCreationPermission: 'invalid',
      })).toThrow();
    });
  });
});

describe('baseCityFormSchema', () => {
  it('should validate all required fields', () => {
    expect(() => baseCityFormSchema.parse(validFrontendBase)).not.toThrow();
  });

  it('should reject missing required fields', () => {
    expect(() => baseCityFormSchema.parse({ name: 'Athens' })).toThrow();
  });
});

describe('Integration: FormData with Schemas', () => {
  it('should handle complete FormData flow for city creation', () => {
    const parsed = createCityFormDataSchema.parse({
      id: 'athens',
      ...validFormDataBase,
      logoImage: createMockFile(),
    });

    expect(parsed.id).toBe('athens');
    expect(parsed.supportsNotifications).toBe(true);
    expect(parsed.consultationsEnabled).toBe(false);
    expect(parsed.logoImage).toBeInstanceOf(File);
  });

  it('should handle partial FormData flow for city update', () => {
    const parsed = updateCityFormDataSchema.parse({
      name: 'Updated Athens',
      supportsNotifications: 'false',
    });

    expect(parsed.name).toBe('Updated Athens');
    expect(parsed.supportsNotifications).toBe(false);
    expect(parsed.timezone).toBeUndefined();
    expect(parsed.logoImage).toBeUndefined();
  });
});

describe('Edge cases: Boolean string transforms', () => {
  it('should treat empty string as false for boolean fields', () => {
    const parsed = createCityFormDataSchema.parse({
      id: 'athens',
      ...validFormDataBase,
      supportsNotifications: '',
      consultationsEnabled: '',
      officialSupport: '',
      logoImage: createMockFile(),
    });
    expect(parsed.supportsNotifications).toBe(false);
    expect(parsed.consultationsEnabled).toBe(false);
    expect(parsed.officialSupport).toBe(false);
  });

  it('should treat any non-"true" string as false', () => {
    const parsed = createCityFormDataSchema.parse({
      id: 'athens',
      ...validFormDataBase,
      supportsNotifications: '1',
      consultationsEnabled: 'yes',
      officialSupport: 'no',
      logoImage: createMockFile(),
    });
    expect(parsed.supportsNotifications).toBe(false);
    expect(parsed.consultationsEnabled).toBe(false);
    expect(parsed.officialSupport).toBe(false);
  });
});

describe('Validation errors', () => {
  it('should reject invalid city ID format', () => {
    expect(() => cityFormSchema.parse({
      ...validFrontendBase,
      id: 'INVALID',
    })).toThrow(z.ZodError);
  });

  it('should reject missing required logoImage in create schema', () => {
    expect(() => createCityFormDataSchema.parse({
      id: 'athens',
      ...validFormDataBase,
      // missing logoImage
    })).toThrow(z.ZodError);
  });
});

describe('File edge cases', () => {
  it('should handle empty File (0 bytes)', () => {
    const parsed = createCityFormDataSchema.parse({
      id: 'athens',
      ...validFormDataBase,
      logoImage: new File([], 'empty.png', { type: 'image/png' }),
    });
    expect(parsed.logoImage).toBeInstanceOf(File);
    expect(parsed.logoImage.size).toBe(0);
  });

  it('should handle File without explicit type', () => {
    const parsed = createCityFormDataSchema.parse({
      id: 'athens',
      ...validFormDataBase,
      logoImage: new File(['content'], 'logo.png'),
    });
    expect(parsed.logoImage).toBeInstanceOf(File);
    expect(parsed.logoImage.name).toBe('logo.png');
  });
});

describe('CITY_DEFAULTS alignment', () => {
  it('should match expected Prisma defaults', () => {
    // Guard: if someone adds a new default, this test reminds them
    // to apply it in forms, routes, and seed — not in the schema.
    expect(CITY_DEFAULTS).toEqual({
      officialSupport: false,
      status: 'pending',
      authorityType: 'municipality',
      supportsNotifications: false,
      consultationsEnabled: false,
      peopleOrdering: 'default',
      highlightCreationPermission: 'ADMINS_ONLY',
    });
  });
});
