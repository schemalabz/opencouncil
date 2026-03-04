'use client';

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { OnboardingStepTemplate } from '@/components/onboarding/OnboardingStepTemplate';
import { OnboardingFooter } from '@/components/onboarding/OnboardingFooter';
import { OnboardingStage } from '@/lib/types/onboarding';

type Status = 'loading' | 'done' | 'error' | 'no_matches';

export function WelcomeBriefStep() {
    const { city, selectedTopics, setStage } = useOnboarding();
    const [brief, setBrief] = useState<string | null>(null);
    const [status, setStatus] = useState<Status>('loading');

    useEffect(() => {
        if (!city) {
            setStatus('error');
            return;
        }
        const topicIds = selectedTopics.map(t => t.id);

        fetch(`/api/cities/${city.id}/welcome-brief`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topicIds }),
        })
            .then(res => res.json())
            .then((data: { brief: string | null }) => {
                if (data.brief) {
                    setBrief(data.brief);
                    setStatus('done');
                } else {
                    setStatus('no_matches');
                }
            })
            .catch(() => {
                setStatus('error');
            });
    }, [city, selectedTopics]);

    const handleContinue = () => {
        setStage(OnboardingStage.NOTIFICATION_COMPLETE);
    };

    return (
        <OnboardingStepTemplate
            title="Να τι έχεις χάσει"
            footer={
                <OnboardingFooter
                    currentStep={0}
                    totalSteps={0}
                    onBack={() => {}}
                    onAction={handleContinue}
                    actionLabel="Συνέχεια →"
                    isActionDisabled={status === 'loading'}
                    hideBack={true}
                />
            }
        >
            {status === 'loading' && (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                        <motion.div
                            key={i}
                            className="h-4 bg-gray-200 rounded"
                            style={{ width: `${100 - (i % 3) * 15}%` }}
                            animate={{ opacity: [0.4, 0.8, 0.4] }}
                            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }}
                        />
                    ))}
                    <p className="text-sm text-muted-foreground mt-4">
                        Ετοιμάζουμε το προσωπικό σου briefing…
                    </p>
                </div>
            )}

            {status === 'done' && brief && (
                <div className="prose prose-sm max-w-none text-sm
                    [&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-2
                    [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mb-1 [&_h2]:mt-3
                    [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1
                    [&_p]:mb-2 [&_p]:leading-relaxed
                    [&_ul]:mb-2 [&_ul]:ml-4 [&_ul]:list-disc [&_ul]:space-y-1
                    [&_li]:leading-relaxed
                    [&_strong]:font-semibold
                ">
                    <ReactMarkdown>{brief}</ReactMarkdown>
                </div>
            )}

            {status === 'no_matches' && (
                <p className="text-sm text-muted-foreground">
                    Δεν βρήκαμε ακόμα συζητήσεις για τα θέματα σου, αλλά μείνε συνδεδεμένος! Θα σε ειδοποιήσουμε μόλις ξεκινήσουν.
                </p>
            )}

            {status === 'error' && (
                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                        Κάτι πήγε στραβά με την προετοιμασία του briefing σου.
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Μπορείς να συνεχίσεις κανονικά — θα λαμβάνεις ειδοποιήσεις για τα θέματα που επέλεξες.
                    </p>
                </div>
            )}
        </OnboardingStepTemplate>
    );
}
