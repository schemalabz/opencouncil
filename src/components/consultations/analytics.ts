import { captureEvent } from "@/lib/analytics/capture";

/** Where a reader opened a consultation entity from. */
export type ConsultationEntityOpenSource = 'map' | 'list' | 'address_lookup' | 'url';

export function captureConsultationAddressSearched(props: {
    consultation_id?: string;
    city_id?: string;
    in_zone: boolean;
    zone_id: string | null;
    street_count: number;
    nearby_count: number;
}): void {
    captureEvent('consultation_address_searched', props);
}

export function captureConsultationEntityOpened(props: {
    consultation_id?: string;
    city_id?: string;
    entity_type: 'geoset' | 'geometry';
    entity_id: string;
    geoset_id?: string;
    source: ConsultationEntityOpenSource;
}): void {
    captureEvent('consultation_entity_opened', props);
}
