"use client"

import * as React from "react"

import { cn } from "./lib/utils"
import { useIsMobile } from "./hooks/use-mobile"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./sheet"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "./drawer"

/**
 * A side panel that becomes a bottom drawer on a phone, the way Credenza turns
 * a dialog into one. A panel wide enough for a table has no side to slide in
 * from on a 375px screen; a drawer gives it the screen's full width and a
 * swipe to dismiss.
 */

interface RootProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface PartProps {
  children?: React.ReactNode
  className?: string
}

const ResponsiveSheetContext = React.createContext<{ isMobile: boolean }>({ isMobile: false })

const useResponsiveSheet = () => React.useContext(ResponsiveSheetContext)

const ResponsiveSheet = ({ children, ...props }: RootProps) => {
  const isMobile = useIsMobile()
  const Component = isMobile ? Drawer : Sheet
  return (
    <ResponsiveSheetContext.Provider value={{ isMobile }}>
      <Component {...props} {...(isMobile && { autoFocus: true })}>{children}</Component>
    </ResponsiveSheetContext.Provider>
  )
}

/**
 * `className` styles the desktop sheet (its width, for one); the drawer takes
 * `drawerClassName`. The drawer's content is a column capped at the screen's
 * height, so a scrolling body inside it gets a height to scroll within.
 */
const ResponsiveSheetContent = ({
  className,
  drawerClassName,
  children,
}: PartProps & { drawerClassName?: string }) => {
  const { isMobile } = useResponsiveSheet()
  if (isMobile) {
    return (
      <DrawerContent className={cn("flex max-h-[92dvh] flex-col", drawerClassName)}>
        {children}
      </DrawerContent>
    )
  }
  return (
    <SheetContent side="right" className={cn("flex w-full flex-col", className)}>
      {children}
    </SheetContent>
  )
}

const ResponsiveSheetHeader = ({ className, children }: PartProps) => {
  const { isMobile } = useResponsiveSheet()
  const Component = isMobile ? DrawerHeader : SheetHeader
  return <Component className={cn(isMobile && "text-left", className)}>{children}</Component>
}

const ResponsiveSheetTitle = ({ className, children }: PartProps) => {
  const { isMobile } = useResponsiveSheet()
  const Component = isMobile ? DrawerTitle : SheetTitle
  return <Component className={className}>{children}</Component>
}

const ResponsiveSheetDescription = ({ className, children }: PartProps) => {
  const { isMobile } = useResponsiveSheet()
  const Component = isMobile ? DrawerDescription : SheetDescription
  return <Component className={className}>{children}</Component>
}

/** The scrolling middle of the panel, between the header and the footer. */
const ResponsiveSheetBody = ({ className, children }: PartProps) => {
  const { isMobile } = useResponsiveSheet()
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto", isMobile && "px-4", className)}>
      {children}
    </div>
  )
}

const ResponsiveSheetFooter = ({ className, children }: PartProps) => {
  const { isMobile } = useResponsiveSheet()
  const Component = isMobile ? DrawerFooter : SheetFooter
  return <Component className={className}>{children}</Component>
}

export {
  ResponsiveSheet,
  ResponsiveSheetBody,
  ResponsiveSheetContent,
  ResponsiveSheetDescription,
  ResponsiveSheetFooter,
  ResponsiveSheetHeader,
  ResponsiveSheetTitle,
}
