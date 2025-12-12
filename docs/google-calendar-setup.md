# Google Calendar OAuth 2.0 Setup

This guide walks you through setting up OAuth 2.0 authentication for calendar integration with OpenCouncil using a Google account that has access to the calendar you want to use.

**Why OAuth 2.0 instead of Service Account Keys?**
- More secure: OAuth tokens can be revoked without deleting credentials
- Better for non-Google Cloud environments
- Aligns with Google's security best practices
- No need to share calendars with service accounts

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top
3. Click "New Project"
4. Name it "OpenCouncil" (or similar)
5. Click "Create"

## Step 2: Enable Google Calendar API

1. In the Google Cloud Console, use the search bar and type "Google Calendar API"
2. Click on "Google Calendar API" from the results
3. Click "Enable"

## Step 3: Create OAuth 2.0 Credentials

1. In Google Cloud Console, go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen first:
   - Choose "Internal" (if you have Google Workspace) or "External"
   - Fill in the required fields:
     - **App name**: OpenCouncil Calendar Integration
     - **User support email**: Your email address
     - **Developer contact**: Your email address
   - Click "Save and Continue" through the scopes (you can skip adding scopes here)
   - Add test users if using "External" (add the email address of the account that owns the calendar)
   - Click "Save and Continue" to finish
4. Back in Credentials, click "Create Credentials" → "OAuth client ID"
5. Choose **"Web application"** as the application type
6. Fill in:
   - **Name**: `opencouncil-calendar-oauth`
   - **Authorized redirect URIs**: 
     - `https://developers.google.com/oauthplayground`
     - **Note**: This is required when using OAuth Playground to get your refresh token
7. Click "Create"
8. **Save the credentials** - you'll see:
   - **Client ID**: Copy this
   - **Client secret**: Copy this (you won't see it again!)

## Step 4: Get OAuth Refresh Token

**Important**: You MUST sign in with the Google account that owns the calendar you want to access when authorizing the app.

You need to get a refresh token that allows your app to access the calendar on behalf of that account.

### Using Google OAuth 2.0 Playground (Easiest)

1. Go to [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your **Client ID** and **Client secret** from Step 3
5. In the left panel, find "Google Calendar API v3"
6. Check the scope: `https://www.googleapis.com/auth/calendar`
7. Click "Authorize APIs"
8. **Sign in with the Google account that owns the calendar** (this is critical!)
9. Click "Allow" to grant permissions
10. Click "Exchange authorization code for tokens"
11. Copy the **Refresh token** - this is what you'll use in your app

## Step 5: Get the Calendar ID

1. Open Google Calendar in your browser (using the account that owns the calendar)
2. Find the calendar you want to use for meetings
3. Click the three dots next to the calendar name
4. Select "Settings and sharing"
5. Scroll down to "Integrate calendar"
6. Copy the **"Calendar ID"**
7. It will look like your email address or a unique ID

## Step 6: Add to Your Environment Variables

Add these to your `.env` file:

```bash
# Google Calendar Integration (OAuth 2.0)
GOOGLE_CALENDAR_CLIENT_ID=your-client-id-here
GOOGLE_CALENDAR_CLIENT_SECRET=your-client-secret-here
GOOGLE_CALENDAR_REFRESH_TOKEN=your-refresh-token-here
GOOGLE_CALENDAR_ID=your-calendar-id-here
GOOGLE_CALENDAR_ENABLED=true
```

## Security Notes

- **Never commit OAuth credentials to git**
- Add `.env` to your `.gitignore` (should already be there)
- The refresh token allows long-term access - keep it secure
- You can revoke access at any time in [Google Account Security](https://myaccount.google.com/permissions)
- Consider using a secrets manager for production (AWS Secrets Manager, etc.)

## Revoking Access

If you need to revoke access:
1. Go to [Google Account Security](https://myaccount.google.com/permissions)
2. Find "OpenCouncil Calendar Integration" (or your app name)
3. Click "Remove Access"
4. Generate a new refresh token if needed
