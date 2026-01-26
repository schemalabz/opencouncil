import { City } from '@prisma/client';

/**
 * Type for city update data
 * Excludes fields that shouldn't be updated directly
 */
export type CityUpdateData = Partial<
  Omit<City, 'id' | 'createdAt' | 'updatedAt' | 'geometry'>
>;

