'use server';

import { withRight } from '@/lib/auth';
import { getCityDecisionDetail, type CityDecisionDetail } from '@/lib/db/decisionHealthDetail';

/** Lazy detail for one city row on the decisions overview, for an admin of the city or of its realm. */
export async function fetchCityDecisionDetail(cityId: string): Promise<CityDecisionDetail> {
    await withRight('admin', { cityId });
    return getCityDecisionDetail(cityId);
}
