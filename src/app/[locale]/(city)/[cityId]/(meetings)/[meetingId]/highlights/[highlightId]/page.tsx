"use client";
import { useParams } from "next/navigation";
import { HighlightView } from "@/components/meetings/HighlightView";
import { notFound } from "next/navigation";
import { useState, useEffect } from "react";
import type { HighlightWithUtterances } from "@/lib/db/highlights";

export default function HighlightPage() {
    const params = useParams();
    const highlightId = params.highlightId as string;
    
    const [highlight, setHighlight] = useState<HighlightWithUtterances | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    useEffect(() => {
        async function fetchHighlight() {
            try {
                setLoading(true);
                const res = await fetch(`/api/highlights/${highlightId}`);
                
                if (!res.ok) {
                    if (res.status === 404) {
                        notFound();
                        return;
                    }
                    throw new Error('Failed to fetch highlight');
                }
                
                const fetchedHighlight: HighlightWithUtterances = await res.json();
                setHighlight(fetchedHighlight);
            } catch (error) {
                console.error('Failed to fetch highlight:', error);
                setError('Failed to load highlight');
            } finally {
                setLoading(false);
            }
        }
        
        if (highlightId) {
            fetchHighlight();
        }
    }, [highlightId]);
    
    if (loading) {
        return (
            <div className="container mx-auto py-8 px-4">
                <div className="flex items-center justify-center min-h-[200px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            </div>
        );
    }
    
    if (error) {
        return (
            <div className="container mx-auto py-8 px-4">
                <div className="text-center text-red-600">
                    <p>{error}</p>
                </div>
            </div>
        );
    }
    
    if (!highlight) {
        notFound();
    }

    return (
        <div className="container mx-auto py-8 px-4">
            <HighlightView highlight={highlight} />
        </div>
    );
} 