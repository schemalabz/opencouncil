'use client'

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Settings, Eye, EyeOff } from "lucide-react"
import { useQuickLoginVisibility } from "@/hooks/useQuickLoginVisibility"
import { IS_DEV } from "@/lib/utils"

export function DevelopmentSection() {
  const { isVisible, isLoaded, toggle } = useQuickLoginVisibility()

  // Only show in development
  if (!IS_DEV) {
    return null
  }

  // Don't render until loaded to prevent hydration mismatch
  if (!isLoaded) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-red-600" />
          Development Tools
          <Badge variant="secondary" className="bg-red-100 text-red-800 text-xs">
            DEV ONLY
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="quick-login-toggle" className="flex items-center gap-2">
              {isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              Show Quick Login Tool
            </Label>
            <p className="text-sm text-muted-foreground">
              Toggle the floating Quick Login button for testing different user permissions
            </p>
          </div>
          <Switch
            id="quick-login-toggle"
            checked={isVisible}
            onCheckedChange={toggle}
          />
        </div>
      </CardContent>
    </Card>
  )
} 