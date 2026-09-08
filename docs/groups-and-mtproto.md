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

`groups.service.ts` stores your typed name directly as the group's
`providerGroupId` (`apps/api/src/groups/groups.service.ts`). At send
time, the MTProto connector (GramJS) calls `client.getEntity(providerGroupId)`
(`connectors/connector-telegram-mtproto/src/index.ts`) to resolve that
string to a real chat — which only works if it exactly matches a
username/title GramJS can already resolve from the account's own dialog
cache. There's no fuzzy matching and no "search and pick the top result"
step, so a name that's off by spelling, case, or punctuation fails to
resolve rather than silently going to the wrong chat.

There's currently no UI to browse/pick from the account's actual joined
groups (group *discovery*) — you have to know and type the exact name
yourself. That's a known gap, tracked in `PLAN.md`.

## What actually happens on send

`connector-telegram-mtproto`'s `send()`:
1. Resolves `recipient.providerGroupId` via GramJS's `client.getEntity()`
2. Sends the message content to the resolved chat entity via the same
   MTProto client used for direct messages

Same idempotency, retry, and status-logging as every other message —
the only difference from a contact send is which entity gets resolved.

## Campaigns targeting groups

A campaign's recipient list can mix contacts and groups in the same run.
The worker's `campaign.processor.ts` fans each one out to a `send` job
with either `toPhone` or `toGroupId` set; `messaging-core` branches on
which one is present. Group sends skip the contact-scoped consent/
suppression check (group membership is the consent signal in Telegram's
own model — there's no per-group opt-out list in this platform).

## Risk, honestly

This is an unofficial user-account client (GramJS), not the approved Bot
API. Sending to many chats in a short window is exactly the pattern
Telegram's anti-abuse detection watches for. Recommendations:

- Keep volume modest — this is meant for "one particular purpose," not
  your primary channel.
- Treat delivery as best-effort. There's no delivery-status API for this
  connector type (`getStatus()` always returns `unknown`).
- If/when volume grows, that's the signal to add a Cloud API connector
  instead — the rest of the app (contacts, campaigns, workflows) doesn't
  change, you just point the send at a different connector.
