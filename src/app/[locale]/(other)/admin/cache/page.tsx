import { Metadata } from 'next';
import { CacheRevalidationForm } from '@/components/admin/cache/CacheRevalidationForm';
import { ErrorMessage } from '@/components/onboarding/ErrorMessage';
import { Info } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Cache Revalidation - Admin',
    description: 'Revalidate cache across the application',
};

export default function CacheRevalidationPage() {
    return (
        <div className="container mx-auto py-8">
            <h1 className="text-3xl font-bold mb-6">Cache Revalidation</h1>
            
            <div className="bg-blue-50 p-4 rounded-lg mb-6">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <Info className="h-5 w-5 text-blue-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                        <h3 className="text-sm font-medium text-blue-800">Debugging Tool</h3>
                        <div className="mt-2 text-sm text-blue-700">
                            <p>
                                This page is intended for debugging purposes and should be used when there are issues with cache in production that require manual intervention. For a better understanding of Next.js caching mechanisms, please refer to{' '}
                                <a 
                                    href="https://blog.webdevsimplified.com/2024-01/next-js-app-router-cache/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 underline"
                                >
                                    this comprehensive guide on Next.js App Router caching
                                </a>
                                {' '}and the{' '}
                                <a 
                                    href="https://nextjs.org/docs/app/deep-dive/caching"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 underline"
                                >
                                    official Next.js caching documentation
                                </a>.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
                <CacheRevalidationForm />
            </div>
        </div>
    );
} 