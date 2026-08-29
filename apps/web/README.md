# @an-tg/web

Next.js frontend. Talks to `@an-tg/api` over plain `fetch` (see
`src/lib/api.ts` — every API call the UI makes lives there, nowhere
else) and stores the JWT in `localStorage`.

## Run

```bash
pnpm --filter @an-tg/web dev        # dev, http://localhost:3000
# or
pnpm --filter @an-tg/web build && pnpm --filter @an-tg/web start
```

Reads `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:4000`) to know
where the API is.

## Pages

| Route | Purpose |
|---|---|
| `/login`, `/signup` | Auth entry points — signup chains org-create → register → redirect |
| `/dashboard/contacts` | Add/import contacts |
| `/dashboard/groups` | Add Telegram MTProto groups (exact chat display name) |
| `/dashboard/connectors` | Create/list connectors, see their capabilities |
| `/dashboard/compose` | Manual single-message send (contact or group) |
| `/dashboard/campaigns` | Create/launch bulk sends, view status reports |
| `/dashboard/workflows` | Raw-JSON node editor, trigger runs, approve paused runs |
| `/dashboard/help` | The in-app guide — read this first if you're new to the app |

There is no separate build for "production config" vs "dev config" beyond
the standard Next.js `.next` output — `next build` + `next start` is the
whole story.

## What's intentionally thin here

Campaigns and Workflows are plain forms / a raw JSON textarea, not a
wizard or visual builder. They're feature-complete against the API but
not polished UI — see the root `PLAN.md` for what's tracked as still open.
