import Link from 'next/link'
import { cn } from "@/lib/utils"
import Logo from './Logo'

const Header = () => {
    return (
        <header className="w-full bg-background border-b">
            <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                <Logo />
                <nav>
                    <ul className="flex space-x-4">
                        <li>
                            <Link href="/" className={cn("text-foreground hover:text-primary transition-colors")}>
                                Cities
                            </Link>
                        </li>
                        <li>
                            <Link href="/about" className={cn("text-foreground hover:text-primary transition-colors")}>
                                About
                            </Link>
                        </li>
                        <li>
                            <Link href="/contact" className={cn("text-foreground hover:text-primary transition-colors")}>
                                Contact
                            </Link>
                        </li>
                    </ul>
                </nav>
            </div>
        </header>
    )
}

export default Header
