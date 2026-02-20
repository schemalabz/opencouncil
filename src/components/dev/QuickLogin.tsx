'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { LogOut, Settings, User, Crown, EyeOff } from 'lucide-react'
import { getTestUsersForDisplay } from '@/lib/dev/test-users'
import { useQuickLoginVisibility } from '@/hooks/useQuickLoginVisibility'
import { IS_DEV } from '@/lib/utils'
import MobilePreviewButton from '@/components/dev/MobilePreviewButton'

// Get predefined test users from shared definition
const PREDEFINED_USERS = getTestUsersForDisplay()

export default function QuickLogin() {
  const [isOpen, setIsOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isCreatingUsers, setIsCreatingUsers] = useState(false)
  const [testUsersExist, setTestUsersExist] = useState<boolean | null>(null)
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isVisible, isLoaded, hide } = useQuickLoginVisibility()
  const barRef = useRef<HTMLDivElement>(null)

  // Check if test users exist when dialog opens
  useEffect(() => {
    if (isOpen && testUsersExist === null) {
      checkTestUsers()
    }
  }, [isOpen, testUsersExist])

  const checkTestUsers = async () => {
    try {
      const response = await fetch('/api/dev/seed-test-users')
      const data = await response.json()
      if (response.ok) {
        setTestUsersExist(data.allTestUsersExist)
      }
    } catch (error) {
      console.error('Error checking test users:', error)
    }
  }

  const handleQuickLogin = async (targetEmail: string) => {
    if (!targetEmail.trim()) {
      setMessage('Please enter an email')
      return
    }

    setIsLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/dev/quick-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: targetEmail.trim() }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(`✅ Logging in as ${data.user.email}...`)
        // Close dialog and refresh the page to pick up the new session
        setTimeout(() => {
          setIsOpen(false)
          window.location.reload()
        }, 1000)
      } else {
        setMessage(`❌ ${data.error}`)
      }
    } catch (error) {
      setMessage('❌ Login failed')
      console.error('Quick login error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateTestUsers = async () => {
    setIsCreatingUsers(true)
    setMessage('')

    try {
      const response = await fetch('/api/dev/seed-test-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(`✅ ${data.message}`)
        setTestUsersExist(true) // Update state to hide the create button
      } else {
        setMessage(`❌ ${data.error}`)
      }
    } catch (error) {
      setMessage('❌ Failed to create test users')
      console.error('Create test users error:', error)
    } finally {
      setIsCreatingUsers(false)
    }
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleQuickLogin(email)
  }

  const handlePredefinedLogin = (userEmail: string) => {
    handleQuickLogin(userEmail)
  }

  const handleLogout = async () => {
    setIsLoading(true)
    try {
      await signOut({ redirect: false })
      setMessage('✅ Logged out')
      setTimeout(() => {
        setIsOpen(false)
        window.location.reload()
      }, 1000)
    } catch (error) {
      setMessage('❌ Logout failed')
      console.error('Logout error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleHide = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent opening the dialog
    hide()
    setMessage('') // Clear any messages
  }

  // Only show in development
  if (!IS_DEV) {
    return null
  }

  // Don't render until loaded to prevent hydration mismatch
  if (!isLoaded) {
    return null
  }

  // Don't render if hidden
  if (!isVisible) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <div ref={barRef} className="fixed bottom-4 right-4 z-50">
        <div className="relative flex items-stretch bg-red-600 text-white rounded-md shadow-lg text-sm">
          <MobilePreviewButton barRef={barRef} />
          <div className="w-px bg-red-400/40 my-1.5" />
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-700/50 transition-colors rounded-r-md">
              <span className="text-[10px] font-bold bg-red-800 px-1.5 py-0.5 rounded">DEV</span>
              <span className="text-xs">Quick Login</span>
            </button>
          </DialogTrigger>
          <button
            onClick={handleHide}
            className="absolute -top-2 -right-2 bg-red-800 hover:bg-red-900 text-white shadow-lg h-5 w-5 p-0 rounded-full border-2 border-white flex items-center justify-center"
            title="Hide DEV panel"
          >
            <EyeOff className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
      
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-red-600" />
            Development Quick Login
          </DialogTitle>
          <DialogDescription>
            Quickly switch between different user accounts for testing authorization scenarios. 
            This tool helps you test permissions without manually logging in/out each time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current User Info */}
          {status === 'loading' && (
            <div className="bg-muted p-3 rounded text-sm">
              Loading session...
            </div>
          )}
          
          {status === 'authenticated' && session?.user && (
            <div className="bg-muted p-3 rounded space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Currently logged in as:</div>
                {session.user.isSuperAdmin && (
                  <Badge variant="default" className="bg-yellow-600">
                    <Crown className="h-3 w-3 mr-1" />
                    Super Admin
                  </Badge>
                )}
              </div>
              <div className="font-medium">{session.user.name || 'Unknown'}</div>
              <div className="text-sm text-muted-foreground">{session.user.email}</div>
              <Button
                onClick={handleLogout}
                disabled={isLoading}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <LogOut className="h-4 w-4 mr-2" />
                {isLoading ? 'Logging out...' : 'Logout'}
              </Button>
            </div>
          )}

          {status === 'unauthenticated' && (
            <div className="bg-muted p-3 rounded text-sm text-muted-foreground flex items-center gap-2">
              <User className="h-4 w-4" />
              Not logged in
            </div>
          )}

          {/* Test User Creation */}
          {testUsersExist === false && (
            <div className="space-y-2">
              <Button
                onClick={handleCreateTestUsers}
                disabled={isCreatingUsers || isLoading}
                className="w-full bg-green-600 hover:bg-green-700"
                size="sm"
              >
                {isCreatingUsers ? 'Creating users...' : '🛠️ Create Test Users'}
              </Button>
              <div className="text-xs text-muted-foreground">
                Creates test users with different permission levels
              </div>
            </div>
          )}

          {/* Predefined Users */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Quick Access Users:</Label>
            <div className="space-y-2">
              {PREDEFINED_USERS.map((user, index) => (
                <Button
                  key={index}
                  onClick={() => handlePredefinedLogin(user.email)}
                  disabled={isLoading || isCreatingUsers}
                  variant="outline"
                  className="w-full text-left h-auto p-3"
                >
                  <div className="flex flex-col items-start w-full">
                    <div className="font-medium">{user.label}</div>
                    <div className="text-xs text-muted-foreground">{user.description}</div>
                    <div className="text-xs text-muted-foreground font-mono">{user.email}</div>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Email Input */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Custom Email:</Label>
            <form onSubmit={handleFormSubmit} className="space-y-3">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter any email address..."
                disabled={isLoading || isCreatingUsers}
              />
              
              <Button
                type="submit"
                disabled={isLoading || isCreatingUsers || !email.trim()}
                className="w-full"
                size="sm"
              >
                {isLoading ? 'Logging in...' : 'Login'}
              </Button>
            </form>
          </div>

          {/* Message Display */}
          {message && (
            <div className="text-xs bg-muted p-3 rounded border">
              {message}
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  )
}