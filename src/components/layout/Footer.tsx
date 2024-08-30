import Link from 'next/link'
import { cn } from "@/lib/utils"
import Logo from './Logo'

const Footer = () => {
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
                                    Privacy Policy
                                </Link>
                            </li>
                            <li>
                                <Link href="/terms" className={cn("text-foreground hover:text-primary transition-colors")}>
                                    Terms of Service
                                </Link>
                            </li>
                            <li>
                                <Link href="/contact" className={cn("text-foreground hover:text-primary transition-colors")}>
                                    Contact Us
                                </Link>
                            </li>
                        </ul>
                    </nav>
                    <div className="text-sm text-muted-foreground">
                        © {new Date().getFullYear()} Townhalls. All rights reserved.
                    </div>
                </div>
            </div>
        </footer>
    )
}

export default Footer
