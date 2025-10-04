# Discord Notifications Setup

OpenCouncil sends real-time notifications to Discord for key events:

- 🆕 **New meeting added** - With link to view meeting
- ▶️ **Task started/completed/failed** - With links to admin panel
- ✨ **User onboarded** - Via notification preferences, petition, magic link, or admin invite
- 📝 **New petition** - When submitted for a municipality
- 🔔 **Notification signup** - When users sign up

*No PII (emails, phone numbers, names) is transmitted.*

## Quick Setup

### 1. Create Discord Webhook

1. Open your Discord server → Right-click channel → **Edit Channel**
2. Go to **Integrations** → **Webhooks** → **New Webhook**
3. Name it (e.g., "OpenCouncil Bot")
4. **Copy Webhook URL**

The URL looks like: `https://discord.com/api/webhooks/123.../AbCd...`

### 2. Add to Environment Variables

Add to your `.env` file:

```bash
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN"
```

⚠️ **Keep this URL secret!** Anyone with it can send messages to your channel.

### 3. Test It

Create a meeting or start a task - you should see notifications in Discord

## Notification Examples

All notifications include timestamps, color coding (green/red/blue), and clickable links.

**New Meeting:**
```
🆕 New Meeting Added
Municipality: Athens | Meeting: City Council - January 2025
Date: January 15, 2025 | [View Meeting](https://...)
```

**Task Updates:**
```
▶️ Task Started | ✅ Task Completed | ❌ Task Failed
Task Type: transcribe | Municipality: Athens
Meeting: City Council - January 2025
[Open Admin Panel](https://...)
```

**User Onboarded:**
```
✨ User Onboarded
Municipality: Athens | Source: Notification Preferences
(PII not transmitted)
```

## Troubleshooting

**Notifications not appearing?**
1. Verify webhook URL in `.env` file
2. Check webhook exists in Discord (Channel Settings > Integrations > Webhooks)
3. Check application logs for errors
4. Test manually: `curl -X POST "YOUR_WEBHOOK_URL" -H "Content-Type: application/json" -d '{"content": "Test"}'`

**Rate limits:** 30 requests/minute per webhook. OpenCouncil stays well within this.

## Security Notes

- ❌ Never commit webhook URL to version control
- ✅ Use a private Discord channel
- ✅ Rotate webhook periodically

## Customization

To disable: Remove `DISCORD_WEBHOOK_URL` from `.env`

To customize: Edit `/src/lib/discord.ts` - all notification functions are non-blocking.
