# OpenClaw Sales Assistant Prototype Runbook

Goal: Build a small, working prototype that can update a CRM-like target by chat.
Scope: Create deals, move stages, log notes, schedule follow-ups.

## 0) Decisions (locked for this run)

- CRM target: Notion
- Chat channel: Slack (Socket Mode)
- Keys: ready (do not store in repo)
  - Notion: API key stored at `~/.config/notion/api_key`
  - Slack: set `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` in the gateway environment

## 1) Success criteria

- The assistant can perform the four core actions with confirmations.
- Actions map directly to CRM fields (no manual edits).
- A short demo script works end-to-end in one chat session.

## 2) Setup OpenClaw (gateway + Slack)

1. Run the onboarding wizard:
   - `openclaw onboard`
2. Pick a model provider and authenticate.
3. Enable Slack via Socket Mode (no public webhook needed).
4. Verify the agent responds.

## 3) Prepare Notion (keys + database)

1. API key is already stored at `~/.config/notion/api_key`.
2. Run the seed script to create the databases under the parent page.
3. Share the databases with the integration if the seed script does not.
4. Record the database identifiers:
   - `database_id` for creating pages
   - `data_source_id` for queries

Database IDs (seeded on 2026-02-02):

- Deals
  - database_id: 358755a4-2744-445a-bbd7-2f97a533e1b3
  - data_source_id: c66364f8-f648-4e08-8777-6f35e46340a4
- Contacts
  - database_id: 05a20da6-4e13-4b7f-89cd-47e4cd51d528
  - data_source_id: e627250f-b8c3-4c69-87a0-e01dd8bc102b
- Activities
  - database_id: e628f8ad-53b8-493c-a534-e7ce6a86849c
  - data_source_id: e78132da-17f0-4105-bbc0-ac50dd50d769

Tip: The bundled Notion skill expects `NOTION_API_KEY` or the `~/.config/notion/api_key` file.

## 4) Define the CRM schema (Notion properties)

Use the same field names across all actions:

- Deal Name
- Company
- Stage
- Value
- Owner
- Next Follow-Up
- Notes

Recommended Notion property types:

- Deal Name (Title)
- Company (Rich text)
- Stage (Select)
- Value (Number)
- Owner (Rich text or Person)
- Next Follow-Up (Date)
- Notes (Rich text)

## 5) Wire actions to Notion (bundled skill)

Use the bundled Notion skill at `skills/notion` and map each action:

- Create deal → Create a page in the database with properties filled.
- Move deal → Update the page `Stage` select.
- Log note → Append a paragraph block to the deal page.
- Schedule follow-up → Update `Next Follow-Up` date.

Validate API access:

- Query the data source for existing deals.
- Create a page with properties.
- Update a page property.
- Append a block to a page.

## 6) Slack setup (keys ready)

Create a Slack app and enable Socket Mode:

- Bot token: `SLACK_BOT_TOKEN`
- App token (Socket Mode): `SLACK_APP_TOKEN`

Set these in the environment for the gateway/agent process (do not commit).

## 7) Agent instructions (behavioral rules)

Add these rules to `AGENTS.md` in the agent workspace:

- Always ask for missing required fields.
- Always confirm the action with the updated fields.
- Use the CRM action tool first; do not explain unless asked.
- If a deal does not exist, create it before adding notes or follow-ups.

## 8) Demo script

Run this in the chat channel:

1. Create: "Create a deal for Acme renewal, $12k, stage qualified, owner Alex."
2. Move: "Move Acme renewal to negotiation."
3. Note: "Log note: needs security review by Friday."
4. Follow-up: "Schedule follow-up next Wednesday at 3pm."

Expected:
- Each action is performed in Notion.
- The assistant responds with a short confirmation + updated fields.

## 9) Observations log

Capture results after each run:

- What worked (actions, speed, accuracy)
- What broke (missing fields, API errors, ambiguous inputs)
- Fix list (prompt changes, skill updates, schema tweaks)

## 10) Next steps (after prototype is working)

- Swap Notion for a real CRM API.
- Add a webhook trigger for inbound system events.
- Add a second agent for outbound follow-ups and reminders.
