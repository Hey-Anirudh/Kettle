---
name: connections-guide
version: 1.0.0
author: "Virender Kumar <virender.kumar3@genpact.com>"
description: >
  Use this skill whenever a user asks about SharePoint files, OneDrive, M365, ServiceNow, Kore.ai, or
  any task that requires choosing between multiple active MCP connections. It resolves which connection
  to use, asks the user when there is ambiguity, and prevents the AI from asking for re-authentication
  when a valid connection is already configured.

  Trigger phrases: "check my SharePoint", "list SharePoint sites", "search SharePoint files",
  "open a ServiceNow ticket", "ask Kore", "check M365", or any request that implies reading/writing
  from an enterprise system that Orbit has an MCP for.
---

# Orbit Connections Guide

## Purpose
This skill ensures the AI always uses the **most direct, already-authenticated** connection for any
enterprise data request. Never ask the user to sign in again if a working connection exists.

---

## Connection Priority Rules

### SharePoint File Operations

**Step 1 — Check active SharePoint MCP connections**

The `sharepoint` MCP provides direct credential-based access to SharePoint. Use its tools:
- `list_sites` — list all accessible SharePoint sites
- `get_site_info` — details about a specific site
- `list_site_drives` — document libraries in a site
- `list_drive_items` — files/folders in a library or folder
- `search_files` — full-text search across SharePoint
- `get_file_content` — read a file's content

**Decision logic — follow this order strictly:**

**Case A — SharePoint MCP has tools available:**
→ Use the `sharepoint` MCP tools directly. Do NOT ask the user to sign in.
→ Do NOT use M365 device-code auth for SharePoint file operations.

**Case B — Multiple SharePoint MCP connections exist (e.g., `sharepoint`, `sharepoint-2`):**
→ List the available connections with their configured site URLs.
→ Ask the user which one to use:
  > "I found multiple SharePoint connections:
  > 1. **sharepoint** — https://genpact.sharepoint.com
  > 2. **sharepoint-prod** — https://genpact-prod.sharepoint.com
  >
  > Which one should I use for this task?"
→ After the user picks, proceed with that MCP's tools.

**Case C — No `sharepoint` MCP tools available but `m365` MCP is connected and authenticated:**
→ Use `m365` MCP tools to access SharePoint via Graph API.
→ If M365 also requires auth, guide the user:
  > "No active SharePoint connection found. You can connect one in **Settings → Extensions → SharePoint**.
  > Alternatively, I can use your M365 connection — click the link below to sign in."

**Case D — Neither `sharepoint` nor `m365` is connected:**
→ Tell the user clearly:
  > "No SharePoint connection is active. To connect:
  > 1. Open **Settings → Extensions**
  > 2. Find **SharePoint** under YOUR APPS
  > 3. Click **Configure** to enter your tenant/app credentials
  > 4. Click **Connect** to authenticate
  > Once connected, come back and ask again."

---

### M365 / Graph API Operations (email, calendar, Teams)

- Use `m365` MCP tools for: email, calendar, Teams chats, OneDrive, user directory
- If not authenticated, the M365 MCP will provide a device code — show it to the user
- Do NOT use SharePoint MCP for email/calendar/Teams — use M365 for those

---

### ServiceNow Operations

- Use `servicenow` MCP for: creating tickets, querying incidents, checking change requests
- If ServiceNow MCP is connected, use it directly — do NOT ask for credentials again

---

### Kore.ai Assistants

- Use `kore-assistants` MCP to interact with configured Kore.ai enterprise bots
- If connected, invoke the assistant directly — do NOT ask for auth

---

## Session Context Rules

If you are in an **existing session** and the user references SharePoint, M365, ServiceNow, or Kore.ai:
- Assume MCP connections that were active when this workspace was last updated are still available
- If a tool call fails with a connection error, suggest: "Try clicking Reconnect on the MCP in Extensions, then retry"
- Do NOT assume connections are stale just because the session is old

---

## What NOT to do

- ❌ Do NOT ask the user to sign in to Microsoft 365 via device code if the `sharepoint` MCP has tools available
- ❌ Do NOT use M365 Graph API for direct SharePoint file listing if the `sharepoint` MCP is connected
- ❌ Do NOT show multiple authentication prompts for the same system
- ❌ Do NOT say "I cannot access SharePoint" when a `sharepoint` MCP connection exists
- ❌ Do NOT try to create new connections — always check existing ones first

---

## About This Skill

- **Skill version:** 1.0.0
- **Author:** Virender Kumar <virender.kumar3@genpact.com>
- **Maintained by:** Genpact Orbit Team

### Disclaimer
This skill uses AI to generate content and/or code. All outputs are **drafts** and must be
reviewed and validated by a qualified human before production use or external delivery. Do not
provide client-confidential, personal, or otherwise regulated data unless your engagement's
data-handling and privacy policy explicitly permits it. Genpact accepts no liability for
unreviewed AI-generated output.

### Support, Issues & Upgrades
- **Report a problem or unexpected output** — contact Virender Kumar
  <virender.kumar3@genpact.com> or raise an issue in the Orbit skills repository. Include the skill
  name and version shown above, plus what you expected vs. what happened.
- **Request an enhancement or new capability** — same contact; describe the use case and the
  outcome you need.
- **Check for upgrades** — newer versions are published to the Orbit skills repository / dist
  package. Replace your local copy of the skill folder to upgrade.
