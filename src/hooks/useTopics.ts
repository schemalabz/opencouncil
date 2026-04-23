'use client';

import { useState, useEffect } from 'react';
import { Topic } from '@prisma/client';

/**
 * Fetches non-deprecated topics from the API.
 * Returns the topics list, loading state, and any error message.
 */
export function useTopics() {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchTopics() {
            try {
                const response = await fetch('/api/topics');
                if (!response.ok) {
                    throw new Error('Failed to fetch topics');
                }
                const data: Topic[] = await response.json();
                setTopics(data);
            } catch (err) {
                setError('Υπήρξε πρόβλημα στη φόρτωση των θεμάτων');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }

        fetchTopics();
    }, []);

    return { topics, isLoading, error };
}
