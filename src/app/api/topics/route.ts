import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mock topics until we create a Topic model in the database
const mockTopics = [
    { id: '1', name: 'Καθαριότητα', name_en: 'Cleanliness', colorHex: '#4CAF50' },
    { id: '2', name: 'Ασφάλεια', name_en: 'Safety', colorHex: '#2196F3' },
    { id: '3', name: 'Πολιτισμός', name_en: 'Culture', colorHex: '#9C27B0' },
    { id: '4', name: 'Αθλητισμός', name_en: 'Sports', colorHex: '#FF9800' },
    { id: '5', name: 'Παιδεία', name_en: 'Education', colorHex: '#607D8B' },
    { id: '6', name: 'Συγκοινωνίες', name_en: 'Transportation', colorHex: '#795548' },
    { id: '7', name: 'Δημόσιοι χώροι', name_en: 'Public spaces', colorHex: '#8BC34A' },
];

export async function GET(req: NextRequest) {
    try {
        // In the future, this would be retrieved from the database
        // For now, return mock topics
        return NextResponse.json(mockTopics);

    } catch (error) {
        console.error('Error fetching topics:', error);

        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        );
    }
} 