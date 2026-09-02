'use server';

import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getCityDecisionDetail, type CityDecisionDetail } from '@/lib/db/decisionHealthDetail';

/** Lazy detail for one city row on the decisions overview. Superadmin only. */
export async function fetchCityDecisionDetail(cityId: string): Promise<CityDecisionDetail> {
    await withUserAuthorizedToEdit({});
    return getCityDecisionDetail(cityId);
}
