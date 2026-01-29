import { z } from 'zod';
import {
  cityFormSchema,
  baseCityFormSchema,
  createCityFormDataSchema,
  updateCityFormDataSchema,
  CITY_DEFAULTS,
} from '../city';

describe('cityFormSchema (Frontend)', () => {
  const validCityData = {
    id: 'athens',
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
    highlightCreationPermission: 'ADMINS_ONLY' as const,
  };

  it('should validate correct city form data', () => {
    expect(() => cityFormSchema.parse(validCityData)).not.toThrow();
    const parsed = cityFormSchema.parse(validCityData);
    expect(parsed.id).toBe('athens');
    expect(parsed.name).toBe('Αθήνα');
  });

  it('should reject invalid city ID format (uppercase)', () => {
    const invalidData = {
      ...validCityData,
      id: 'INVALID_ID_WITH_UPPERCASE',
    };
    expect(() => cityFormSchema.parse(invalidData)).toThrow();
  });

  it('should reject invalid city ID format (spaces)', () => {
    const invalidData = {
      ...validCityData,
      id: 'invalid id with spaces',
    };
    expect(() => cityFormSchema.parse(invalidData)).toThrow();
  });

  it('should reject city ID shorter than 2 characters', () => {
    const invalidData = {
      ...validCityData,
      id: 'a',
    };
    expect(() => cityFormSchema.parse(invalidData)).toThrow();
  });

  it('should reject name shorter than 2 characters', () => {
    const invalidData = {
      ...validCityData,
      name: 'A',
    };
    expect(() => cityFormSchema.parse(invalidData)).toThrow();
  });

  it('should reject name_en shorter than 2 characters', () => {
    const invalidData = {
      ...validCityData,
      name_en: 'A',
    };
    expect(() => cityFormSchema.parse(invalidData)).toThrow();
  });

  it('should apply default values correctly', () => {
    const minimalData = {
      id: 'athens',
      name: 'Athens',
      name_en: 'Athens',
      name_municipality: 'Municipality',
      name_municipality_en: 'Municipality',
      timezone: 'Europe/Athens',
      authorityType: 'municipality' as const,
      supportsNotifications: false,
      consultationsEnabled: false,
    };
    const parsed = cityFormSchema.parse(minimalData);
    expect(parsed.officialSupport).toBe(CITY_DEFAULTS.officialSupport);
    expect(parsed.status).toBe(CITY_DEFAULTS.status);
    expect(parsed.highlightCreationPermission).toBe(CITY_DEFAULTS.highlightCreationPermission);
  });

  it('should allow optional logoImage File', () => {
    const file = new File(['content'], 'logo.png', { type: 'image/png' });
    const dataWithLogo = {
      ...validCityData,
      logoImage: file,
    };
    const parsed = cityFormSchema.parse(dataWithLogo);
    expect(parsed.logoImage).toBeInstanceOf(File);
  });

  it('should allow logoImage to be undefined', () => {
    const parsed = cityFormSchema.parse(validCityData);
    expect(parsed.logoImage).toBeUndefined();
  });
});

