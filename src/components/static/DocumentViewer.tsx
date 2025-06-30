'use client'
import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';


export default function DocumentViewer({ sections, lastUpdated, title }: { sections: { title: string, content: string }[], lastUpdated: string, title: string }) {
    const t = useTranslations('DocumentViewer');
    const [collapsedSections, setCollapsedSections] = useState<number[]>([]);

    const toggleSection = (index: number) => {
        setCollapsedSections(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]);
    };
    const makeLinksClickable = (text: string) => {
        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
        const urlRegex = /(https?:\/\/[^\s]+)/g;

        return text.split('\n').map((line, i) => (
            <p key={i} className="text-sm leading-relaxed">
                {line.split(' ').map((word, j) => {
                    const trimmedWord = word.replace(/[.,!?]$/, '');
                    const punctuation = word.slice(trimmedWord.length);

                    if (emailRegex.test(trimmedWord)) {
                        const email = trimmedWord.match(emailRegex)![0];
                        return (
                            <>
                                <a key={j} href={`mailto:${email}`} className="text-blue-600 hover:underline">{email}</a>
                                {punctuation}
                                {' '}
                            </>
                        );
                    } else if (urlRegex.test(trimmedWord)) {
                        const url = trimmedWord.match(urlRegex)![0];
                        return (
                            <>
                                <a key={j} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{url}</a>
                                {punctuation}
                                {' '}
                            </>
                        );
                    } else {
                        return `${word} `;
                    }
                })}
            </p>
        ));
    };

    return (
        <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto bg-white shadow-xl rounded-lg overflow-hidden">
                <div className="px-4 py-5 sm:p-6">
                    <h1 className="text-3xl font-bold text-gray-900 mb-6">{title}</h1>
                    <p className="text-sm text-gray-600 mb-6">{t('lastUpdated', { lastUpdated })}</p>

                    {sections.map((section, index) => (
                        <div key={index} className="mb-4 border-b border-gray-200 pb-4">
                            <button
                                onClick={() => toggleSection(index)}
                                className="flex justify-between items-center w-full text-left"
                                aria-expanded={!collapsedSections.includes(index)}
                            >
                                <h2 className="text-xl font-semibold text-gray-900">{section.title}</h2>
                                {collapsedSections.includes(index) ? (
                                    <ChevronDownIcon className="h-6 w-6 text-gray-500" aria-hidden="true" />
                                ) : (
                                    <ChevronUpIcon className="h-6 w-6 text-gray-500" aria-hidden="true" />
                                )}
                            </button>
                            {!collapsedSections.includes(index) && (
                                <div className="mt-2 text-gray-700 space-y-2">
                                    {makeLinksClickable(section.content)}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}