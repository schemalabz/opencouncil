"use client";
import { Link } from '@/i18n/routing';
import { cn } from "@/lib/utils"
import Logo from './Logo'
import { useTranslations } from 'next-intl';

const Footer = () => {
    const t = useTranslations('Footer');
    return (
        <footer className="w-full bg-background border-t">
            <div className="container mx-auto px-4 py-6">
                <div className="flex flex-col md:flex-row justify-between items-center">
                    <div className="mb-4 md:mb-0">
                        <Logo />
                    </div>
                    <div className="text-sm text-muted-foreground">
                        {t("disclaimer")}
                    </div>
                    <a href="https://twitter.com/christosporios" className={"text-muted-foreground text-xs hover:text-primary transition-colors"}>
                        @christosporios
                    </a>

                </div>
            </div>
        </footer>
    )
}

export default Footer
