'use client'
import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function DocumentViewer({ sections, lastUpdated, title }: { sections: { title: string, content: string }[], lastUpdated: string, title: string }) {
    const [collapsedSections, setCollapsedSections] = useState<number[]>([]);

    const toggleSection = (index: number) => {
        setCollapsedSections(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]);
    };

    return (
        <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto bg-white shadow-xl rounded-lg overflow-hidden">
                <div className="px-4 py-5 sm:p-6">
                    <h1 className="text-3xl font-bold text-gray-900 mb-6">{title}</h1>
                    <p className="text-sm text-gray-600 mb-6">Τελευταία ενημέρωση: {lastUpdated}</p>

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
                                <div className="mt-4 text-gray-700">
                                    <ReactMarkdown
                                        components={{
                                            p: ({ children, ...props }) => (
                                                <p className="text-sm leading-relaxed mb-4" {...props}>
                                                    {children}
                                                </p>
                                            ),
                                            ul: ({ children, ...props }) => (
                                                <ul className="list-disc space-y-2 ml-6 mb-4" {...props}>
                                                    {children}
                                                </ul>
                                            ),
                                            ol: ({ children, ...props }) => (
                                                <ol className="list-decimal space-y-2 ml-6 mb-4" {...props}>
                                                    {children}
                                                </ol>
                                            ),
                                            li: ({ children, ...props }) => (
                                                <li className="text-sm leading-relaxed" {...props}>
                                                    {children}
                                                </li>
                                            ),
                                            strong: ({ children, ...props }) => (
                                                <strong className="font-semibold text-gray-900" {...props}>
                                                    {children}
                                                </strong>
                                            ),
                                            a: ({ href, children, ...props }) => {
                                                const isEmail = href?.startsWith('mailto:');
                                                return (
                                                    <a
                                                        href={href}
                                                        target={isEmail ? undefined : '_blank'}
                                                        rel={isEmail ? undefined : 'noopener noreferrer'}
                                                        className="text-blue-600 hover:underline"
                                                        {...props}
                                                    >
                                                        {children}
                                                    </a>
                                                );
                                            },
                                        }}
                                    >
                                        {section.content}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}