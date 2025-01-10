"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"


export function WordRotator({ words }: { words: string[] }) {
    const [currentIndex, setCurrentIndex] = useState(0)

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % words.length)
        }, 2000)
        return () => clearInterval(timer)
    }, [])

    return (
        <div className="h-[60px] overflow-hidden">
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentIndex}
                    initial={{ y: 60, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -60, opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className={`font-medium text-primary`}
                >
                    {words[currentIndex]}
                </motion.div>
            </AnimatePresence>
        </div>
    )
}

