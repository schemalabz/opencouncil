"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Loader2, Info, CheckCircle, XCircle, Bell, FileText, Mail, Calendar } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface SeedUsersDialogProps {
    onUsersCreated: () => void
}

const PERSONAS = [
    {
        id: "engaged-citizen",
        name: "Engaged Citizen",
        icon: "🌟",
        theme: "border-green-200 bg-green-50 hover:bg-green-100",
        selectedTheme: "border-green-500 bg-green-100",
        badgeTheme: "bg-green-100 text-green-800",
        description: "Active community member who stays informed",
        detailedDescription: "Users who have completed onboarding and actively subscribe to notifications for cities that support the notification system. They represent engaged residents who want to stay informed about local government activities.",
        dataPattern: {
            onboarded: true,
            notifications: true,
            petitions: false,
            allowContact: true
        },
        expectedData: "Notification preferences for 1 city with 3-6 topics",
        defaultQuantity: 15,
        testingUse: "Perfect for testing notification flows and user engagement features"
    },
    {
        id: "activist",
        name: "Activist",
        icon: "🔥",
        theme: "border-blue-200 bg-blue-50 hover:bg-blue-100",
        selectedTheme: "border-blue-500 bg-blue-100",
        badgeTheme: "bg-blue-100 text-blue-800",
        description: "Advocates pushing for change in unsupported areas",
        detailedDescription: "Users who have completed onboarding and submit petitions for cities that don't yet support notifications. They represent motivated citizens working to bring OpenCouncil to their communities.",
        dataPattern: {
            onboarded: true,
            notifications: false,
            petitions: true,
            allowContact: true
        },
        expectedData: "Petition submission for 1 city, resident/citizen status varies",
        defaultQuantity: 8,
        testingUse: "Ideal for testing petition flows and community expansion features"
    },
    {
        id: "newcomer",
        name: "Newcomer",
        icon: "🌱",
        theme: "border-yellow-200 bg-yellow-50 hover:bg-yellow-100",
        selectedTheme: "border-yellow-500 bg-yellow-100",
        badgeTheme: "bg-yellow-100 text-yellow-800",
        description: "New users who haven't completed setup",
        detailedDescription: "Users who have created accounts but haven't completed the onboarding process. They represent the initial signup state before users engage with the platform's features.",
        dataPattern: {
            onboarded: false,
            notifications: false,
            petitions: false,
            allowContact: false
        },
        expectedData: "Only basic account information, recent registration dates",
        defaultQuantity: 12,
        testingUse: "Essential for testing onboarding flows and first-time user experience"
    },
    {
        id: "lurker",
        name: "Lurker",
        icon: "👁️",
        theme: "border-gray-200 bg-gray-50 hover:bg-gray-100",
        selectedTheme: "border-gray-500 bg-gray-100",
        badgeTheme: "bg-gray-100 text-gray-800",
        description: "Passive observers who browse without engaging",
        detailedDescription: "Users who completed onboarding but choose not to set up notifications or submit petitions. They represent users who prefer to browse and observe without active participation.",
        dataPattern: {
            onboarded: true,
            notifications: false,
            petitions: false,
            allowContact: "varies"
        },
        expectedData: "Complete onboarding, no activity data",
        defaultQuantity: 5,
        testingUse: "Useful for testing browse-only user paths and edge cases"
    }
]

