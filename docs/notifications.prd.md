# Notification System PRD

## Overview

OpenCouncil's notification system sends automated updates to users about council meeting subjects relevant to their location and topic preferences. Notifications are sent before meetings (agenda preview) and after meetings (meeting summary).

## System Architecture

### Data Models
- **Notification**: Core notification record linking user, meeting, and type
  - Relations:
    - user: User (cascade delete)
    - city: City (cascade delete)  
    - meeting: CouncilMeeting (cascade delete)
    - deliveries: NotificationDelivery[]
    - subjects: NotificationSubject[]
  - Fields:
    - type: NotificationType (beforeMeeting/afterMeeting)
- **NotificationSubject**: Links notifications to relevant subjects (unique for (notification, subject)).
  - Relations:
    - notification: Notification (cascade delete)
    - subject: Subject (cascade delete)
  - Fields:
    - reason: NotificationSubjectReason (proximity/topic/generalInterest)
- **NotificationDelivery**: Represents an upcoming or past notification delivery.
  - Medium: email/message (messages could be WA, could be SMS -- we treat these as the same medium)
  - Fields: title, body, email, phone
  - Message type (if sent): whatsapp/sms
- **AdministrativeBody**: Now includes `notificationBehavior` field controlling notification flow
  - `NOTIFICATIONS_DISABLED`: No notifications created for this administrative body
  - `NOTIFICATIONS_AUTO`: Notifications auto-sent immediately after creation
  - `NOTIFICATIONS_APPROVAL`: Notifications created but require admin approval to be released

### Notification Creation Triggers

1. **Before Meeting Notifications**
   - Created when `processAgenda` task completes successfully
   - **Behavior depends on administrative body's `notificationBehavior` setting**
   
2. **After Meeting Notifications**
   - Created when `summarize` task completes successfully
   - **Behavior depends on administrative body's `notificationBehavior` setting**
3. **Manual Creation**
   - Admins can manually create notifications from meeting admin page:
     - first, by selecting a NotificationType (before/after meeting)
     - then, by choosing the following for each subject: (1) whether they are doNotNotify, normal or high importance (2) whether their proximity importance is none, near or wide
     - by setting a switch to either create pending or send immediately (by default "create pending"). 
   - Button in meeting admin UI to "Create Notifications" with type selector

### Creating notifications: matching subjects to users' notification preferences

The process of creating notifications revolves around a meeting -- which has multiple subjects, and belongs to an admin body and a city. Through the city, the notification is linked to all users which have set a NotificationPreference (i.e. enabled notifications) for that particular city.

Each Subject has:
- A summary and title
- A Topic (from the Topic model)
- An optional Location (from the Location model)

When creating notifications (automatically or manually), each subject requires two additional properties that determine notification targeting:

- topicImportance:
  - doNotNotify: no topic-based notifications
  - normal: notify users interested in the subject's topic
  - high: notify all users with notification preferences

- proximityImportance:
  - none: no location-based notifications
  - near: notify users with locations within 250m of subject location
  - wide: notify users with locations within 1000m of subject location

A User U will receive a notification for Subject S if any of these conditions are met:

1. S.topicImportance is high
2. S.topicImportance is normal AND S.topic exists in U.notificationPreference.interests
3. S.proximityImportance is near AND any of U.notificationPreference.locations are within 250m of S.location
4. S.proximityImportance is wide AND any of U.notificationPreference.locations are within 1000m of S.location

Important: if there are no subjects selected through this process, then no notification is created at all.

The notification creation process should produce two statistics to inform of its impact: the number of notifications created (which equals the number of users notified), and the number of NotificationSubjects created (that is, the sum of subjects all users are notified about).

### Notification Deliveries

NotificationDeliveries represent the actual sending of notifications to users through specific channels (email or message). The delivery process consists of two phases: **creation** and **sending**.