describe('createCityFormDataSchema (Backend POST)', () => {
  const createMockFile = (name = 'logo.png'): File => {
    return new File(['content'], name, { type: 'image/png' });
  };

  const validFormData = {
    id: 'athens',
    name: 'Athens',
    name_en: 'Athens',
    name_municipality: 'Municipality of Athens',
    name_municipality_en: 'Municipality of Athens',
    timezone: 'Europe/Athens',
    authorityType: 'municipality',
    supportsNotifications: 'true',
    consultationsEnabled: 'false',
    officialSupport: 'true',
    status: 'pending',
    highlightCreationPermission: 'ADMINS_ONLY',
    logoImage: createMockFile(),
  };

  it('should transform string booleans to actual booleans', () => {
    const parsed = createCityFormDataSchema.parse(validFormData);
    expect(parsed.supportsNotifications).toBe(true);
    expect(parsed.consultationsEnabled).toBe(false);
    expect(parsed.officialSupport).toBe(true);
  });

  it('should apply default values for boolean strings', () => {
    const dataWithoutBooleans = {
      id: 'athens',
      name: 'Athens',
      name_en: 'Athens',
      name_municipality: 'Municipality',
      name_municipality_en: 'Municipality',
      timezone: 'Europe/Athens',
      logoImage: createMockFile(),
    };
    const parsed = createCityFormDataSchema.parse(dataWithoutBooleans);
    expect(parsed.supportsNotifications).toBe(CITY_DEFAULTS.supportsNotifications);
    expect(parsed.consultationsEnabled).toBe(CITY_DEFAULTS.consultationsEnabled);
    expect(parsed.officialSupport).toBe(CITY_DEFAULTS.officialSupport);
    expect(parsed.status).toBe(CITY_DEFAULTS.status);
    expect(parsed.authorityType).toBe(CITY_DEFAULTS.authorityType);
  });

  it('should require logoImage File', () => {
    const dataWithoutLogo = {
      ...validFormData,
      logoImage: undefined,
    };
    expect(() => createCityFormDataSchema.parse(dataWithoutLogo)).toThrow();
  });

  it('should validate logoImage is a File instance', () => {
    const invalidData = {
      ...validFormData,
      logoImage: 'not-a-file',
    };
    expect(() => createCityFormDataSchema.parse(invalidData)).toThrow();
  });

  it('should validate logoImage is a File instance (null)', () => {
    const invalidData = {
      ...validFormData,
      logoImage: null,
    };
    expect(() => createCityFormDataSchema.parse(invalidData)).toThrow();
  });

  it('should validate required fields', () => {
    const missingName = {
      ...validFormData,
      name: undefined,
    };
    expect(() => createCityFormDataSchema.parse(missingName)).toThrow();
  });
});

describe('updateCityFormDataSchema (Backend PUT)', () => {
  const createMockFile = (name = 'logo.png'): File => {
    return new File(['content'], name, { type: 'image/png' });
  };

  it('should allow all fields to be optional', () => {
    const minimalData = {};
    expect(() => updateCityFormDataSchema.parse(minimalData)).not.toThrow();
  });

  it('should validate provided fields', () => {
    const partialData = {
      name: 'A', // Too short
    };
    expect(() => updateCityFormDataSchema.parse(partialData)).toThrow();
  });

  it('should accept valid partial data', () => {
    const partialData = {
      name: 'Athens',
      supportsNotifications: 'true',
    };
    const parsed = updateCityFormDataSchema.parse(partialData);
    expect(parsed.name).toBe('Athens');
    expect(parsed.supportsNotifications).toBe(true);
  });

  it('should handle nullable logoImage', () => {
    const data = {
      logoImage: null,
    };
    const parsed = updateCityFormDataSchema.parse(data);
    expect(parsed.logoImage).toBeNull();
  });

  it('should handle optional logoImage File', () => {
    const file = createMockFile();
    const data = {
      logoImage: file,
    };
    const parsed = updateCityFormDataSchema.parse(data);
    expect(parsed.logoImage).toBeInstanceOf(File);
  });

  it('should transform string booleans to actual booleans', () => {
    const data = {
      supportsNotifications: 'true',
      consultationsEnabled: 'false',
    };
    const parsed = updateCityFormDataSchema.parse(data);
    expect(parsed.supportsNotifications).toBe(true);
    expect(parsed.consultationsEnabled).toBe(false);
  });

  it('should handle optional officialSupport for superadmin', () => {
    const data = {
      officialSupport: 'true',
    };
    const parsed = updateCityFormDataSchema.parse(data);
    expect(parsed.officialSupport).toBe(true);
  });

  it('should handle optional status for superadmin', () => {
    const data = {
      status: 'listed',
    };
    const parsed = updateCityFormDataSchema.parse(data);
    expect(parsed.status).toBe('listed');
  });

  it('should handle peopleOrdering as optional nullable', () => {
    const data1 = {
      peopleOrdering: 'default',
    };
    const parsed1 = updateCityFormDataSchema.parse(data1);
    expect(parsed1.peopleOrdering).toBe('default');

    const data2 = {
      peopleOrdering: null,
    };
    const parsed2 = updateCityFormDataSchema.parse(data2);
    expect(parsed2.peopleOrdering).toBeNull();

    const data3 = {};
    const parsed3 = updateCityFormDataSchema.parse(data3);
    expect(parsed3.peopleOrdering).toBeUndefined();
  });
});

