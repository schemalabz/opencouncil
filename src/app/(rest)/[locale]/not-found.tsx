
import { useTranslations } from 'next-intl';
import React from 'react';

export default function NotFoundPage() {
    const t = useTranslations('NotFoundPage');
    return <h1>{t('title')}</h1>;
}