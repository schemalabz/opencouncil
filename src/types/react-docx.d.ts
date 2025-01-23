declare module 'react-docx' {
    interface DocumentProperties {
        creator: string;
        description: string;
        title: string;
        subject: string;
        keywords: string[];
        lastModifiedBy: string;
    }

    export function renderAsyncDocument(
        element: React.ReactElement,
        documentProperties: DocumentProperties,
        fileProperties?: any
    ): Promise<{
        save(): Promise<Blob>;
    }>;
} 