describe('Enum validation', () => {
  const baseData = {
    name: 'Athens',
    name_en: 'Athens',
    name_municipality: 'Municipality',
    name_municipality_en: 'Municipality',
    timezone: 'Europe/Athens',
    supportsNotifications: false,
    consultationsEnabled: false,
  };

  describe('authorityType', () => {
    it('should accept valid authorityType values', () => {
      ['municipality', 'region'].forEach(authorityType => {
        expect(() => baseCityFormSchema.parse({
          ...baseData,
          authorityType: authorityType as 'municipality' | 'region',
        })).not.toThrow();
      });
    });

    it('should reject invalid authorityType', () => {
      expect(() => baseCityFormSchema.parse({
        ...baseData,
        authorityType: 'invalid' as any,
      })).toThrow();
    });
  });

  describe('status', () => {
    it('should accept valid status values', () => {
      ['pending', 'unlisted', 'listed'].forEach(status => {
        expect(() => baseCityFormSchema.parse({
          ...baseData,
          status: status as 'pending' | 'unlisted' | 'listed',
          authorityType: 'municipality',
        })).not.toThrow();
      });
    });

    it('should reject invalid status', () => {
      expect(() => baseCityFormSchema.parse({
        ...baseData,
        status: 'invalid' as any,
        authorityType: 'municipality',
      })).toThrow();
    });
  });

  describe('peopleOrdering', () => {
    it('should accept valid peopleOrdering values', () => {
      ['default', 'partyRank'].forEach(ordering => {
        expect(() => baseCityFormSchema.parse({
          ...baseData,
          peopleOrdering: ordering as 'default' | 'partyRank',
          authorityType: 'municipality',
        })).not.toThrow();
      });
    });

    it('should reject invalid peopleOrdering', () => {
      expect(() => baseCityFormSchema.parse({
        ...baseData,
        peopleOrdering: 'invalid' as any,
        authorityType: 'municipality',
      })).toThrow();
    });
  });

  describe('highlightCreationPermission', () => {
    it('should accept valid highlightCreationPermission values', () => {
      ['ADMINS_ONLY', 'EVERYONE'].forEach(permission => {
        expect(() => baseCityFormSchema.parse({
          ...baseData,
          highlightCreationPermission: permission as 'ADMINS_ONLY' | 'EVERYONE',
          authorityType: 'municipality',
        })).not.toThrow();
      });
    });

    it('should reject invalid highlightCreationPermission', () => {
      expect(() => baseCityFormSchema.parse({
        ...baseData,
        highlightCreationPermission: 'invalid' as any,
        authorityType: 'municipality',
      })).toThrow();
    });
  });
});

describe('baseCityFormSchema', () => {
  it('should validate all required fields', () => {
    const validData = {
      name: 'Athens',
      name_en: 'Athens',
      name_municipality: 'Municipality of Athens',
      name_municipality_en: 'Municipality of Athens',
      timezone: 'Europe/Athens',
      authorityType: 'municipality' as const,
      supportsNotifications: false,
      consultationsEnabled: false,
    };
    expect(() => baseCityFormSchema.parse(validData)).not.toThrow();
  });

  it('should reject missing required fields', () => {
    const invalidData = {
      name: 'Athens',
      // Missing name_en, name_municipality, etc.
    };
    expect(() => baseCityFormSchema.parse(invalidData)).toThrow();
  });
});

