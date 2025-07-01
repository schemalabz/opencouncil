import React from 'react';
import { env } from '@/env.mjs';

interface StructuredDataProps {
    type: 'organization' | 'government' | 'meeting' | 'city' | 'breadcrumb';
    data?: Record<string, any>;
    cityName?: string;
    meetingData?: {
        name: string;
        dateTime: string;
        cityName: string;
        description?: string;
    };
    breadcrumbs?: Array<{
        name: string;
        url: string;
    }>;
}

export default function StructuredData({ type, data, cityName, meetingData, breadcrumbs }: StructuredDataProps) {
    const generateStructuredData = () => {
        const baseUrl = env.NEXT_PUBLIC_BASE_URL;

        switch (type) {
            case 'organization':
                return {
                    '@context': 'https://schema.org',
                    '@type': 'Organization',
                    name: 'OpenCouncil',
                    description: 'Πλατφόρμα ανοιχτής τοπικής αυτοδιοίκησης με χρήση τεχνητής νοημοσύνης',
                    url: baseUrl,
                    logo: `${baseUrl}/logo.png`,
                    foundingDate: '2024',
                    founder: {
                        '@type': 'Organization',
                        name: 'Schema Labs',
                        url: 'https://schemalabs.gr'
                    },
                    sameAs: [
                        'https://twitter.com/opencouncil_gr',
                        'https://schemalabs.substack.com',
                    ],
                    areaServed: {
                        '@type': 'Country',
                        name: 'Greece',
                        alternateName: 'Ελλάδα'
                    },
                    applicationCategory: 'GovernmentApplication',
                    operatingSystem: 'Web',
                    ...data
                };

            case 'government':
                return {
                    '@context': 'https://schema.org',
                    '@type': 'GovernmentOrganization',
                    name: cityName || 'Δημοτικό Συμβούλιο',
                    description: `Δημοτικό συμβούλιο ${cityName} - Συνεδριάσεις και αποφάσεις`,
                    areaServed: {
                        '@type': 'City',
                        name: cityName,
                        addressCountry: 'GR'
                    },
                    governmentType: 'Municipal',
                    ...data
                };

            case 'meeting':
                if (!meetingData) return null;
                return {
                    '@context': 'https://schema.org',
                    '@type': 'Event',
                    '@id': `${baseUrl}/${meetingData.cityName}/meetings/${meetingData.name}`,
                    name: meetingData.name,
                    description: meetingData.description || `Συνεδρίαση δημοτικού συμβουλίου ${meetingData.cityName}`,
                    startDate: meetingData.dateTime,
                    eventStatus: 'EventScheduled',
                    eventAttendanceMode: 'OfflineEventAttendanceMode',
                    organizer: {
                        '@type': 'GovernmentOrganization',
                        name: `Δήμος ${meetingData.cityName}`,
                        areaServed: {
                            '@type': 'City',
                            name: meetingData.cityName,
                            addressCountry: 'GR'
                        }
                    },
                    about: {
                        '@type': 'Thing',
                        name: 'Τοπική Αυτοδιοίκηση',
                        description: 'Θέματα δημοτικού συμβουλίου και αποφάσεις'
                    },
                    ...data
                };

            case 'city':
                return {
                    '@context': 'https://schema.org',
                    '@type': 'City',
                    name: cityName,
                    addressCountry: 'GR',
                    governmentType: 'Municipal',
                    description: `Δημοτικό συμβούλιο ${cityName} - Παρακολουθήστε συνεδριάσεις και αποφάσεις`,
                    ...data
                };

            case 'breadcrumb':
                if (!breadcrumbs || breadcrumbs.length === 0) return null;
                return {
                    '@context': 'https://schema.org',
                    '@type': 'BreadcrumbList',
                    itemListElement: breadcrumbs.map((crumb, index) => ({
                        '@type': 'ListItem',
                        position: index + 1,
                        name: crumb.name,
                        item: `${baseUrl}${crumb.url}`
                    }))
                };

            default:
                return null;
        }
    };

    const structuredData = generateStructuredData();

    if (!structuredData) {
        return null;
    }

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
                __html: JSON.stringify(structuredData)
            }}
        />
    );
}