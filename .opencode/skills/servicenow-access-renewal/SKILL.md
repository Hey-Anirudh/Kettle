---
name: servicenow-access-renewal
description: >
  Guides the end-to-end ServiceNow / Helpmate flow for renewing or re-requesting
  EXPIRED or EXPIRING access (privileged access, Okta app access, cloud console
  roles, group membership, licenses). Use whenever a user says their access
  "expired", "is expiring", needs "renewal", "re-raise", "request again",
  "extend my access", or references an expiring RITM / access request from the
  Email "Access Expiring" bucket or the Helpmate card. Resolves the catalog item
  from a RITM sys_id or a Helpmate ticket link, fetches the required form fields,
  ASKS the user the relevant questions (enforcing the 6-month validity cap),
  validates with a dry run, and only raises the ticket after explicit confirmation.
  NEVER auto-submits.
---

# ServiceNow Access Renewal Flow

Reliable, safe path to renew/re-request expiring access via the `servicenow` MCP.
The golden rule: **ask the right questions first, validate, confirm, then raise —
never submit a catalog request without the user's explicit go-ahead.**

---

## When to use

- Email dashboard shows an **Access Expiring** item, or Helpmate shows an expiring RITM.
- User says: "my aws ts-uat-approver access expired — raise a new request",
  "renew my PAM access", "re-request cloud console access", "extend for 6 months".
- User pastes a Helpmate/ServiceNow ticket link containing `sys_id=…`.

---

## Tools (all on the `servicenow` MCP)

| Step | Tool | Purpose |
|---|---|---|
| Identify | `get_my_tickets` / `get_ritm` | Find the expiring RITM(s) + their `sys_id` and Cat Item Sys ID |
| Discover fields | `get_catalog_item_form` | Get the catalog item's variables (accepts a **RITM sys_id OR catalog item sys_id** — auto-resolves) |
| Validate (dry run) | `prepare_catalog_request` | Check mandatory fields, enforce the 6-month cap, preview payload — **does NOT raise** |
| Raise | `submit_catalog_request` | Create the RITM — **only after the user confirms** |
| Resolve identity | `lookup_user_sysid` | OHR → ServiceNow sys_id (usually automatic via `requested_for_ohr`) |

---

## The flow (follow in order)

### 1. Identify what is expiring
- If the user gave a **ticket link** (`…sys_id=<hex>…`), take that `sys_id`.
- Otherwise call `get_my_tickets` (state `open`) using the user's **email**, or
  `get_ritm` for a specific RITM number, to find the expiring request(s).
- Capture, per item: the **RITM number**, its **sys_id**, and the **Cat Item Sys ID**.

> Tip: `get_catalog_item_form` and `prepare_catalog_request` accept **either** a
> catalog item sys_id **or** a RITM sys_id — you do not need to manually convert.
> This unblocks the classic "I only have the RITM number, not the item sys_id" case.

### 2. Discover the required questions
- Call `get_catalog_item_form` with the sys_id.
- Read the returned variables: `name`, `label`, `type`, `mandatory`, `choices`,
  and any field flagged **VALIDITY**.

### 3. Ask the user (only what's needed)
- Ask **only the mandatory fields** the user hasn't already provided, in plain language
  using each variable's `label` and `choices`.
- For any **validity / duration / end-date** field, state the policy explicitly:
  > "Access validity can be at most **6 months**. What period would you like (up to 6 months)?"
- Reuse known context to avoid re-asking: prior RITM values (via `get_ticket_variables`
  on the old RITM's sys_id), the user's OHR/email, cloud/platform, account, justification.

### 4. Dry-run validate
- Call `prepare_catalog_request` with the sys_id, the collected `variables`, and
  `requested_for_ohr`.
- If `ready` is false: ask the `questions_to_ask` it lists and fix any
  `validity_issues` (e.g. period > 6 months), then call it again.
- Repeat until `ready: true`.

### 5. Confirm with the user
- Show a concise preview: catalog item name, who it's for, each field value, and the
  validity period. Ask: **"Shall I raise this request?"**
- Do not proceed on assumption — wait for an explicit yes.

### 6. Raise
- Only after confirmation, call `submit_catalog_request` with the exact
  `catalog_item_sys_id`, `variables`, and `requested_for_ohr`.
- Report back the **REQ/RITM number** and a link.

---

## Hard rules

1. **Never auto-submit.** `submit_catalog_request` runs only after an explicit user "yes".
2. **6-month max validity.** If the user asks for longer, explain the cap and offer 6 months.
3. **Ask, don't guess.** Missing mandatory field → ask the user; never invent values.
4. **One request per role/item.** If multiple roles expired (e.g. `ts-prod-pipeline-approver`
   and `ts-uat-pipeline-approver`), handle each as its own request unless the catalog item
   supports multiple in one form.
5. **Reuse, don't re-ask.** Pull prior values from the old RITM (`get_ticket_variables`)
   where possible so the user only confirms/changes what's needed.
6. If the `servicenow` MCP is not connected, guide: **Settings → Extensions → ServiceNow → Connect**
   (per the connections-guide skill). Never ask the user to re-auth if it's already connected.

---

## Example (privileged cloud-console access renewal)

1. User: "My `ts-uat-pipeline-approver` access on AWS expired — raise it again."
2. `get_my_tickets` (email) → finds RITM4503005, Cat Item Sys ID `243d522d1bf43010cbcea8afe54bcb9e`.
3. `get_catalog_item_form("243d522d1bf43010cbcea8afe54bcb9e")` → variables: account, console/platform,
   role, business justification, validity period (VALIDITY).
4. Ask only what's unknown; for validity say the 6-month cap.
5. `prepare_catalog_request(sys_id, variables, requested_for_ohr)` → `ready: true`.
6. Show preview → "Shall I raise this?" → user confirms.
7. `submit_catalog_request(...)` → "Raised **RITM…** for ts-uat-pipeline-approver (valid 6 months)."
