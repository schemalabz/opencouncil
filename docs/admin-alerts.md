# Discord Admin Alerts Setup

OpenCouncil sends real-time admin alerts to Discord for key events:

- 🆕 **New meeting added** - With link to view meeting
- ▶️ **Task started/completed/failed** - With links to admin panel
- ✨ **User onboarded** - Via notification preferences, petition, magic link, or admin invite
- 📝 **New petition** - When submitted for a municipality
- 🔔 **Citizen notification signup** - When users sign up for citizen notifications
- 📬 **Notifications created** - Summary when notifications are created for a meeting
- 📤 **Notifications sent** - Summary of delivery results (emails, messages, failures)

*No PII (emails, phone numbers, names) is transmitted in these admin alerts.*

## Quick Setup

### 1. Create Discord Webhook

1. Open your Discord server → Right-click channel → **Edit Channel**
2. Go to **Integrations** → **Webhooks** → **New Webhook**
3. Name it (e.g., "OpenCouncil Admin Alerts")
4. **Copy Webhook URL**

The URL looks like: `https://discord.com/api/webhooks/123.../AbCd...`

### 2. Add to Environment Variables

Add to your `.env` file:

```bash
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN"
```

⚠️ **Keep this URL secret!** Anyone with it can send messages to your channel.

### 3. Test It

Create a meeting or start a task - you should see admin alerts in Discord

## Admin Alert Examples

All admin alerts include timestamps, color coding (green/red/blue), and clickable links.

**New Meeting:**
```
🆕 athens: jan15_2025
Scheduled for Monday, January 15, 2025, 14:30
Municipality: Athens | Meeting: City Council - January 2025
Date: January 15, 2025 | [View Meeting](https://...)
```

**Task Updates:**
```
▶️|✅|❌ transcribe - athens
Processing|Completed|Failed: jan15_2025
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

**Notifications Created:**
```
📬 Notifications Created - athens
25 beforeMeeting notifications created for jan15_2025
Municipality: Athens | Type: Before Meeting
Meeting: City Council - January 2025
Users Notified: 25 | Total Subjects: 47
Status: ⏸️ Pending Approval (or ✅ Sent Immediately)
[View Meeting](https://...) | [Manage Notifications](https://...)
```

**Notifications Sent:**
```
📤 Notifications Sent
Delivery batch completed for 25 notifications
📧 Emails Sent: 25 | 💬 Messages Sent: 18 | ❌ Failed: 0
[View All Notifications](https://...)
```

## Troubleshooting

**Admin alerts not appearing?**
1. Verify webhook URL in `.env` file
2. Check webhook exists in Discord (Channel Settings > Integrations > Webhooks)
3. Check application logs for errors
4. Test manually: `curl -X POST "YOUR_WEBHOOK_URL" -H "Content-Type: application/json" -d '{"content": "Admin Alert Test"}'`

**Rate limits:** 30 requests/minute per webhook. OpenCouncil admin alerts stay well within this.

## Security Notes

- ❌ Never commit webhook URL to version control
- ✅ Use a private Discord channel
- ✅ Rotate webhook periodically

## Customization

To disable: Remove `DISCORD_WEBHOOK_URL` from `.env`

To customize: Edit `/src/lib/discord.ts` - all admin alert functions are non-blocking.
