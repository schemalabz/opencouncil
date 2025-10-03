"use client"
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import { Button } from '@/components/ui/button'
import { Home, Search, ArrowLeft, Phone, Mail } from 'lucide-react'

export default function NotFound() {
    const t = useTranslations('NotFoundPage')

    return (
        <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-background">
            {/* Content */}
            <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto">
                {/* 404 Number with Gradient */}
                <div className="mb-8">
                    <h1 className="text-8xl sm:text-9xl font-bold bg-gradient-to-r from-[#fc550a] via-[#a4c0e1] to-[#fc550a] bg-clip-text text-transparent animate-gradientFlow">
                        404
                    </h1>
                </div>

                {/* Title */}
                <h2 className="text-2xl sm:text-3xl font-semibold text-foreground mb-4">
                    {t('title')}
                </h2>

                {/* Description */}
                <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                    {t('description')}
                    <br className="hidden sm:block" />
                    {t('suggestion')}
                </p>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                    <Button asChild size="lg" className="min-w-[200px]">
                        <Link href="/">
                            <Home className="w-4 h-4 mr-2" />
                            {t('homeButton')}
                        </Link>
                    </Button>

                    <Button asChild variant="outline" size="lg" className="min-w-[200px]">
                        <Link href="/search">
                            <Search className="w-4 h-4 mr-2" />
                            {t('searchButton')}
                        </Link>
                    </Button>
                </div>

                {/* Go Back Link */}
                <div className="mt-8">
                    <button
                        onClick={() => window.history.back()}
                        className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
                    >
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        {t('goBack')}
                    </button>
                </div>

                {/* Additional Help */}
                <div className="mt-12 p-6 bg-muted/50 rounded-lg border border-border">
                    <h3 className="text-lg font-medium mb-4">{t('helpTitle')}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        {t('helpDescription')}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <a
                            href="tel:+302111980212"
                            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <Phone className="w-4 h-4 mr-2" />
                            +30 2111980212
                        </a>
                        <a
                            href="mailto:hello@opencouncil.gr"
                            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <Mail className="w-4 h-4 mr-2" />
                            hello@opencouncil.gr
                        </a>
                    </div>
                </div>
            </div>
        </div>
    )
} 