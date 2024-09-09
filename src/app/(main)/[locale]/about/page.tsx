import { notFound } from "next/navigation"
import About from "@/components/static/About"

export default function AboutPage() {
    if (process.env.NEXT_PUBLIC_SHOW_MARKETING === 'true') {
        return <About />
    }

    return notFound();
}