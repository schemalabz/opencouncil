"use client"
import React from 'react'
import { motion } from 'framer-motion'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { Link } from '@/i18n/routing'
import Image from 'next/image'
import { useCouncilMeetingData } from './CouncilMeetingDataContext'
import { SidebarTrigger } from '../ui/sidebar'
import { formatDate } from '@/lib/utils'
import UserDropdown from '../layout/user-dropdown'
export default function Header() {
    const { city, meeting } = useCouncilMeetingData();
    return (
        <motion.header
            className={`sticky top-0 z-10 bg-background border-b p-4 flex justify-between items-center`}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
        >
            <div className='flex items-center'>
                <SidebarTrigger />
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
                                <BreadcrumbPage>{formatDate(meeting.dateTime)}</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>

                    <h1 className="">
                        {meeting.name}
                    </h1>
                </div>
            </div>

            <div>
                <UserDropdown currentEntity={{ cityId: city.id }} />
            </div>
        </motion.header>
    )
}