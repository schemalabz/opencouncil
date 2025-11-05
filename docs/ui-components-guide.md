# UI Components Guide

**Always use established UI primitives from `src/components/ui/` before creating custom solutions.**

## Available Primitives

### Layout
- **Card**: `@/components/ui/card` - Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter
  - Examples: `src/app/[locale]/(other)/admin/users/page.tsx`, `src/app/[locale]/(other)/admin/qr/page.tsx`

### Data Display
- **Table**: `@/components/ui/table` - Table, TableBody, TableCell, TableHead, TableHeader, TableRow
  - Examples: `src/app/[locale]/(other)/admin/users/page.tsx`, `src/app/[locale]/(other)/admin/qr/page.tsx`

### Forms
- **Button**: `@/components/ui/button` - Variants: default, destructive, outline, secondary, ghost, link
- **Input**: `@/components/ui/input`
- **Label**: `@/components/ui/label`
- **Select**: `@/components/ui/select` - Select, SelectContent, SelectItem, SelectTrigger, SelectValue
- **Textarea**: `@/components/ui/textarea`
- **Checkbox**: `@/components/ui/checkbox`

### Feedback
- **Dialog**: `@/components/ui/dialog` - Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
  - Examples: `src/app/[locale]/(other)/admin/users/page.tsx` (delete confirmation)
- **Toast**: `@/hooks/use-toast` - For notifications
  - Examples: `src/app/[locale]/(other)/admin/users/page.tsx`

### Navigation
- **Sidebar**: `@/components/ui/sidebar` - Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton
  - Example: `src/components/admin/sidebar.tsx`

## Reference Pages

Check these pages for implementation patterns:
- `src/app/[locale]/(other)/admin/users/page.tsx` - Complex table with dialogs
- `src/app/[locale]/(other)/admin/qr/page.tsx` - Simple CRUD table
- `src/app/[locale]/(other)/admin/meetings/page.tsx` - Filtered data display
- `src/components/admin/sidebar.tsx` - Navigation patterns
