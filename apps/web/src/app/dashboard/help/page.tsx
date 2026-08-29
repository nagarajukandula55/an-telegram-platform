const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "first-send", label: "Your first send" },
  { id: "getting-started", label: "Getting started" },
  { id: "connectors", label: "1. Connectors" },
  { id: "contacts", label: "2. Contacts" },
  { id: "groups", label: "3. Groups (Telegram MTProto)" },
  { id: "compose", label: "4. Compose (single send)" },
  { id: "campaigns", label: "5. Campaigns (bulk send)" },
  { id: "workflows", label: "6. Workflows (automation)" },
  { id: "attachments", label: "Attachments" },
  { id: "webhooks", label: "Webhooks (Cloud API status)" },
  { id: "roles", label: "Users & roles" },
  { id: "architecture", label: "How it runs" },
  { id: "troubleshooting", label: "Troubleshooting" },
  { id: "repo-docs", label: "More documentation" },
];

export default function HelpPage() {
  return (
    <div className="flex gap-8">
      <nav className="sticky top-8 hidden w-48 shrink-0 self-start md:block">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">On this page</div>
        <ul className="space-y-1 text-sm">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-gray-600 hover:text-indigo-600">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="max-w-2xl space-y-10 pb-16">
        <div>
          <h1 className="mb-1 text-xl font-semibold">Help &amp; process flows</h1>
          <p className="text-sm text-gray-500">
            What each page does, in the order you&rsquo;d normally set things up. Every send — manual, campaign, or
            workflow — goes through the same pipeline: consent/suppression check → connector capability check →
            duplicate-send check → deliver → log status.
          </p>
        </div>

        <Section id="overview" title="Overview">
          <P>
            This is a connector-agnostic Telegram automation platform. &ldquo;Connector-agnostic&rdquo; means the
            same Contacts, Groups, Compose, Campaigns, and Workflows pages work no matter which of the three
            delivery methods you&rsquo;ve connected:
          </P>
          <Ul
            items={[
              <>
                <B>Telegram Bot API</B> — the official Meta Business Platform. Individual contacts only (no
                groups), needs a Meta Business account + approved phone number.
              </>,
              <>
                <B>Custom middleware</B> — any HTTP endpoint you or a provider run that accepts a message and returns
                an acceptance status. Good for testing, or for a BSP (Business Solution Provider) you already pay for.
              </>,
              <>
                <B>Telegram MTProto</B> — your own phone number via a real browser session (the local Desktop Agent). No
                Meta approval needed, supports groups, but is unofficial automation — see the warning in the Groups
                and Connectors sections.
              </>,
            ]}
          />
        </Section>

        <Section id="first-send" title="Your first send, start to finish">
          <P>The shortest path to seeing a message actually go out, using a fake endpoint so you don&rsquo;t need real Telegram access yet:</P>
          <Ol
            items={[
              <>
                Go to <B>Connectors</B> → New connector → type <B>Custom middleware</B>, config{" "}
                <Code>{`{"endpointUrl": "https://webhook.site/<your-id>"}`}</Code> (grab a free instant URL from
                webhook.site if you don&rsquo;t have your own test endpoint) → Create.
              </>,
              <>
                Go to <B>Contacts</B> → add one contact with your own phone number (nothing actually sends to a real
                Telegram for this test — the fake endpoint just needs to respond).
              </>,
              <>
                Go to <B>Compose</B> → pick the connector you just made → pick the contact → write a message → Send.
              </>,
              "Check the fake endpoint's log (e.g. webhook.site's page) to see the exact payload that was sent, and check the JSON result on the Compose page — status should be SENT.",
              <>
                Now repeat with a real setup: a real <B>Cloud API</B> or <B>Telegram MTProto</B> connector — see{" "}
                <B>1. Connectors</B> below.
              </>,
            ]}
          />
        </Section>

        <Section id="getting-started" title="Getting started">
          <Ol
            items={[
              <>
                Go to <Code>/signup</Code> to create your organization and admin account, or sign in at{" "}
                <Code>/login</Code> if one already exists.
              </>,
              <>
                Admins can add teammates from <Code>POST /auth/users</Code> (role-based: Manager, Campaign Manager,
                Operator, etc. — no dedicated screen yet, ask an admin or use the API directly).
              </>,
              "Set up at least one Connector (below) before anything else — Contacts and Groups can be added anytime, but nothing can send without a connector.",
            ]}
          />
        </Section>

        <Section id="connectors" title="1. Connectors — Connectors page">
          <P>Add one connector per delivery method you want to use. A new connector is usable immediately.</P>
          <Ul
            items={[
              <>
                <B>Telegram Bot API:</B> Config = <Code>{`{"phoneNumberId": "..."}`}</Code>. Requires a Meta Business
                account, an approved Telegram Business phone number, and an access token stored as an env var on the
                server (Credential env var name field — never paste the token itself into the form).
              </>,
              <>
                <B>Custom middleware:</B> Config = <Code>{`{"endpointUrl": "https://..."}`}</Code>. Point this at any
                endpoint that accepts <Code>{`{recipient, content, attachments}`}</Code> and returns{" "}
                <Code>{`{accepted, status}`}</Code>. Easiest way to test the whole app without real Telegram access.
              </>,
              <>
                <B>Telegram MTProto:</B> Config = <Code>{`{"agentUrl": "http://127.0.0.1:8787"}`}</Code>. Requires the
                Desktop Agent running locally and a one-time QR-code login (see &ldquo;How it runs&rdquo; below).
              </>,
            ]}
          />
          <Warn>
            The Capabilities checkboxes (text/image/groups/etc.) control what Compose and Campaigns let you send
            through that connector — set them to match what the underlying method actually supports.
          </Warn>
        </Section>

        <Section id="contacts" title="2. Contacts">
          <Ul
            items={[
              "Add one at a time (phone, name, email, language, tags), or",
              "Bulk import a CSV/XLSX with phone/name/email/language/tags columns — you'll get a per-row created/duplicate/invalid result.",
              "Every contact automatically gets a consent/suppression check before any send reaches them — opted-out or suppressed numbers are skipped, not silently sent to.",
            ]}
          />
        </Section>

        <Section id="groups" title="3. Groups (Telegram MTProto only)">
          <P>
            Add a group by its <B>exact</B> Telegram chat/group display name. There&rsquo;s no stable ID for a group
            reachable through browser automation the way a phone number has a deep link, so the Desktop Agent finds
            the chat by typing that name into Telegram&rsquo;s own search box and opening the first match — the name
            has to match closely enough to be the top hit.
          </P>
          <Warn>
            Sending to many groups/contacts in a short window is exactly the pattern Telegram&rsquo;s anti-abuse
            systems watch for. Keep volume modest and paced — this is unofficial automation, and delivery is
            best-effort, not guaranteed.
          </Warn>
        </Section>

        <Section id="compose" title="4. Compose — single send">
          <P>Pick a connector, choose a contact or (if the connector supports groups) a group, write the message, optionally attach a file, and send.</P>
          <P>This is the manual/one-off path — for sending to many recipients at once, use Campaigns.</P>
        </Section>

        <Section id="campaigns" title="5. Campaigns — bulk send">
          <Ol
            items={[
              "Create: name, connector, and a mix of contacts and/or groups (contacts and groups can be selected in the same campaign).",
              "Campaigns over 500 total recipients start in Waiting Approval and need a Manager/Campaign Manager/Admin to launch.",
              "Launch enqueues the campaign; a background worker fans it out one send per recipient, with automatic retry/backoff on transient failures (rate limits, timeouts). Permanent failures (invalid recipient, policy block) are not retried.",
              "Report shows a live count of message statuses (SENT/FAILED/DELIVERED/etc.) for the campaign.",
            ]}
          />
        </Section>

        <Section id="workflows" title="6. Workflows — automation">
          <P>
            A workflow is a JSON list of nodes executed strictly in order: <Code>trigger</Code>, <Code>send</Code>,{" "}
            <Code>wait</Code> (delay in ms), <Code>log</Code>, <Code>condition</Code> (simple field-equals check), and{" "}
            <Code>human_approval</Code>.
          </P>
          <P>
            Trigger a workflow to start a run; watch its steps execute in the run list. A run that hits a{" "}
            <Code>human_approval</Code> node pauses there — click Approve &amp; resume to continue it from the next
            step.
          </P>
          <Warn>There&rsquo;s no visual builder yet — workflows are edited as raw JSON on the Workflows page.</Warn>
        </Section>

        <Section id="attachments" title="Attachments">
          <P>
            Uploaded from Compose (or directly via the API). Files are stored on local disk, MIME-allowlisted, capped
            at 16MB, and never given a permanent public URL — every send generates a short-lived signed download link
            for the connector to fetch.
          </P>
        </Section>

        <Section id="webhooks" title="Webhooks (Cloud API only)">
          <P>
            The Telegram Bot API reports delivery/read/failed status asynchronously via a webhook, not in the
            original send response. To receive those:
          </P>
          <Ol
            items={[
              "Your API server must be reachable from the internet (use a tunnel like ngrok while developing locally).",
              <>
                In your Meta app&rsquo;s webhook settings, point it at{" "}
                <Code>https://your-api-host/webhooks/connector-telegram-bot/&lt;connectorId&gt;</Code>.
              </>,
              <>
                Set <Code>WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN</Code> (matches what you enter in Meta&rsquo;s dashboard) and{" "}
                <Code>WHATSAPP_CLOUD_APP_SECRET</Code> (used to verify Meta&rsquo;s signature) in your server&rsquo;s env.
              </>,
            ]}
          />
        </Section>

        <Section id="roles" title="Users & roles">
          <P>
            The first person to register for a new organization becomes <Code>TENANT_ADMIN</Code>. Admins add
            teammates via <Code>POST /auth/users</Code> (no dedicated screen yet) with one of these roles:
          </P>
          <Ul
            items={[
              <><B>SUPER_ADMIN / TENANT_ADMIN</B> — full access, including creating connectors and approving large campaigns.</>,
              <><B>MANAGER / CAMPAIGN_MANAGER</B> — can approve/launch campaigns above the 500-recipient threshold; cannot create connectors.</>,
              <><B>OPERATOR / AGENT</B> — everyday use: contacts, compose, campaigns, workflows within normal limits.</>,
              <><B>DEVELOPER</B> — can create connectors (alongside admins) — useful for whoever's setting up integrations without full admin rights.</>,
              <><B>AUDITOR / READ_ONLY</B> — view-only roles; not yet enforced on every read endpoint, treat as reference for future tightening.</>,
            ]}
          />
          <P>Every mutating action (create/update/send/launch/trigger) is written to an audit log — not yet exposed in the UI, but present in the database for later reporting.</P>
        </Section>

        <Section id="architecture" title="How it runs">
          <P>Three processes, all sharing one local SQLite database file — no Docker, no external services:</P>
          <Ul
            items={[
              <><B>web</B> — this UI, port 3000.</>,
              <><B>api</B> — the backend everything above talks to, port 4000.</>,
              <><B>worker</B> — polls a job-queue table for campaign fan-out, message retries, and workflow steps. Nothing queue-based (campaigns, workflow sends, retries) happens unless this is running.</>,
              <><B>desktop-agent</B> — only needed for Telegram MTProto connectors. Run it separately, a real Chromium window opens, scan the QR code once with your phone. It stays logged in across restarts (persistent browser profile).</>,
            ]}
          />
        </Section>

        <Section id="troubleshooting" title="Troubleshooting">
          <Ul
            items={[
              <><B>Send fails immediately with a capability error</B> — the connector's Capabilities don't have that content type (or "groups") checked. Fix on the Connectors page.</>,
              <><B>Message stuck as FAILED with TIMEOUT/CONNECTOR_OFFLINE</B> — for Custom middleware or Cloud API, the endpoint didn't respond; for Telegram MTProto, the Desktop Agent isn't running or isn't logged in (check its window).</>,
              <><B>Group send can't find the chat</B> — the Group's name doesn't match the real Telegram chat display name closely enough to be the top search result. Fix the name on the Groups page.</>,
              <><B>Campaign stuck in Waiting Approval</B> — it has more than 500 recipients; a Manager+ role needs to launch it.</>,
              <><B>Nothing happens after Launch/Trigger</B> — the worker process isn't running.</>,
            ]}
          />
        </Section>

        <Section id="repo-docs" title="More documentation">
          <P>This page covers day-to-day use. For setup, deployment, and how the pieces fit together, see the repo itself:</P>
          <Ul
            items={[
              <><Code>docs/getting-started.md</Code> — install and run from scratch</>,
              <><Code>docs/connectors.md</Code> — step-by-step for each connector type</>,
              <><Code>docs/groups-and-connector-telegram-mtproto.md</Code> — the group-broadcast flow in depth</>,
              <><Code>docs/architecture.md</Code> — how the four processes and the queue fit together</>,
              <><Code>docs/deployment.md</Code> — what changes if this needs to run on a server instead of your machine</>,
              <><Code>PLAN.md</Code> — what&rsquo;s built vs. still open, phase by phase</>,
              <>Each app&rsquo;s own <Code>README.md</Code> (<Code>apps/api</Code>, <Code>apps/worker</Code>, <Code>apps/web</Code>, <Code>apps/desktop-agent</Code>) — what that specific process does and how to run it standalone</>,
            ]}
          />
        </Section>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="mb-3 text-base font-semibold text-gray-900">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-gray-900">{children}</strong>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800">{children}</code>;
}

function Ul({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Ol({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{children}</div>
  );
}
