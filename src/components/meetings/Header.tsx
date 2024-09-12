"use client"
import React from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Menu, Sparkle, Sparkles } from 'lucide-react'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { Link } from '@/i18n/routing'
import Image from 'next/image'
import Navbar from './Navbar'
import { City, CouncilMeeting } from '@prisma/client'
import AnimatedGradientText from '../magicui/animated-gradient-text'

export default function Header({ city, meeting, isWide, activeSection, setActiveSection, sections, switchToHighlights, showHiglightButton = true }: { city: City, meeting: CouncilMeeting, isWide: boolean, activeSection: string | null, setActiveSection: (section: string | null) => void, sections: { title: string, icon: React.ReactNode, content: React.ReactNode }[], switchToHighlights: () => void, showHiglightButton?: boolean }) {
    return (
        <motion.header
            className={`sticky top-0 z-10 bg-background border-b p-4 flex justify-between items-center`}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
        >
            <div className='flex items-center'>
                <Link href="/" className="hidden md:block">
                    <Image width={48} height={48} src='/logo.png' alt='logo' />
                </Link>

                <div className='flex-col justify-between'>
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbLink asChild>
                                    <Link href={`/${meeting.cityId}`}>{city.name}</Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbPage>{meeting.dateTime.toLocaleDateString()}</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>

                    <h1 className="">
                        {meeting.name}
                    </h1>
                </div>
            </div>

            <div className='flex-1 flex items-center justify-start ml-2'>
                {showHiglightButton && (
                    <div onClick={() => switchToHighlights()} className='cursor-pointer'>
                        <AnimatedGradientText>
                            <Sparkles className='inline-block md:mr-2' />
                            <span className='hidden md:inline'>Highlights</span>
                        </AnimatedGradientText>
                    </div>
                )}
            </div>

            <div className="flex-1">
                {isWide ? (
                    <Navbar sections={sections} showClose={true} setActiveSection={setActiveSection} activeSection={activeSection} />
                ) : (
                    <motion.div
                        className="flex justify-end"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        <Button variant="ghost" size="icon" onClick={() => setActiveSection('Τοποθετήσεις')}>
                            <Menu className="h-6 w-6" />
                        </Button>
                    </motion.div>
                )}
            </div>
        </motion.header >
    )
}