'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'quickLoginVisible'

export function useQuickLoginVisibility() {
  const [isVisible, setIsVisible] = useState(true) // Default to visible
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored !== null) {
        setIsVisible(stored === 'true')
      }
      setIsLoaded(true)

      // Listen for storage changes from other tabs/components
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY && e.newValue !== null) {
          setIsVisible(e.newValue === 'true')
        }
      }

      // Listen for custom events from same tab (since storage events don't fire on same tab)
      const handleCustomStorageChange = (e: CustomEvent) => {
        if (e.detail.key === STORAGE_KEY) {
          setIsVisible(e.detail.value === 'true')
        }
      }

      window.addEventListener('storage', handleStorageChange)
      window.addEventListener('quickLoginVisibilityChange', handleCustomStorageChange as EventListener)

      return () => {
        window.removeEventListener('storage', handleStorageChange)
        window.removeEventListener('quickLoginVisibilityChange', handleCustomStorageChange as EventListener)
      }
    }
  }, [])

  const setVisibility = (visible: boolean) => {
    setIsVisible(visible)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, visible.toString())
      
      // Dispatch custom event for same-tab reactivity
      window.dispatchEvent(new CustomEvent('quickLoginVisibilityChange', {
        detail: { key: STORAGE_KEY, value: visible.toString() }
      }))
    }
  }

  const hide = () => setVisibility(false)
  const show = () => setVisibility(true)
  const toggle = () => setVisibility(!isVisible)

  return {
    isVisible,
    isLoaded, // Use this to prevent hydration mismatches
    hide,
    show,
    toggle,
    setVisibility
  }
} 