"use server";
import { Topic } from '@prisma/client';
import prisma from "./prisma";

export async function getAllTopics(): Promise<Topic[]> {
    try {
        const topics = await prisma.topic.findMany();
        return topics;
    } catch (error) {
        console.error('Error fetching topics:', error);
        throw new Error('Failed to fetch topics');
    }
}