export function SeedUsersDialog({ onUsersCreated }: SeedUsersDialogProps) {
    const [open, setOpen] = useState(false)
    const [selectedPersona, setSelectedPersona] = useState("")
    const [expandedPersona, setExpandedPersona] = useState<string | null>(null)
    const [quantity, setQuantity] = useState("15")
    const [dateRange, setDateRange] = useState("30")
    const [loading, setLoading] = useState(false)

    // Update quantity when persona changes
    const handlePersonaSelect = (personaId: string) => {
        setSelectedPersona(personaId)
        const persona = PERSONAS.find(p => p.id === personaId)
        if (persona) {
            setQuantity(persona.defaultQuantity.toString())
        }
    }

    const handlePersonaExpand = (personaId: string) => {
        setExpandedPersona(expandedPersona === personaId ? null : personaId)
    }

    async function handleSubmit() {
        if (!selectedPersona) {
            toast({
                title: "Error",
                description: "Please select a persona",
                variant: "destructive"
            })
            return
        }

        setLoading(true)
        try {
            const response = await fetch("/api/dev/seed-users", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    persona: selectedPersona,
                    quantity: parseInt(quantity),
                    dateRange: parseInt(dateRange)
                })
            })

            if (!response.ok) {
                const errorData = await response.text()
                throw new Error(errorData || "Failed to seed users")
            }

            const result = await response.json()
            
            // Create detailed success message
            let successMessage = `Successfully created ${result.count} ${result.persona.replace('-', ' ')} users`
            
            if (result.details) {
                const details = []
                if (result.details.notificationPreferences > 0) {
                    details.push(`${result.details.notificationPreferences} notification preferences`)
                }
                if (result.details.petitions > 0) {
                    details.push(`${result.details.petitions} petitions`)
                }
                if (details.length > 0) {
                    successMessage += ` with ${details.join(' and ')}`
                }
                successMessage += `\n\nData sources: ${result.details.supportedCities} supported cities, ${result.details.unsupportedCities} unsupported cities, ${result.details.availableTopics} topics`
            }
            
            toast({
                title: "Test Users Created Successfully! 🎉",
                description: successMessage,
                duration: 8000, // Show longer for detailed message
            })

            setOpen(false)
            onUsersCreated()
        } catch (error) {
            console.error("Failed to seed users:", error)
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to create test users",
                variant: "destructive"
            })
        } finally {
            setLoading(false)
        }
    }

    const selectedPersonaData = PERSONAS.find(p => p.id === selectedPersona)

    const renderDataPatternIndicator = (pattern: any) => (
        <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
                {pattern.onboarded ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                ) : (
                    <XCircle className="h-3 w-3 text-red-600" />
                )}
                <span>Onboarded</span>
            </div>
            <div className="flex items-center gap-1">
                {pattern.notifications ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                ) : (
                    <XCircle className="h-3 w-3 text-red-600" />
                )}
                <span>Notifications</span>
            </div>
            <div className="flex items-center gap-1">
                {pattern.petitions ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                ) : (
                    <XCircle className="h-3 w-3 text-red-600" />
                )}
                <span>Petitions</span>
            </div>
            <div className="flex items-center gap-1">
                {pattern.allowContact === true ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                ) : pattern.allowContact === false ? (
                    <XCircle className="h-3 w-3 text-red-600" />
                ) : (
                    <div className="h-3 w-3 rounded-full bg-yellow-400" />
                )}
                <span>Contactable</span>
            </div>
        </div>
    )

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <Users className="mr-2 h-4 w-4" />
                    Seed Users
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create Test Users</DialogTitle>
                    <DialogDescription>
                        Generate test users with different personas for development and testing purposes.
                        Each persona represents a different user behavior pattern.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    {/* Persona Selection */}
                    <div className="space-y-4">
                        <Label className="text-base font-medium">Select User Persona</Label>
                        <div className="grid gap-3">
                            {PERSONAS.map((persona) => {
                                const isSelected = selectedPersona === persona.id
                                const isExpanded = expandedPersona === persona.id
                                
                                return (
                                    <Card 
                                        key={persona.id} 
                                        className={cn(
                                            "cursor-pointer transition-all duration-200",
                                            isSelected ? persona.selectedTheme : persona.theme
                                        )}
                                        onClick={() => handlePersonaSelect(persona.id)}
                                    >
                                        <CardHeader className="pb-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-2xl">{persona.icon}</span>
                                                    <div>
                                                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                                                            {persona.name}
                                                            {isSelected && (
                                                                <CheckCircle className="h-4 w-4 text-green-600" />
                                                            )}
                                                        </CardTitle>
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            {persona.description}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handlePersonaExpand(persona.id)
                                                    }}
                                                >
                                                    <Info className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </CardHeader>
                                        
                                        {!isExpanded && (
                                            <CardContent className="pt-0">
                                                {renderDataPatternIndicator(persona.dataPattern)}
                                            </CardContent>
                                        )}

                                        {isExpanded && (
                                            <CardContent className="pt-0 space-y-4 border-t bg-white/50">
                                                <div className="space-y-2">
                                                    <h4 className="text-sm font-medium">Description</h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        {persona.detailedDescription}
                                                    </p>
                                                </div>
                                                
                                                <div className="space-y-2">
                                                    <h4 className="text-sm font-medium">Data Pattern</h4>
                                                    {renderDataPatternIndicator(persona.dataPattern)}
                                                </div>
                                                
                                                <div className="space-y-2">
                                                    <h4 className="text-sm font-medium">Expected Data</h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        {persona.expectedData}
                                                    </p>
                                        </div>
                                                
                                                <div className="space-y-2">
                                                    <h4 className="text-sm font-medium">Testing Use</h4>
                            <p className="text-sm text-muted-foreground">
                                                        {persona.testingUse}
                            </p>
                                                </div>
                                            </CardContent>
                        )}
                                    </Card>
                                )
                            })}
                        </div>
                    </div>

                    {/* Generation Options */}
                    {selectedPersona && (
                        <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">{selectedPersonaData?.icon}</span>
                                <Label className="text-base font-medium">
                                    {selectedPersonaData?.name} Options
                                </Label>
                            </div>
                            
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                        <Label htmlFor="quantity">Number of Users</Label>
                        <Input
                            id="quantity"
                            type="number"
                            min="1"
                            max="50"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                        />
                                    <p className="text-xs text-muted-foreground">
                                        Recommended: {selectedPersonaData?.defaultQuantity} • Maximum: 50
                        </p>
                    </div>

                                <div className="space-y-2">
                                    <Label htmlFor="dateRange">Registration Date Range</Label>
                        <Select value={dateRange} onValueChange={setDateRange}>
                            <SelectTrigger>
                                            <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="7">Last 7 days</SelectItem>
                                <SelectItem value="30">Last 30 days</SelectItem>
                                <SelectItem value="90">Last 90 days</SelectItem>
                                <SelectItem value="365">Last year</SelectItem>
                            </SelectContent>
                        </Select>
                                    <p className="text-xs text-muted-foreground">
                                        Users will have random registration dates within this range
                        </p>
                    </div>
                            </div>

                            {/* Preview Summary */}
                            <div className="mt-4 p-3 bg-white/50 border rounded-lg">
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <Info className="h-4 w-4" />
                                    Generation Preview
                                </h4>
                                <div className="text-sm space-y-1">
                                    <p>
                                        <strong>Will create:</strong> {quantity} {selectedPersonaData?.name.toLowerCase()} users
                                    </p>
                                    {selectedPersona === 'engaged-citizen' && (
                                        <p className="text-green-700">
                                            <Bell className="h-3 w-3 inline mr-1" />
                                            Each user will have 2-4 notification preferences with 3-6 topics each
                                        </p>
                                    )}
                                    {selectedPersona === 'activist' && (
                                        <p className="text-blue-700">
                                            <FileText className="h-3 w-3 inline mr-1" />
                                            Each user will submit 1-3 petitions for unsupported cities
                                        </p>
                                    )}
                                    {selectedPersona === 'newcomer' && (
                                        <p className="text-yellow-700">
                                            <Calendar className="h-3 w-3 inline mr-1" />
                                            Users will be unboarded with recent registration dates
                                        </p>
                                    )}
                                    {selectedPersona === 'lurker' && (
                                        <p className="text-gray-700">
                                            <Users className="h-3 w-3 inline mr-1" />
                                            Users will be onboarded but with no activity data
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setOpen(false)}
                        disabled={loading}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={loading || !selectedPersona}
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Generate {selectedPersona ? selectedPersonaData?.name + ' ' : ''}Users
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
} 