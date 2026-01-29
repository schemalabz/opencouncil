import { CITY_DEFAULTS } from '@/lib/zod-schemas/city';

/**
 * Helper to create FormData for testing city forms
 * 
 * @param overrides - Partial data to override defaults
 * @returns FormData instance with city form data
 */
export function createCityFormData(overrides?: Record<string, string | File | null>): FormData {
  const formData = new FormData();
  
  const defaults: Record<string, string> = {
    id: 'test-city',
    name: 'Test City',
    name_en: 'Test City',
    name_municipality: 'Δήμος Test',
    name_municipality_en: 'Municipality of Test',
    timezone: 'Europe/Athens',
    authorityType: CITY_DEFAULTS.authorityType,
    officialSupport: String(CITY_DEFAULTS.officialSupport),
    status: CITY_DEFAULTS.status,
    supportsNotifications: String(CITY_DEFAULTS.supportsNotifications),
    consultationsEnabled: String(CITY_DEFAULTS.consultationsEnabled),
    highlightCreationPermission: CITY_DEFAULTS.highlightCreationPermission,
  };

  const data = { ...defaults, ...overrides };
  
  Object.entries(data).forEach(([key, value]) => {
    if (value === null) {
      // Skip null values (FormData doesn't handle null well)
      return;
    } else if (value instanceof File) {
      formData.append(key, value);
    } else {
      formData.append(key, String(value));
    }
  });

  return formData;
}

/**
 * Helper to create a mock File for testing
 * 
 * @param name - Filename
 * @param content - File content (default: 'test content')
 * @param type - MIME type (default: 'image/png')
 * @returns File instance
 */
export function createMockFile(
  name: string = 'test.png',
  content: string = 'test content',
  type: string = 'image/png'
): File {
  return new File([content], name, { type });
}

/**
 * Helper to create FormData for city update (PUT) requests
 * All fields are optional
 * 
 * @param overrides - Partial data to include
 * @returns FormData instance with city update data
 */
export function createCityUpdateFormData(overrides?: Record<string, string | File | null>): FormData {
  const formData = new FormData();
  
  if (overrides) {
    Object.entries(overrides).forEach(([key, value]) => {
      if (value === null) {
        // For updates, we might want to explicitly set null
        // But FormData doesn't support null, so we skip or use empty string
        return;
      } else if (value instanceof File) {
        formData.append(key, value);
      } else {
        formData.append(key, String(value));
      }
    });
  }

  return formData;
}

