import { useState } from 'react';

export interface CitySheetState {
    open: boolean;
    cityId: string;
    cityName: string;
    logoImage?: string;
    meetingsCount: number;
    officialSupport: boolean;
    supportsNotifications: boolean;
}

export interface SubjectSheetState {
    open: boolean;
    subjectId: string;
    subjectName: string;
    cityId: string;
    councilMeetingId: string;
    description?: string;
    locationText?: string;
    topicName?: string;
    topicColor?: string;
    topicIcon?: string | null;
    meetingDate?: string;
    meetingName?: string;
    discussionTimeSeconds?: number;
    speakerCount?: number;
    cityName?: string;
}

const initialCitySheetState: CitySheetState = {
    open: false,
    cityId: '',
    cityName: '',
    meetingsCount: 0,
    officialSupport: false,
    supportsNotifications: false
};

const initialSubjectSheetState: SubjectSheetState = {
    open: false,
    subjectId: '',
    subjectName: '',
    cityId: '',
    councilMeetingId: ''
};

/**
 * Hook to manage city and subject sheet modals
 * Provides open/close handlers for both sheets
 */
export function useMapSheets() {
    const [citySheet, setCitySheet] = useState<CitySheetState>(initialCitySheetState);
    const [subjectSheet, setSubjectSheet] = useState<SubjectSheetState>(initialSubjectSheetState);

    const openCitySheet = (data: Omit<CitySheetState, 'open'>) => {
        setCitySheet({ ...data, open: true });
    };

    const closeCitySheet = () => {
        setCitySheet(prev => ({ ...prev, open: false }));
    };

    const openSubjectSheet = (data: Omit<SubjectSheetState, 'open'>) => {
        setSubjectSheet({ ...data, open: true });
    };

    const closeSubjectSheet = () => {
        setSubjectSheet(prev => ({ ...prev, open: false }));
    };

    return {
        citySheet,
        setCitySheet,
        openCitySheet,
        closeCitySheet,
        subjectSheet,
        setSubjectSheet,
        openSubjectSheet,
        closeSubjectSheet
    };
}
