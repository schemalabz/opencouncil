# Discord Admin Alerts Setup

OpenCouncil sends real-time admin alerts to Discord for key events:

- 🆕 **New meeting added** - With link to view meeting
- ▶️ **Task started/completed/failed** - With links to admin panel
- 📋 **pollDecisions batch** - Batch started + aggregated completion summary (replaces per-task alerts)
- ✅ **Human review completed** - With review statistics (edits, time, efficiency)
- ✨ **User onboarded** - Via notification preferences, petition, magic link, or admin invite
- 📝 **New petition** - When submitted for a municipality
- 🔔 **Citizen notification signup** - When users sign up for citizen notifications
- 📬 **Notifications created** - Summary when notifications are created for a meeting
- 📤 **Notifications sent** - Summary of delivery results (emails, messages, failures)

*Note: Reviewer names/emails are included in review completion alerts for accountability.*

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

**Human Review Completed:**

*Single reviewer:*
```
✅ Human Review Completed - athens
jan15_2025
Municipality: Athens | Meeting: City Council - January 2025
👤 Primary Reviewer: John Doe (127 / 1230 utterances edited)
⏱️ Review Time (Primary): 2h 15m
🎬 Sessions: 3 (10m + 1h2m + 43m)
⚡ Efficiency: 1:0.6 | 📊 Meeting Duration: 3h 30m
[Open Meeting](https://...) | [View All Reviews](https://...)
```

*Multiple reviewers:*
```
✅ Human Review Completed - athens
jan15_2025
Municipality: Athens | Meeting: City Council - January 2025
👤 Primary Reviewer: John Doe (127 / 1230 utterances edited)
👥 Additional Reviewers: Jane Smith (15 edits), Bob Johnson (8 edits)
⏱️ Review Time (Primary): 2h 15m
⏱️ Total Time (All): 2h 45m
🎬 Sessions: 4 (10m + 1h2m + ↳25m + ↳8m)
⚡ Efficiency: 1:0.8 | 📊 Meeting Duration: 3h 30m
[Open Meeting](https://...) | [View All Reviews](https://...)
```

*If reviewer provides manual time estimate:*
```
⏱️ Review Time (Primary): 2h 15m (Reviewer estimate: 3h)
```

**Notes:**
- The primary reviewer is determined by who made the most edits, regardless of who clicked "Mark as Complete"
- Session durations show the breakdown of active review time across all reviewers in chronological order
- Secondary reviewer sessions are marked with ↳ symbol
- Efficiency is calculated using total time from all reviewers
- "Total Time (All)" field only appears when there are multiple reviewers

**pollDecisions Alerts:**

Unlike other task types, `pollDecisions` uses `discordAlertMode: 'none'` — generic per-task started/completed/failed alerts are suppressed entirely. Instead, two batch-level alerts replace them:

*Batch Started (cron dispatch only):*
```
▶️ pollDecisions cron: 5 tasks dispatched
Batch dispatched successfully
Dispatched: 5 | Skipped (backoff): 2
Meetings:
  `athens/jan15_2025`
  `thessaloniki/feb10_2025`
  ...
```

*Batch Completed (when all sibling tasks finish):*
```
📋 pollDecisions: 3 decision(s) found
5 task(s) completed
Succeeded: 5 | Failed: 0 | Decisions Found: 3
Details:
  `athens/jan15_2025` — 2 match(es)
  `thessaloniki/feb10_2025` — 1 match(es), 1 reassignment(s)
Admin Panel: athens/jan15_2025 | thessaloniki/feb10_2025
```

Color coding: green (all succeeded), orange (conflicts found), red (failures).

No-op runs (no new decisions):
```
📋 pollDecisions batch completed (no new decisions)
5 task(s) completed
Succeeded: 5 | Failed: 0 | Decisions Found: 0
```

**Notes:**
- Cron batches produce **2 messages** instead of up to 20 (1 started + 1 completed).
- Manual triggers from the admin panel get a completion summary when the task finishes (batch of 1). No separate started alert.
- Sibling tasks are grouped by a ±2 minute window (`BATCH_WINDOW_MS`). The cron interval must be >4 minutes to avoid batch overlap.

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