describe('Integration: FormData with Schemas', () => {
  it('should handle complete FormData flow for city creation', () => {
    const mockFile = new File(['content'], 'logo.png', { type: 'image/png' });
    const formData = {
      id: 'athens',
      name: 'Athens',
      name_en: 'Athens',
      name_municipality: 'Municipality of Athens',
      name_municipality_en: 'Municipality of Athens',
      timezone: 'Europe/Athens',
      supportsNotifications: 'true',
      consultationsEnabled: 'false',
      logoImage: mockFile,
    };

    const parsed = createCityFormDataSchema.parse(formData);
    
    // Test that provided values are parsed correctly
    expect(parsed.id).toBe('athens');
    expect(parsed.supportsNotifications).toBe(true);
    expect(parsed.consultationsEnabled).toBe(false);
    expect(parsed.logoImage).toBeInstanceOf(File);
    
    // Test that defaults are applied using CITY_DEFAULTS
    expect(parsed.status).toBe(CITY_DEFAULTS.status);
    expect(parsed.authorityType).toBe(CITY_DEFAULTS.authorityType);
    expect(parsed.officialSupport).toBe(CITY_DEFAULTS.officialSupport);
  });

  it('should handle partial FormData flow for city update', () => {
    const formData = {
      name: 'Updated Athens',
      supportsNotifications: 'false',
    };

    const parsed = updateCityFormDataSchema.parse(formData);
    
    // Test that provided values are parsed correctly
    expect(parsed.name).toBe('Updated Athens');
    expect(parsed.supportsNotifications).toBe(false);
    
    // Test that unprovided optional fields are undefined
    expect(parsed.timezone).toBeUndefined();
    expect(parsed.logoImage).toBeUndefined();
  });
});

describe('Edge cases: Boolean string transforms', () => {
  it('should treat empty string as false for boolean fields', () => {
    const data = {
      id: 'athens',
      name: 'Athens',
      name_en: 'Athens',
      name_municipality: 'Municipality',
      name_municipality_en: 'Municipality',
      timezone: 'Europe/Athens',
      supportsNotifications: '',
      consultationsEnabled: '',
      logoImage: new File([''], 'logo.png'),
    };
    const parsed = createCityFormDataSchema.parse(data);
    expect(parsed.supportsNotifications).toBe(false);
    expect(parsed.consultationsEnabled).toBe(false);
  });

  it('should treat any non-"true" string as false', () => {
    const data = {
      id: 'athens',
      name: 'Athens',
      name_en: 'Athens',
      name_municipality: 'Municipality',
      name_municipality_en: 'Municipality',
      timezone: 'Europe/Athens',
      supportsNotifications: '1',
      consultationsEnabled: 'yes',
      logoImage: new File([''], 'logo.png'),
    };
    const parsed = createCityFormDataSchema.parse(data);
    expect(parsed.supportsNotifications).toBe(false);
    expect(parsed.consultationsEnabled).toBe(false);
  });
});

describe('Validation errors', () => {
  it('should reject invalid city ID format', () => {
    const data = {
      id: 'INVALID',
      name: 'Athens',
      name_en: 'Athens',
      name_municipality: 'Municipality',
      name_municipality_en: 'Municipality',
      timezone: 'Europe/Athens',
      authorityType: 'municipality' as const,
      supportsNotifications: false,
      consultationsEnabled: false,
    };

    expect(() => cityFormSchema.parse(data)).toThrow(z.ZodError);
  });

  it('should reject missing required logoImage', () => {
    const data = {
      id: 'athens',
      name: 'Athens',
      name_en: 'Athens',
      name_municipality: 'Municipality',
      name_municipality_en: 'Municipality',
      timezone: 'Europe/Athens',
      // missing logoImage
    };

    expect(() => createCityFormDataSchema.parse(data)).toThrow(z.ZodError);
  });
});

describe('File edge cases', () => {
  it('should handle empty File (0 bytes)', () => {
    const emptyFile = new File([], 'empty.png', { type: 'image/png' });
    const data = {
      id: 'athens',
      name: 'Athens',
      name_en: 'Athens',
      name_municipality: 'Municipality',
      name_municipality_en: 'Municipality',
      timezone: 'Europe/Athens',
      logoImage: emptyFile,
    };
    
    const parsed = createCityFormDataSchema.parse(data);
    expect(parsed.logoImage).toBeInstanceOf(File);
    expect(parsed.logoImage.size).toBe(0);
  });

  it('should handle File without explicit type', () => {
    const file = new File(['content'], 'logo.png');
    const data = {
      id: 'athens',
      name: 'Athens',
      name_en: 'Athens',
      name_municipality: 'Municipality',
      name_municipality_en: 'Municipality',
      timezone: 'Europe/Athens',
      logoImage: file,
    };
    
    const parsed = createCityFormDataSchema.parse(data);
    expect(parsed.logoImage).toBeInstanceOf(File);
    expect(parsed.logoImage.name).toBe('logo.png');
  });
});

