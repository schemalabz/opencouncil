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
                    <nav className="mb-4 md:mb-0">
                        <ul className="flex space-x-4">
                            <li>
                                <Link href="/privacy" className={cn("text-foreground hover:text-primary transition-colors")}>
                                    {t('privacy')}
                                </Link>
                            </li>
                            <li>
                                <Link href="/terms" className={cn("text-foreground hover:text-primary transition-colors")}>
                                    {t('terms')}
                                </Link>
                            </li>
                            <li>
                                <Link href="/contact" className={cn("text-foreground hover:text-primary transition-colors")}>
                                    {t('contact')}
                                </Link>
                            </li>
                        </ul>
                    </nav>
                    <div className="text-sm text-muted-foreground">
                        © {new Date().getFullYear()} {t('copyright')}.
                    </div>
                </div>
            </div>
        </footer>
    )
}

export default Footer
