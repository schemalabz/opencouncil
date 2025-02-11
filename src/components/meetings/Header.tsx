"use client"
import React, { useId } from 'react'
import { motion } from 'framer-motion'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { Link } from '@/i18n/routing'
import { SidebarTrigger } from '../ui/sidebar'
import { formatDate } from '@/lib/utils'
import UserDropdown from '../layout/user-dropdown'
import { useTranscriptOptions } from './options/OptionsContext'
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Eye, Edit } from "lucide-react"
import { useCouncilMeetingData } from './CouncilMeetingDataContext'
import Image from 'next/image'

export default function Header() {
    const { city, meeting } = useCouncilMeetingData();
    const { options, updateOptions } = useTranscriptOptions();
    const id = useId();

    return (
        <motion.header
            className={`sticky top-0 z-50 bg-background border-b p-4 flex justify-between items-center`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <div className="flex items-center gap-4">
                <SidebarTrigger />
                <Link href="/" className="hidden md:block">
                    <Image width={48} height={48} src='/logo.png' alt='logo' />
                </Link>
                <div className="flex flex-col">
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

            <div className="flex items-center gap-4">
                {options.editsAllowed && (
                    <div className="relative inline-grid h-9 grid-cols-[1fr_1fr] items-center text-sm font-medium">
                        <Switch
                            id={id}
                            checked={options.editable}
                            onCheckedChange={(checked) => updateOptions({ editable: checked })}
                            className="peer absolute inset-0 h-[inherit] w-auto data-[state=unchecked]:bg-input/50 [&_span]:z-10 [&_span]:h-full [&_span]:w-1/2 [&_span]:transition-transform [&_span]:duration-300 [&_span]:[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] data-[state=checked]:[&_span]:translate-x-full rtl:data-[state=checked]:[&_span]:-translate-x-full"
                        />
                        <span className="pointer-events-none relative ms-0.5 flex min-w-8 items-center justify-center text-center transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] peer-data-[state=checked]:invisible peer-data-[state=unchecked]:translate-x-full rtl:peer-data-[state=unchecked]:-translate-x-full">
                            <Eye size={16} strokeWidth={2} aria-hidden="true" />
                        </span>
                        <span className="pointer-events-none relative me-0.5 flex min-w-8 items-center justify-center text-center transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] peer-data-[state=unchecked]:invisible peer-data-[state=checked]:-translate-x-full peer-data-[state=checked]:text-background rtl:peer-data-[state=checked]:translate-x-full">
                            <Edit size={16} strokeWidth={2} aria-hidden="true" />
                        </span>
                        <Label htmlFor={id} className="sr-only">
                            Toggle edit mode
                        </Label>
                    </div>
                )}
                <UserDropdown currentEntity={{ cityId: city.id }} />
            </div>
        </motion.header>
    )
}