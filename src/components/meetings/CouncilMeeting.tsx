"use client"

import { CouncilMeeting, SpeakerTag, TaskStatus, Utterance, Word } from "@prisma/client"
import React, { useState, useEffect } from "react"
import Admin from "./admin/Admin"
import Transcript from "./transcript/Transcript"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Home, Settings, Bell, ClipboardCheck, ClipboardList, Highlighter, Hash, Sparkles, BotMessageSquare } from "lucide-react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
interface MenuItem {
    icon: React.ReactNode;
    label: string;
    children: React.ReactNode;
    onClick?: () => void;
}
interface MenuProps {
    items: MenuItem[];
    isWide: boolean;
    onItemClick: (index: number | null) => void;
}
import { Card } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";

function Menu({ items, isWide, onItemClick }: MenuProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [activeItem, setActiveItem] = useState<number | null>(null);

    const handleItemClick = (index: number) => {
        if (activeItem === index) {
            setActiveItem(null);
            onItemClick(null);
        } else {
            setActiveItem(index);
            onItemClick(index);
        }
        if (!isWide) {
            items[index].onClick?.();
        }
    };
    const renderMenuItems = () => (
        <>
            {items.map((item, index) => (
                <div key={index} className={cn("bg-none", isWide && "w-full")}>
                    {isWide ? (
                        <button
                            onClick={() => handleItemClick(index)}
                            className={cn(
                                buttonVariants({ variant: "ghost" }),
                                "w-full justify-start gap-3 rounded-full bg-none",
                                activeItem === index && "bg-gray-200"
                            )}
                        >
                            <div className="w-8 h-8">{item.icon}</div>
                            {isHovered && <span>{item.label}</span>}
                        </button>
                    ) : (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => handleItemClick(index)}
                                    className={cn(
                                        buttonVariants({ variant: "ghost", size: "icon" }),
                                        "size-16 rounded-full bg-none",
                                        activeItem === index && "bg-gray-200"
                                    )}
                                >
                                    <div className="w-9 h-9">{item.icon}</div>
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                <p>{item.label}</p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            ))}
        </>
    );
    return (
        <TooltipProvider>
            {isWide ? (
                <div className="fixed left-0 top-24 bottom-24 z-50 flex flex-row h-full">
                    {activeItem !== null && (
                        <Card className="w-[300px] bg-white overflow-auto h-full border-r-0 rounded-r-none">
                            <CardHeader>
                                <CardTitle>Title</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[calc(100%-4rem)] overflow-auto">
                                {items[activeItem].children}
                            </CardContent>
                        </Card>
                    )}
                    <div className="flex flex-col justify-center">
                        <div className="border-l-2 border-gray-200 h-full"></div>
                        <Card
                            className={`flex shadow-md flex-col p-2 justify-center ${activeItem !== null ? "border-l-0 rounded-l-none" : ""}`}
                            onMouseEnter={() => setIsHovered(true)}
                            onMouseLeave={() => setIsHovered(false)}
                        >
                            {renderMenuItems()}
                        </Card>
                        <div className="border-l-2 border-gray-200 h-full"></div>
                    </div>
                </div>
            ) : (
                <Drawer>
                    <DrawerContent className="h-screen">
                        <div className="flex flex-col h-full">
                            <div
                                className="fixed z-50 flex left-1/2 -translate-x-1/2 w-auto h-20 p-2"
                                onMouseEnter={() => setIsHovered(true)}
                                onMouseLeave={() => setIsHovered(false)}
                            >
                                {renderMenuItems()}
                            </div>
                            <div className="flex-grow overflow-auto mt-24 h-[calc(100vh-6rem)]">
                                {activeItem !== null && items[activeItem].children}
                            </div>
                        </div>
                    </DrawerContent>
                    <DrawerTrigger asChild>
                        <Card
                            className="fixed z-50 flex shadow-md top-1/2 -translate-y-1/2 left-4 w-auto h-auto p-2"
                            onMouseEnter={() => setIsHovered(true)}
                            onMouseLeave={() => setIsHovered(false)}
                        >
                            {renderMenuItems()}
                        </Card>
                    </DrawerTrigger>
                </Drawer>
            )}
        </TooltipProvider>
    );
}

export default function CouncilMeetingC({ meeting, editable }: {
    meeting: CouncilMeeting & {
        taskStatuses: TaskStatus[],
        utterances: (Utterance & { words: Word[], speakerTag: SpeakerTag })[]
    },
    editable: boolean
}) {
    const [isWide, setIsWide] = useState(false)
    const [activeMenuItem, setActiveMenuItem] = useState<number | null>(null)

    useEffect(() => {
        const handleResize = () => {
            setIsWide(window.innerWidth > window.innerHeight)
        }
        handleResize()
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const menuItems: MenuItem[] = [
        {
            icon: <ClipboardList className="w-full h-full transition-all duration-200 hover:stroke-[2px]" />,
            label: "Summary",
            onClick: () => console.log("Item 1 clicked"),
            children: <h3>Summary</h3>
        },
        {
            icon: <Sparkles className="w-full h-full transition-all duration-200 hover:stroke-[2px]" />,
            label: "Highlights",
            onClick: () => console.log("Item 2 clicked"),
            children: <h3>Highlights</h3>
        },
        {
            icon: <Hash className="bg-none w-full h-full transition-all duration-200 hover:stroke-[2px]" />,
            label: "Topics",
            onClick: () => console.log("Item 3 clicked"),
            children: <h3>Topics</h3>
        },
    ];

    return (
        <div className="relative min-h-screen">
            <div className="flex justify-between items-center sticky top-0 bg-white z-30 p-2">
                <h1 className="text-3xl font-bold text-gray-800">{meeting.name}</h1>
                {editable && <Admin meeting={meeting} />}
            </div>

            <div className={cn(
                "relative pb-20 md:pb-0",
                isWide && "pl-20",
                isWide && activeMenuItem !== null && "pl-[340px]"
            )}>
                <Transcript utterances={meeting.utterances} />
            </div>

            {/* PlaybackControls */}
            <div className={`fixed ${isWide ? 'bottom-0 left-0 right-0 h-16' : 'top-0 bottom-0 left-0 w-16'} flex items-center justify-center z-50`}>
                <div className="bg-black w-8/12 h-full"></div>
            </div>

            <Menu items={menuItems} isWide={isWide} onItemClick={setActiveMenuItem} />
        </div>
    )
}