# Groups & Telegram MTProto broadcast sending

For the "send to multiple groups/chats automatically" use case.

## How it works

1. Set up a `TELEGRAM_MTPROTO` connector (see `docs/connectors.md`) with
   `capabilities.groups = true`.
2. On `/dashboard/groups`, add a group with its **exact** Telegram
   chat/group display name — e.g. `AP Service Team`, spelled and cased
   exactly as it appears in Telegram.
3. On Compose, choose "A group/chat" instead of a contact, or on
   Campaigns, select one or more groups alongside (or instead of)
   contacts.

## Why the name has to match exactly

Telegram MTProto has no deep-link for a group the way `wa.me/<phone>` works
for an individual contact. There's also no stable, browser-automation-
reachable group ID. So the Desktop Agent finds the chat the way a human
would: it types the name into Telegram's own search box and opens the
top result. If your Group's stored name doesn't match closely enough to
be that top result, the send will fail or go to the wrong chat.

## What actually happens on send

`apps/desktop-agent/src/session.ts`'s `sendGroupMessage()`:
1. Opens the main Telegram MTProto view (not a specific chat)
2. Types the group name into the search box
3. Clicks the first result
4. Types the message into the composer and sends

Same idempotency, retry, and status-logging as every other message —
the only difference from a contact send is how the chat gets opened.

## Campaigns targeting groups

A campaign's recipient list can mix contacts and groups in the same run.
The worker's `campaign.processor.ts` fans each one out to a `send` job
with either `toPhone` or `toGroupId` set; `messaging-core` branches on
which one is present. Group sends skip the contact-scoped consent/
suppression check (group membership is the consent signal in Telegram's
own model — there's no per-group opt-out list in this platform).

## Risk, honestly

This is unofficial browser automation, not the approved Business
Platform API. Sending to many chats in a short window is exactly the
pattern Telegram's anti-abuse detection watches for. Recommendations:

- Keep volume modest — this is meant for "one particular purpose," not
  your primary channel.
- Treat delivery as best-effort. There's no delivery-status API for this
  connector type (`getStatus()` always returns `unknown`).
- If/when volume grows, that's the signal to add a Cloud API connector
  instead — the rest of the app (contacts, campaigns, workflows) doesn't
  change, you just point the send at a different connector.
