# Bird Messaging Setup (WhatsApp + SMS)

This guide walks you through configuring [Bird](https://bird.com) for OpenCouncil's notification system: **outbound** WhatsApp/SMS (meeting reminders, welcome messages) and **inbound** WhatsApp replies (the unsubscribe-by-reply flow). By the end you'll have all the `BIRD_*` environment variables filled in and a local ngrok tunnel that lets Bird POST inbound events back to your machine.

For the canonical list of variables and their default values, see [`.env.example`](../.env.example) and [`environment-variables.md`](./environment-variables.md).

## Prerequisites

- A Bird account — sign up at [app.bird.com](https://app.bird.com/sign-up).
- A WhatsApp Business account (Bird's onboarding flow walks you through linking one). For local development, Bird's sandbox WhatsApp number is enough.
- [`openssl`](https://www.openssl.org/) on your machine (for generating the webhook secret).
- [`ngrok`](https://ngrok.com/download) (only needed for testing inbound locally).

## Step 1: Create a Bird workspace

1. Sign in at [app.bird.com](https://app.bird.com). On first sign-in Bird creates a workspace for you; otherwise create one from the workspace switcher in the top-left.
2. Once inside the workspace, copy the **workspace UUID** from the URL — it's the segment after `/workspaces/`:

   ```
   https://app.bird.com/workspaces/<workspace-uuid>/...
                                    ^^^^^^^^^^^^^^^^
                                    BIRD_WORKSPACE_ID
   ```

   See [Bird — How to find a workspace ID](https://docs.bird.com/applications/settings/account/organization-settings/how-to-find-a-workspace-id) if you need help locating it.

## Step 2: Set up the WhatsApp channel

The channel is what Bird uses to deliver WhatsApp messages and receive inbound replies.

1. In the workspace sidebar go to **Channels** → **Add channel** → choose **WhatsApp**. (Bird's [supported channels](https://docs.bird.com/api/channels-api/supported-channels) page lists every option.)
2. Follow the WhatsApp Business onboarding (link a phone number, verify ownership). For a local-only setup, use Bird's sandbox WhatsApp number — no business verification required.
3. Once the channel is active, open it from **Channels** and copy the **channel ID** from the URL — it's the UUID at the end:

   ```
   https://app.bird.com/workspaces/.../channels/whatsapp/<channel-uuid>
                                                          ^^^^^^^^^^^^^^
                                                          BIRD_WHATSAPP_CHANNEL_ID
   ```

## Step 3 (optional): Set up the SMS channel

Repeat Step 2 picking **SMS** instead. Only needed if you want SMS fallback for users without WhatsApp.

> ⚠️ **Inbound SMS is not supported by OpenCouncil.** Bird does support it, but it requires extra account setup (see [Receiving inbound SMS](https://docs.bird.com/connectivity-platform/receiving-sms/setting-your-account-up-to-receive-inbound-sms)) and OpenCouncil's webhook handler currently only routes inbound WhatsApp through the unsubscribe flow. SMS in OpenCouncil is outbound-only.

Copy the channel ID into `BIRD_SMS_CHANNEL_ID`.

## Step 4: Create the WhatsApp templates

WhatsApp Business restricts outbound messages outside a 24-hour reply window to **pre-approved templates**. OpenCouncil uses three:

| Env var | Used for | Variables it must accept |
|---|---|---|
| `BIRD_WHATSAPP_TEMPLATE_WELCOME` | First message after a user signs up | user name, city name |
| `BIRD_WHATSAPP_TEMPLATE_BEFORE_MEETING` | Notification sent before a meeting | meeting title, date, link |
| `BIRD_WHATSAPP_TEMPLATE_AFTER_MEETING` | Notification sent after a meeting | meeting title, link |

For each template:

1. Open **Bird Studio** (sidebar → **Studio**) and create a new WhatsApp template. See [Bird — WhatsApp templates](https://docs.bird.com/api/channels-api/supported-channels/programmable-whatsapp) for syntax and approval requirements.
2. Submit it for WhatsApp approval (usually a few minutes).
3. Once approved, copy the **template project ID (UUID)** from the URL or the template detail panel.
4. Map each UUID into its env var (`BIRD_WHATSAPP_TEMPLATE_*`).

> The actual template wording is yours to write — but match the variable list above so the substitution code in `src/lib/notifications/bird.ts` doesn't break.

## Step 5: Generate an API key

1. In the workspace sidebar go to **Settings** → **Developers** → **API access** (or **Access keys**, depending on Bird's UI version).
2. Click **Create access key**, give it a descriptive name (e.g. `opencouncil-local`), and grant it the **Conversations** and **Channels** scopes.
3. **Copy the key value immediately** — Bird only shows it once. Save it as `BIRD_API_KEY` in `.env`.

## Step 6: Generate the webhook signing secret

This is the shared secret Bird uses to sign inbound webhook events, so the `/api/webhooks/bird` handler can verify they actually came from Bird (not a forged request to your public URL).

Generate 32 random bytes, base64-encoded:

```sh
openssl rand -base64 32
```

Save the **same value** in two places:

- Locally as `BIRD_WEBHOOK_SECRET` in `.env`.
- On Bird's side as the `signingKey` of the webhook subscription you'll create in [Step 8](#step-8-register-the-webhook-in-bird).

> **Treat it like a password.** Anyone with this value can forge requests that look like they came from Bird. Don't commit it; generate a different one per environment (dev, staging, prod) so a leaked dev key doesn't compromise prod. The HMAC scheme itself (HMAC-SHA256 over `timestamp \n url \n sha256(body)`, base64-encoded) is documented in [Bird — Verifying a webhook subscription](https://docs.bird.com/api/notifications-api/api-reference/webhook-subscriptions/verifying-a-webhook-subscription).

## Step 7: Fill in `.env`

After Steps 1–6 you should have all eight variables. Add them to your `.env`:

```bash
# Bird API for WhatsApp/SMS notifications
BIRD_WORKSPACE_ID=<workspace-uuid>
BIRD_API_KEY=<your-api-key>
BIRD_WHATSAPP_CHANNEL_ID=<whatsapp-channel-uuid>
BIRD_SMS_CHANNEL_ID=<optional>
BIRD_WHATSAPP_TEMPLATE_WELCOME=<uuid>
BIRD_WHATSAPP_TEMPLATE_BEFORE_MEETING=<uuid>
BIRD_WHATSAPP_TEMPLATE_AFTER_MEETING=<uuid>
BIRD_WEBHOOK_SECRET=<openssl-output-from-step-6>
```

At this point **outbound** sends will work — you can use the admin `/conversations` page to fire test WhatsApp messages and they'll reach a real phone. **Inbound** still requires the next two steps.

## Step 8: Expose the webhook locally with ngrok

Bird needs a publicly reachable URL to POST inbound events to. In production that's `https://opencouncil.gr/api/webhooks/bird`; locally we tunnel with ngrok.

1. Start the dev server:

   ```sh
   npm run dev
   ```

2. In a separate terminal, start an ngrok tunnel pointing at your local Next.js port (default `3000`):

   ```sh
   ngrok http 3000
   ```

3. ngrok prints a forwarding URL like:

   ```
   Forwarding  <ngrok-url> -> http://localhost:3000
   ```

   Your webhook URL is that forwarding URL plus `/api/webhooks/bird`:

   ```
   <ngrok-url>/api/webhooks/bird
   ```

> Free ngrok URLs change every restart. If you restart ngrok, update the webhook subscription URL in Bird (Step 9) — otherwise Bird will keep POSTing to a dead tunnel.

## Step 9: Register the webhook in Bird

1. In the workspace sidebar go to **Developers** → **Webhooks** → **New webhook subscription** (Bird's UI may also call this "Event subscription").
2. Fill in:

   | Field | Value |
   |---|---|
   | **URL** | The ngrok URL from Step 8, e.g. `<ngrok-url>/api/webhooks/bird` |
   | **Signing key** | The same string you put in `BIRD_WEBHOOK_SECRET` (Step 6) |
   | **Service** | `Conversations` |
   | **Events** | `conversation.created`, `conversation.updated` |

3. Save. Bird will start POSTing matching events to your tunnel.

> The two events together cover the inbound path: `conversation.created` fires when a contact replies to one of your messages for the first time, `conversation.updated` fires for every subsequent message in that thread (which is where the inbound WhatsApp body and unsubscribe-detection logic actually run).

## Step 10: Verify the full inbound path

1. Open `http://localhost:3000/admin/conversations` (you need to be logged in as an admin).
2. Click **Send test message** and pick one of the templates (e.g. welcome). Send it to a phone number you control that has WhatsApp installed.
3. On that phone, reply to the message — try `STOP` to exercise the unsubscribe flow.
4. Watch your dev server logs. A successful inbound looks like:

   ```
   Bird webhook: disabled phone notifications for user <id> across all cities (delivery <id>)
   ```

   Refresh `/admin/conversations` and the inbound message row should appear in the thread.

If signature verification fails you'll see a warning like:

```
Bird webhook: signature verification failed — signature mismatch
```

The most common causes are:

- The signing key in Bird's webhook subscription doesn't match `BIRD_WEBHOOK_SECRET` in `.env` (re-paste both).
- ngrok was restarted and the URL on the Bird subscription is stale (update it).
- Your `.env` was loaded before you set `BIRD_WEBHOOK_SECRET` — restart `npm run dev`.
