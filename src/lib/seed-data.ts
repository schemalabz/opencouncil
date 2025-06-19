import * as fs from 'fs';
import * as path from 'path';
import { City, CouncilMeeting, Subject, Person, Party, Topic, AdministrativeBody } from '@prisma/client';
import { SeedData } from './db/types';
import { env } from '@/env.mjs';

// Cache the seed data to avoid repeated file reads
let seedDataCache: SeedData | null = null;

/**
 * Get the seed data path based on environment
 */
function getSeedDataPath(): string {
    // First try environment variable
    const envPath = env.SEED_DATA_PATH;
    if (envPath) {
        return envPath;
    }

    // Then try relative to project root
    const relativePath = path.join('prisma', 'seed_data.json');
    if (fs.existsSync(relativePath)) {
        return relativePath;
    }

    // Finally try absolute path from project root
    const absolutePath = path.join(process.cwd(), 'prisma', 'seed_data.json');
    if (fs.existsSync(absolutePath)) {
        return absolutePath;
    }

    throw new Error('Could not find seed data file. Please set SEED_DATA_PATH environment variable or ensure seed_data.json exists in prisma directory.');
}

/**
 * Load seed data from the JSON file
 */
export function loadSeedData(): SeedData {
    if (seedDataCache) {
        return seedDataCache;
    }

    try {
        const seedDataPath = getSeedDataPath();
        const data = JSON.parse(fs.readFileSync(seedDataPath, 'utf-8'));
        seedDataCache = data;
        return data;
    } catch (error) {
        console.error('Error loading seed data:', error);
        throw new Error('Failed to load seed data. Please check the file exists and is accessible.');
    }
}

/**
 * Helper function to get random items from an array
 */
export function getRandomItems<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, array.length));
}

/**
 * Find a city by ID
 */
export function findCity(cityId: string): City | undefined {
    const data = loadSeedData();
    return data.cities.find(city => city.id === cityId);
}

/**
 * Find a meeting by ID
 */
export function findMeeting(meetingId: string): CouncilMeeting | undefined {
    const data = loadSeedData();
    return data.meetings.find(meeting => meeting.id === meetingId);
}

/**
 * Find subjects for a specific meeting
 */
export function findSubjectsForMeeting(meetingId: string): Subject[] {
    const data = loadSeedData();
    const meeting = data.meetings.find(m => m.id === meetingId);
    if (!meeting?.subjects) return [];
    
    // Return 2-4 random subjects from the meeting
    return getRandomItems(meeting.subjects, Math.floor(Math.random() * 3) + 2);
}

/**
 * Find subjects that match a search query
 */
export function findSubjectsByQuery(query: string, cityId?: string): Subject[] {
    const data = loadSeedData();
    const searchTerms = query.toLowerCase().split(' ');
    
    // Get all subjects from relevant meetings
    const allSubjects = data.meetings
        .filter(meeting => !cityId || meeting.cityId === cityId)
        .flatMap(meeting => meeting.subjects || []);
    
    // If no search terms, return random subjects
    if (searchTerms.length === 0) {
        return getRandomItems(allSubjects, 3);
    }
    
    // Find matching subjects
    const matchingSubjects = allSubjects.filter(subject => {
        const subjectText = `${subject.name} ${subject.description}`.toLowerCase();
        return searchTerms.every(term => subjectText.includes(term));
    });
    
    // If we have matches, return 1-3 random matches
    if (matchingSubjects.length > 0) {
        return getRandomItems(matchingSubjects, Math.floor(Math.random() * 3) + 1);
    }
    
    // If no matches, return 1-2 random subjects anyway
    return getRandomItems(allSubjects, Math.floor(Math.random() * 2) + 1);
}

/**
 * Get all cities
 */
export function getAllCities(): City[] {
    const data = loadSeedData();
    // Return 3-5 random cities
    return getRandomItems(data.cities, Math.floor(Math.random() * 3) + 3);
}

/**
 * Get all meetings for a city
 */
export function getMeetingsForCity(cityId: string): CouncilMeeting[] {
    const data = loadSeedData();
    const cityMeetings = data.meetings.filter(meeting => meeting.cityId === cityId);
    // Return 2-4 random meetings
    return getRandomItems(cityMeetings, Math.floor(Math.random() * 3) + 2);
}

/**
 * Get all topics
 */
export function getAllTopics(): Topic[] {
    const data = loadSeedData();
    // Return 3-6 random topics
    return getRandomItems(data.topics, Math.floor(Math.random() * 4) + 3);
}

/**
 * Get all parties for a city
 */
export function getPartiesForCity(cityId: string): Party[] {
    const data = loadSeedData();
    const cityParties = data.parties.filter(party => party.cityId === cityId);
    // Return 2-4 random parties
    return getRandomItems(cityParties, Math.floor(Math.random() * 3) + 2);
}

/**
 * Get all administrative bodies for a city
 */
export function getAdministrativeBodiesForCity(cityId: string): AdministrativeBody[] {
    const data = loadSeedData();
    const cityBodies = data.administrativeBodies.filter(body => body.cityId === cityId);
    // Return 1-3 random bodies
    return getRandomItems(cityBodies, Math.floor(Math.random() * 3) + 1);
}

/**
 * Get all persons for a city
 */
export function getPersonsForCity(cityId: string): Person[] {
    const data = loadSeedData();
    const cityPersons = data.persons.filter(person => person.cityId === cityId);
    // Return 3-6 random persons
    return getRandomItems(cityPersons, Math.floor(Math.random() * 4) + 3);
} 