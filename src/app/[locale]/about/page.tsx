import React from 'react';
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../../components/ui/card";
import { Mic, FileText, Github, Globe, Database, Zap, Clock, Sparkles, LetterText, BotMessageSquare, PhoneCall, Search, MessageSquare, HelpCircle } from 'lucide-react';
import { Link } from '../../../i18n/routing';
import { useTranslations } from 'next-intl';

export default function AboutPage() {
    const t = useTranslations('AboutPage');

    return (
        <div className="container mx-auto px-4 py-8">
            {/* Hero Section */}
            <section className="text-center py-20">
                <h1 className="text-4xl md:text-6xl font-bold mb-6">{t('hero.title')}</h1>
                <p className="text-xl md:text-2xl mb-8">{t('hero.subtitle')}</p>
                <div className="flex justify-center space-x-4">
                    <Button size="lg">{t('hero.getStarted')}</Button>
                    <Button size="lg" variant="outline">
                        <PhoneCall className="mr-2 h-4 w-4" />
                        {t('hero.scheduleCall')}
                    </Button>
                </div>
            </section>

            {/* Feature Showcase */}
            <section className="py-16">
                <h2 className="text-3xl font-bold text-center mb-12">{t('features.title')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <FeatureCard
                        icon={<Mic className="h-10 w-10" />}
                        title={t('features.speakerRecognition.title')}
                        description={t('features.speakerRecognition.description')}
                    />
                    <FeatureCard
                        icon={<FileText className="h-10 w-10" />}
                        title={t('features.accurateTranscriptions.title')}
                        description={t('features.accurateTranscriptions.description')}
                    />
                    <FeatureCard
                        icon={<LetterText className="h-10 w-10" />}
                        title={t('features.summarization.title')}
                        description={t('features.summarization.description')}
                    />
                    <FeatureCard
                        icon={<BotMessageSquare className="h-10 w-10" />}
                        title={t('features.aiChatAssistant.title')}
                        description={t('features.aiChatAssistant.description')}
                    />
                    <FeatureCard
                        icon={<Sparkles className="h-10 w-10" />}
                        title={t('features.highlights.title')}
                        description={t('features.highlights.description')}
                    />
                    <FeatureCard
                        icon={<Github className="h-10 w-10" />}
                        title={t('features.openSource.title')}
                        description={t('features.openSource.description')}
                    />
                    <FeatureCard
                        icon={<Database className="h-10 w-10" />}
                        title={t('features.openData.title')}
                        description={t('features.openData.description')}
                    />
                    <FeatureCard
                        icon={<Globe className="h-10 w-10" />}
                        title={t('features.multilingual.title')}
                        description={t('features.multilingual.description')}
                    />
                    <FeatureCard
                        icon={<Zap className="h-10 w-10" />}
                        title={t('features.immediateIntegration.title')}
                        description={t('features.immediateIntegration.description')}
                    />
                </div>
            </section>

            {/* Pricing Section */}
            <section className="py-16 bg-gray-100 rounded-lg">
                <h2 className="text-3xl font-bold text-center mb-12">{t('pricing.title')}</h2>
                <p className="text-center text-gray-700 mb-8 max-w-2xl mx-auto">
                    {t('pricing.description')}
                </p>
                <div className="max-w-3xl m-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card className="mb-8 md:mb-0 flex flex-col h-full">
                        <CardHeader>
                            <CardTitle className="text-2xl font-bold text-center">
                                {t('pricing.freeTrial.title')}
                            </CardTitle>
                            <p className="text-center text-gray-600">
                                {t('pricing.freeTrial.subtitle')}
                            </p>
                        </CardHeader>
                        <CardContent className="flex-grow">
                            <ul className="space-y-2">
                                <li className="flex items-start">
                                    <Clock className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                    <span>{t('pricing.freeTrial.features.unlimitedDuration')}</span>
                                </li>
                                <li className="flex items-start">
                                    <FileText className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                    <span>{t('pricing.freeTrial.features.fullAccess')}</span>
                                </li>
                                <li className="flex items-start">
                                    <Zap className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                    <span>{t('pricing.freeTrial.features.noPayment')}</span>
                                </li>
                                <li className="flex items-start">
                                    <HelpCircle className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                    <span>{t('pricing.freeTrial.features.dedicatedSupport')}</span>
                                </li>
                            </ul>
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full">{t('pricing.freeTrial.cta')}</Button>
                        </CardFooter>
                    </Card>
                    <Card className="flex flex-col h-full">
                        <CardHeader>
                            <CardTitle className="text-2xl font-bold text-center">
                                {t('pricing.paid.title')}
                            </CardTitle>
                            <p className="text-center text-gray-600">
                                {t('pricing.paid.subtitle')}
                            </p>
                        </CardHeader>
                        <CardContent className="flex-grow">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <ul className="space-y-2">
                                    <li className="flex items-start">
                                        <Clock className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                        <span>{t('pricing.paid.features.unlimitedMeetings')}</span>
                                    </li>
                                    <li className="flex items-start">
                                        <FileText className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                        <span>{t('pricing.paid.features.transcriptions')}</span>
                                    </li>
                                    <li className="flex items-start">
                                        <Mic className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                        <span>{t('pricing.paid.features.speakerRecognition')}</span>
                                    </li>
                                    <li className="flex items-start">
                                        <Zap className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                        <span>{t('pricing.paid.features.aiSummarization')}</span>
                                    </li>
                                    <li className="flex items-start">
                                        <Database className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                        <span>{t('pricing.paid.features.freeHosting')}</span>
                                    </li>
                                    <li className="flex items-start">
                                        <Globe className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                        <span>{t('pricing.paid.features.support')}</span>
                                    </li>
                                </ul>
                                <ul className="space-y-2">
                                    <li className="flex items-start">
                                        <Search className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                        <span>{t('pricing.paid.features.search')}</span>
                                    </li>
                                    <li className="flex items-start">
                                        <BotMessageSquare className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                        <span>{t('pricing.paid.features.aiChatCredits')}</span>
                                    </li>
                                    <li className="flex items-start">
                                        <Sparkles className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                        <span>{t('pricing.paid.features.highlights')}</span>
                                    </li>
                                    <li className="flex items-start">
                                        <Database className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                        <span>{t('pricing.paid.features.openDataApi')}</span>
                                    </li>
                                    <li className="flex items-start">
                                        <Globe className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                        <span>{t('pricing.paid.features.multilingualSupport')}</span>
                                    </li>
                                    <li className="flex items-start">
                                        <Zap className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                        <span>{t('pricing.paid.features.immediateIntegration')}</span>
                                    </li>
                                </ul>
                            </div>
                            <div className="mt-6 flex justify-center">
                                <Button className="w-full" variant="outline">
                                    <PhoneCall className="mr-2 h-4 w-4" />
                                    {t('pricing.paid.cta')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </section>

            <section className="py-16 ">
                <div className="container mx-auto px-4">
                    <h2 className="text-3xl font-bold text-center mb-8">{t('about.title')}</h2>
                    <p className="text-center text-lg mb-8">
                        {t('about.description')}
                    </p>
                </div>
            </section>
        </div>
    );
}

function FeatureCard({ icon, title, description }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center">
                    {icon}
                    <span className="ml-4">{title}</span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p>{description}</p>
            </CardContent>
        </Card>
    );
}