**Delivery Lifecycle:**
1. All NotificationDeliveries are initially created with `pending` status
2. Deliveries are later sent either through:
   - Admin approval via the specialized notification approval UI, OR
   - Immediate sending (for notifications marked "send immediately" or when the administrative body uses `NOTIFICATIONS_AUTO`)

#### Creating Notification Deliveries

**Delivery Types Created:**
- **Email delivery**: Always created for every notification
- **Message delivery**: Created additionally if the user has provided a phone number

**Email Notification Content:**
- **Title format**: `OpenCouncil {municipalityName}: {adminBody} - {date}`
- **Body content**: Formatted HTML email containing:
  - Titles, topics, and descriptions of all notification subjects
  - Navigation buttons (top and bottom) linking to the notification view page
- **Future enhancement**: LLM-generated titles incorporating keywords from the most important subjects

**Message Notification Content:**
- **Title**: Not set (unused for messages)
- **Body**: Text content used only for SMS fallback delivery
  - WhatsApp uses pre-approved templates instead of this body content

#### Sending Notification Deliveries

**Email Delivery Process:**
- Sent using Resend service
- Uses the title and body content created during delivery creation

**Message Delivery Process:**
- **Service**: All message delivery (WhatsApp and SMS) is handled through Bird
- **WhatsApp-first approach**: 
  - Attempts WhatsApp delivery using pre-approved templates configured in Bird
  - Falls back to SMS via Bird if WhatsApp fails (e.g., user doesn't have WhatsApp on that number)

**WhatsApp Template System:**
WhatsApp requires pre-approved templates for users who haven't messaged us in the last 24 hours (we always assume this case). We have two template types configured in Bird:

1. **Before Meeting Template** - for `beforeMeeting` notifications  
2. **After Meeting Template** - for `afterMeeting` notifications

**Template Parameters:**
Both templates take exactly the same parameters.
- `date`: Meeting date
- `cityName`: City name (e.g., "Athens")  
- `subjectsSummary`: Comma-separated subject titles
- `adminBody`: Administrative body name
- `notificationId`: Used for redirect button to `opencouncil.gr/notifications/{notificationId}`

**SMS Fallback:**
If WhatsApp delivery fails, the system uses SMS with the body content created during delivery creation.

**Delivery Status Updates:**
- Successful sending updates the delivery `status` field
- For message deliveries, also sets `messageSentVia` (whatsapp/sms) to track the actual delivery method

### Administrative Body Notification Behavior Flow

Each administrative body will now have a property which configures notification behaviour for its meetings: 

1. **NOTIFICATIONS_DISABLED**: Skip notification creation entirely
2. **NOTIFICATIONS_AUTO**: Create notifications and immediately send them
3. **NOTIFICATIONS_APPROVAL**: Create notifications with delivery records in `pending` status. The notifications then require admin approval.

## Implementation Requirements

### 1. Database Schema Implementation

#### Schema Updates Required:
- **AdministrativeBody**: Add `notificationBehavior` enum field
- **Notification Models**: All notification-related models
- **Database Migration**: Create migration for new `notificationBehavior` field with default `NOTIFICATIONS_APPROVAL`

### 2. Core Notification Logic

#### `src/lib/db/notifications.ts` - Core notification creation:
```typescript
export async function createNotificationsForMeeting(
  cityId: string,
  meetingId: string,
  type: NotificationType,
  subjectImportanceOverrides?: Record<string, {topicImportance: string, proximityImportance: string}>
) {
  // 1. Get administrative body notification behavior
  // 2. If NOTIFICATIONS_DISABLED, return early
  // 3. Get all users with NotificationPreferences for this city
  // 4. For each subject, apply importance rules and match to users
  // 5. Create Notification records with NotificationSubjects
  // 6. Create NotificationDeliveries (email + message if phone exists)
  // 7. If NOTIFICATIONS_AUTO, immediately send deliveries
  // 8. Return statistics: {notificationsCreated: number, subjectsTotal: number}
}

export async function calculateProximityMatches(
  userLocations: Location[],
  subjectLocation: Location,
  distanceMeters: number
): Promise<boolean> {
  // Implement PostGIS distance calculation
  // Return true if any user location is within distanceMeters of subject location
}
```

#### `src/lib/notifications/deliver.ts` - Delivery system:
```typescript
export async function releaseNotifications(notificationIds: string[]) {
  // Email delivery via Resend
  // Message delivery via Bird (WhatsApp → SMS fallback)
  // Update delivery status and messageSentVia
}

export async function generateEmailContent(notification: Notification): Promise<{title: string, body: string}> {
  // Generate HTML email with subject cards and navigation buttons
}

export async function generateMessageContent(notification: Notification): Promise<{body: string}> {
  // Generate SMS fallback text
}
```

### 3. Automatic Notification Triggers

#### In `src/lib/tasks/processAgenda.ts`:
```typescript
// After successful subject creation in handleProcessAgendaResult
const stats = await createNotificationsForMeeting(
  task.councilMeeting.cityId,
  task.councilMeeting.id,
  'beforeMeeting'
);
// Log notification creation statistics
```

#### In `src/lib/tasks/summarize.ts`:
```typescript
// After successful summary creation in handleSummarizeResult  
const stats = await createNotificationsForMeeting(
  councilMeeting.cityId,
  councilMeeting.id,
  'afterMeeting'
);
// Log notification creation statistics
```

### 4. Notification View Page

#### `src/app/notifications/[id]/page.tsx` - Public notification view:
**Requirements:**
- **Unauthenticated access**: No login required
- **Mobile-first responsive design**: Optimized for mobile devices
- **Personalized content**: Show user's specific notification subjects

**Components:**
- **Meeting Context Card**: City, administrative body, meeting date/name, meeting type (before/after)
- **Subject Cards**: Each NotificationSubject as a card showing:
  - Subject title and description  
  - Topic badge and location (if applicable)
  - Reason for notification (proximity/topic/generalInterest)
  - Link to full meeting when available
- **Footer Actions**: Unsubscribe link, feedback options

**URL Structure**: `/notifications/{notificationId}`

### 5. Meeting Admin UI Enhancements

#### Update `src/components/meetings/admin/Admin.tsx`:
- **"Create Notifications" Button** with type selector popover
- **Subject Importance Configuration Modal**:
  - List all meeting subjects
  - For each subject: topicImportance dropdown (doNotNotify/normal/high)
  - For each subject: proximityImportance dropdown (none/near/wide)  
  - Preview: "X users will be notified about Y subjects"
  - Toggle: "Create pending" vs "Send immediately"

### 6. Admin Notification Management

#### `/admin/notifications` page structure:
```
├── Administrative Body Settings Panel
│   ├── City Filter Dropdown
│   ├── Administrative Body List
│   │   ├── Body Name [DISABLED|AUTO|APPROVAL] [Edit Button]
│   │   └── Impact Summary ("5 pending notifications")
├── Notification Filters (Status, City, Administrative Body, Date Range)
├── Grouped Notification List
│   ├── City Name Header
│   │   ├── Administrative Body Name [Behavior Badge]
│   │   │   ├── Meeting Name & Date
│   │   │   │   ├── Before Meeting (X notifications) [Release] [Preview] [Edit]
│   │   │   │   └── After Meeting (Y notifications) [Release] [Preview] [Edit]
```

**Bulk Actions:**
- Release All, Release Selected, View Failed Deliveries
- Convert administrative body to NOTIFICATIONS_AUTO

### 7. User Notification Preferences

#### Simple Profile Integration

Add basic notification management to existing `src/app/[locale]/(other)/profile/page.tsx`:

**New Component**: `src/components/profile/NotificationPreferencesSection.tsx`
- **Show Active Cities**: Simple list of cities where user has notification preferences
- **Per-City Actions**:
  - "Edit" button → redirects to existing `/{cityId}/notifications` UI
  - "Unsubscribe" button → deletes `NotificationPreference` record for that city

**Layout**:
```typescript
// Cities with Notifications Enabled:
// 📍 Athens          [Edit Preferences] [Unsubscribe]
// 📍 Thessaloniki    [Edit Preferences] [Unsubscribe]
// 
// [+ Add notifications for another city]
```

#### Leverage Existing Infrastructure

**Reuse Existing UI**: 
- All preference editing happens in existing `/{cityId}/notifications` → `OnboardingPageContent` flow
- Keep existing location map interface and topic selection exactly as-is
- Use existing `saveNotificationPreferences()` and `getUserPreferences()` functions

**Profile Integration**:
- Simple collapsible section alongside existing `UserInfoForm`
- Load data using existing `getUserPreferences()` 
- Unsubscribe action uses existing API patterns

#### Unsubscribe Implementation

**Email Unsubscribe Links**: 
- Generate signed tokens containing `userId` + `cityId`
- Route: `GET /api/notifications/unsubscribe?token={signedToken}`
- Confirmation page with option to re-subscribe

**Profile Unsubscribe**:
- Delete button per city removes `NotificationPreference` record
- Simple confirmation dialog: "Stop receiving notifications from Athens?"

### 8. API Endpoints

#### Core API Routes:
```typescript
// Public endpoints
GET /api/notifications/[id] - Get notification for public view
POST /api/notifications/unsubscribe - Handle unsubscribe requests

// Admin endpoints  
POST /api/cities/[cityId]/meetings/[meetingId]/notifications - Create notifications manually
GET /api/admin/notifications - List all notifications with filters
POST /api/admin/notifications/release - Release pending notifications
GET /api/notifications/[id]/preview - Admin preview notification content

// Administrative body management
GET /api/admin/administrative-bodies - List with notification behavior
PATCH /api/admin/administrative-bodies/[id]/notification-behavior - Update behavior

// User preference management  
GET /api/users/[userId]/notification-preferences - Get user preferences
PATCH /api/users/[userId]/notification-preferences - Update preferences
```

### 9. Email and Message Templates

#### Email Template Components:
```typescript
// src/lib/notifications/templates/email.tsx
export function NotificationEmailTemplate({notification, subjects, unsubscribeUrl}) {
  // HTML email with:
  // - Header with city/administrative body branding
  // - Meeting context section
  // - Subject cards with topics and descriptions  
  // - Footer with unsubscribe and view online links
}
```

#### Bird WhatsApp Template Configuration:
- **Template Names**: `before_meeting_notification`, `after_meeting_notification`
- **Template Parameters**: date, cityName, subjectsSummary, adminBody, notificationId
- **Fallback SMS**: Use generated body text for SMS delivery

### 10. Error Handling & Monitoring

#### Logging Requirements:
- **Notification Creation**: Log statistics and any matching failures
- **Delivery Attempts**: Log all email/SMS attempts with status
- **Delivery Failures**: Structured error logging with retry logic
- **Performance Metrics**: Track notification creation and delivery times

#### Error Recovery:
- **Failed Deliveries**: Retry mechanism with exponential backoff
- **Bulk Processing**: Chunked processing to prevent timeouts
- **Circuit Breaker**: Pause delivery if failure rate exceeds threshold

### 11. Internationalization Support

#### Multi-language Implementation:
- **Email Templates**: Localized based on city's primary language
- **WhatsApp Templates**: Separate templates per language in Bird
- **Notification View Page**: Support Greek and English
- **Admin Interface**: Localized admin labels and messages

### 12. Admin Sidebar Integration

Update `src/components/admin/sidebar.tsx`:
```typescript
{
  title: "Notifications",
  icon: Bell,
  url: "/admin/notifications",
  badge: pendingNotificationsCount // Show pending count
}
```

## Security & Authorization

- Only super admins can access `/admin/notifications`
- City admins can create notifications for their city's meetings
- Delivery content is sanitized before sending

## Future improvements 

- Admin alerts for delivery failures > threshold
- Advanced logging for all notification operations