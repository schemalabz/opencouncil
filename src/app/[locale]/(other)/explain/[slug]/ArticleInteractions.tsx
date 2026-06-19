"use client";

import { useEffect, useRef } from "react";

/**
 * Client-only article enhancements:
 *  - a top reading-progress bar driven by scroll position
 *  - table-of-contents scroll-spy that marks the section in view via
 *    aria-current (styled with a Tailwind data/aria variant on the links)
 * Both query the server-rendered article DOM, so all content stays indexable.
 */
export function ArticleInteractions() {
    const bar = useRef<HTMLElement>(null);

    useEffect(() => {
        const article = document.querySelector<HTMLElement>("[data-article]");

        const onScroll = () => {
            if (!article || !bar.current) return;
            const r = article.getBoundingClientRect();
            const total = r.height - window.innerHeight;
            const done = Math.min(1, Math.max(0, -r.top / Math.max(1, total)));
            bar.current.style.transform = `scaleX(${done})`;
        };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });

        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-toc] a"));
        const map = new Map<Element, HTMLAnchorElement>();
        links.forEach((a) => {
            const id = a.getAttribute("href")?.slice(1);
            if (!id) return;
            const sec = document.getElementById(id);
            if (sec) map.set(sec, a);
        });
        const spy = new IntersectionObserver(
            (entries) => {
                entries.forEach((en) => {
                    if (en.isIntersecting) {
                        links.forEach((l) => l.removeAttribute("aria-current"));
                        map.get(en.target)?.setAttribute("aria-current", "true");
                    }
                });
            },
            { rootMargin: "-90px 0px -65% 0px", threshold: 0 },
        );
        map.forEach((_, sec) => spy.observe(sec));

        return () => {
            window.removeEventListener("scroll", onScroll);
            spy.disconnect();
        };
    }, []);

    return (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5" aria-hidden="true">
            <i ref={bar} className="block h-full origin-left scale-x-0 bg-orange" />
        </div>
    );
}
