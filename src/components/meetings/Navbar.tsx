import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function Navbar({ showClose, sections, setActiveSection, activeSection, className }
    : { showClose: boolean, sections: { title: string, icon: React.ReactNode, content: React.ReactNode }[], setActiveSection: (title: string | null) => void, activeSection: string | null, className?: string }) {
    return (
        <TooltipProvider>
            <nav className={cn(`flex w-full ml-auto justify-end space-x-1`, className)}>
                <div className="flex space-x-1">
                    {sections.map(({ title, icon }) => (
                        <Tooltip key={title} delayDuration={0}>
                            <TooltipTrigger asChild>
                                <motion.div
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <Button
                                        variant="ghost"
                                        onClick={() => setActiveSection(title)}
                                        className={`flex items-center justify-center ${activeSection === title ? 'bg-accent' : ''}`}
                                        aria-label={title}
                                    >
                                        <span className="font-bold">{icon}</span>
                                        <motion.span
                                            className="hidden lg:block pl-2 text-xs"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            {title}
                                        </motion.span>
                                    </Button>
                                </motion.div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{title}</p>
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </div>
                <AnimatePresence>
                    {activeSection && showClose && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2 }}
                        >
                            <Button
                                variant="ghost"
                                onClick={() => setActiveSection(null)}
                                aria-label="Close section"
                            >
                                <X className="" />
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </nav>
        </TooltipProvider>
    )
}