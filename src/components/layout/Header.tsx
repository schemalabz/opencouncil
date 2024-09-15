"use client"
import { cn } from "@/lib/utils"
import Logo from './Logo'
import { Link } from '@/i18n/routing';
import { usePathname } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import Image from 'next/image';


const SHOW_LOCALE_PICKER = false;
const Header = () => {
    const t = useTranslations('Header');
    const pathname = usePathname();
    const locale = useLocale();

    const otherLocale = locale === 'en' ? 'el' : 'en';
    const flag = otherLocale === 'en' ? '🇬🇧' : '🇬🇷';

    return (
        <header className="w-full bg-background border-b">
            <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                <Logo />
                <nav>
                    <ul className="flex space-x-4 items-center">
                        {SHOW_LOCALE_PICKER && (
                            <li>
                                <Link href={pathname} locale={otherLocale} className="flex items-center">
                                    <span className="mr-1">{flag}</span>
                                    {otherLocale.toUpperCase()}
                                </Link>
                            </li>
                        )}
                    </ul>
                </nav>
            </div>
        </header>
    )
}

export default Header
