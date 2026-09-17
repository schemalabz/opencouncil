# Bird Messaging Setup (WhatsApp + SMS)

This guide walks you through configuring [Bird](https://bird.com) for OpenCouncil's messaging. The Notis service (`services/notis`) sends every WhatsApp and SMS message to readers and answers every reply; it is the only component with Bird credentials. The main app has none — it sends nothing over WhatsApp or SMS and has no Bird webhook. By the end you'll have Notis's `BIRD_*` variables filled in and a local ngrok tunnel that lets Bird POST inbound events to your machine.

For Notis's own variables and how it uses each template, see [`services/notis/README.md`](../services/notis/README.md).

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

> Inbound SMS requires extra account setup on Bird's side (see [Receiving inbound SMS](https://docs.bird.com/connectivity-platform/receiving-sms/setting-your-account-up-to-receive-inbound-sms)). Notis receives inbound SMS through the same webhook events as WhatsApp.

Copy the channel ID into `BIRD_SMS_CHANNEL_ID`.

## Step 4: The WhatsApp templates

WhatsApp Business restricts outbound messages outside a 24-hour reply window to **pre-approved templates**. They belong to Notis: [`services/notis/README.md`](../services/notis/README.md) lists the shells, their variables and the `BIRD_WHATSAPP_TEMPLATE_*` variables that hold their Bird project ids.

## Step 5: Generate an API key

1. In the workspace sidebar go to **Settings** → **Developers** → **API access** (or **Access keys**, depending on Bird's UI version).
2. Click **Create access key**, give it a descriptive name (e.g. `opencouncil-local`), and grant it the **Conversations** and **Channels** scopes.
3. **Copy the key value immediately** — Bird only shows it once. Save it as `BIRD_API_KEY` in `services/notis/.env`.

## Step 6: Generate the webhook signing secret

This is the shared secret Bird uses to sign inbound webhook events, so the `/api/webhooks/bird` handler can verify they actually came from Bird (not a forged request to your public URL).

Generate 32 random bytes, base64-encoded:

```sh
openssl rand -base64 32
```

Save the **same value** in two places:

- Locally as `BIRD_WEBHOOK_SECRET` in `services/notis/.env`.
- On Bird's side as the `signingKey` of the webhook subscription you'll create in [Step 9](#step-9-register-the-webhook-in-bird).

> **Treat it like a password.** Anyone with this value can forge requests that look like they came from Bird. Don't commit it; generate a different one per environment (dev, staging, prod) so a leaked dev key doesn't compromise prod. The HMAC scheme itself (HMAC-SHA256 over `timestamp \n url \n sha256(body)`, base64-encoded) is documented in [Bird — Verifying a webhook subscription](https://docs.bird.com/api/notifications-api/api-reference/webhook-subscriptions/verifying-a-webhook-subscription).

## Step 7: Fill in `services/notis/.env`

After Steps 1–6 you should have all five variables. Add them to `services/notis/.env`:

```bash
# Bird API for WhatsApp/SMS
BIRD_WORKSPACE_ID=<workspace-uuid>
BIRD_API_KEY=<your-api-key>
BIRD_WHATSAPP_CHANNEL_ID=<whatsapp-channel-uuid>
BIRD_SMS_CHANNEL_ID=<optional>
BIRD_WEBHOOK_SECRET=<openssl-output-from-step-6>
```

The template ids go beside them — one per shell in `src/agent/templates.ts`, listed in [`services/notis/README.md`](../services/notis/README.md). At this point Notis can send; **inbound** still requires the next two steps.

## Step 8: Expose the webhook locally with ngrok

Bird needs a publicly reachable URL to POST inbound events to. In production that's `https://notis.opencouncil.gr/api/webhooks/bird`; locally we tunnel with ngrok.

1. Start the Notis dev server:

   ```sh
   npm run dev -w notis
   ```

2. In a separate terminal, start an ngrok tunnel pointing at Notis's local port (default `3001`):

   ```sh
   ngrok http 3001
   ```

3. ngrok prints a forwarding URL like:

   ```
   Forwarding  <ngrok-url> -> http://localhost:3001
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
   | **URL** | `https://notis.opencouncil.gr/api/webhooks/bird`, or the ngrok URL from Step 8 locally |
   | **Signing key** | The same string you put in `BIRD_WEBHOOK_SECRET` (Step 6) |
   | **Service** | `Conversations` |
   | **Events** | `conversation.created`, `conversation.updated` |

3. Save. Bird will start POSTing matching events to your tunnel.

> The two events together cover the inbound path: `conversation.created` fires when a contact replies to one of your messages for the first time, `conversation.updated` fires for every subsequent message in that thread.

There is one subscription, and it is Notis's. The main app had a second one until 2026-09; it only reconciled the delivery status of messages it had sent itself, and both the sender and the webhook are gone. If that subscription still exists in your workspace, delete it — it POSTs to a route that no longer answers.

## Step 10: Verify the inbound path

Send a message from a phone that belongs to a reader, then watch the Notis logs and its admin feed. Notis enrolls a main-app user on their first message, serves ΣΤΟΠ and every reply, and reconciles the delivery status of its own sends. A message from a phone no reader has is ignored.

If signature verification fails you'll see a warning like:

```
Bird webhook: signature verification failed — signature mismatch
```

The most common causes are:

- The signing key in Bird's webhook subscription doesn't match `BIRD_WEBHOOK_SECRET` in `services/notis/.env` (re-paste both).
- ngrok was restarted and the URL on the Bird subscription is stale (update it).
- Your `.env` was loaded before you set `BIRD_WEBHOOK_SECRET` — restart the Notis dev server.

> **Production only.** Register webhook subscriptions for production, not
> for staging. Bird sends every event to every subscription in the
> workspace, so a staging subscription receives real user traffic and
> staging would answer real users. The staging subscriptions were removed
> on 2026-08-16. To test inbound on staging, use the synthetic script
> below against the staging URL.

To test the notis inbound path without Bird, send a signed synthetic event:

```sh
cd services/notis && npx tsx --env-file=.env scripts/send-test-webhook.ts +306990000001 "γεια σου"
```
