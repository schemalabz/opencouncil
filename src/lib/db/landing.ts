"use server";

import { CityMinimalWithCounts } from './cities';
import { CouncilMeetingWithAdminBodyAndSubjects } from './meetings';

export type SubstackPost = {
    title: string;
    url: string;
    publishDate: Date;
};

export type LandingCity = CityMinimalWithCounts & {
    mostRecentMeeting?: CouncilMeetingWithAdminBodyAndSubjects;
};

export type LandingPageData = {
    allCities: CityMinimalWithCounts[];
    cities: LandingCity[];
    latestPost?: SubstackPost;
};

export async function fetchLatestSubstackPost(): Promise<SubstackPost | undefined> {
    try {
        const response = await fetch('https://schemalabs.substack.com/feed');
        const text = await response.text();

        // Find the first item in the feed
        const itemMatch = text.match(/<item>[\s\S]*?<\/item>/);
        if (!itemMatch) return undefined;

        const item = itemMatch[0];

        // Extract title and date from the item
        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
        const linkMatch = item.match(/<link>(.*?)<\/link>/);
        const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);

        if (titleMatch && linkMatch && dateMatch) {
            return {
                title: titleMatch[1],
                url: linkMatch[1],
                publishDate: new Date(dateMatch[1])
            };
        }
        return undefined;
    } catch (error) {
        console.error('Error fetching Substack feed:', error);
        return undefined;
    }
}
