"use client"
import { LayoutDashboard, FileText, Share2, BarChart2, Mic, ChevronDown, ChevronRight } from "lucide-react"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarTrigger,
} from "@/components/ui/sidebar"
import { useCouncilMeetingData } from "./CouncilMeetingDataContext"
import { useState } from "react"

export default function MeetingSidebar() {
    const { city, meeting, subjects } = useCouncilMeetingData()
    const [subjectsExpanded, setSubjectsExpanded] = useState(true)

    const mainMenuItems = [
        {
            title: "Σύνοψη",
            icon: LayoutDashboard,
            url: `/${city.id}/${meeting.id}`
        },
        {
            title: "Απομαγνητοφώνηση",
            icon: Mic,
            url: `/${city.id}/${meeting.id}/transcript`
        },
        {
            title: "Κοινοποίηση",
            icon: Share2,
            url: `/${city.id}/${meeting.id}/share`
        },
        {
            title: "Στατιστικά",
            icon: BarChart2,
            url: `/${city.id}/${meeting.id}/statistics`
        }
    ]

    return (
        <Sidebar collapsible="icon" className="h-full">
            <SidebarHeader className="p-4">
                <h2 className="text-lg font-semibold">Συνεδρίαση</h2>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {mainMenuItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild>
                                        <a href={item.url}>
                                            <item.icon className="h-4 w-4" />
                                            <span>{item.title}</span>
                                        </a>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}

                            <SidebarMenuItem>
                                <SidebarMenuButton onClick={() => setSubjectsExpanded(!subjectsExpanded)}>
                                    <FileText className="h-4 w-4" />
                                    <span>Θέματα</span>
                                    {subjectsExpanded ?
                                        <ChevronDown className="h-4 w-4 ml-auto" /> :
                                        <ChevronRight className="h-4 w-4 ml-auto" />
                                    }
                                </SidebarMenuButton>
                            </SidebarMenuItem>

                            {subjectsExpanded && subjects?.map((subject) => (
                                <SidebarMenuItem key={subject.id} className="pl-8">
                                    <SidebarMenuButton asChild>
                                        <a href={`/${city.id}/${meeting.id}/subjects/${subject.id}`}>
                                            <span className="text-sm">{subject.name}</span>
                                        </a>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="p-4">
                <p className="text-xs text-muted-foreground">{meeting.dateTime.toLocaleDateString()}</p>
            </SidebarFooter>
        </Sidebar>
    )
}
