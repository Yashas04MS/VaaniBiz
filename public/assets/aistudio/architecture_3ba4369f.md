# VaaniBiz – System Architecture

> Your Business. Your Voice. Your AI.

Version 1.0 · 21 Nov 2026
Stack: Next.js (server + web), Supabase, Gemini, Agora Conversational AI, Murf Falcon

---

## 1. Goals and constraints

- Merchants run their business by speaking English, Hindi or Kannada. No forms, no menus.
- Every business action (stock update, sale, purchase order, reminder) is a real, verifiable database write. No mocked integrations.
- Secrets and the Supabase service-role key exist only on the server.
- Sensitive actions (placing orders, large stock deductions, deletes) require explicit approval.
- Failures (ASR miss, LLM error, DB error) are handled and spoken back honestly.

## 2. Components

| Component | Role | Notes |
|---|---|---|
| Agora Conversational AI Engine | Real-time voice transport, VAD, ASR, turn-taking, barge-in; orchestrates LLM and TTS | Started/stopped via Agora REST API using Customer ID/Secret |
| Gemini | Understands requests, reasons, calls tools | Reached only through our `/api/llm` endpoint |
| Murf Falcon | Text-to-speech | Voice set via `MURF_VOICE_ID` |
| Supabase | Postgres, Auth, RLS, Realtime | System of record |
| Next.js | Web app (PWA), API routes, token minting, cron endpoints | Hosted at `PUBLIC_BASE_URL` (must be reachable by Agora) |

## 3. High-level diagram

```
+--------------------+       RTC audio        +---------------------------+
|  Merchant browser  | <--------------------> |  Agora RTC + Conv. AI     |
|  (PWA, Agora SDK)  |                        |  Engine (agent uid)       |
+---------+----------+                        +------+------------+-------+
          | HTTPS (session JWT)                      |            |
          v                                          | ASR text   | TTS audio
+---------------------------+   LLM request          v            ^
|   Next.js server (API)    | <------------ /api/llm           Murf Falcon
|  /api/agent/start|stop    |  (Bearer LLM_SHARED_SECRET)
|  /api/llm  (tool loop)    |
|  /api/approvals           |-----> Gemini (function calling)
|  /api/cron/reminders      |
+------------+--------------+
             | service role (server only)
             v
+---------------------------+
| Supabase Postgres + RLS   |
| Auth, Realtime, pg_cron   |
+---------------------------+
```

## 4. Voice request flow

1. Merchant signs in (Supabase Auth) and taps the mic.
2. Browser calls `POST /api/agent/start`. Server verifies session, creates a channel, mints Agora RTC tokens (user + agent UID `AGORA_AGENT_UID`) with `AGORA_APP_CERTIFICATE`, then calls the Agora Conversational AI REST API (basic auth with `AGORA_CUSTOMER_ID`/`AGORA_CUSTOMER_SECRET`).
3. The start payload configures: ASR with language hints (en, hi, kn); LLM as a custom OpenAI-compatible endpoint `PUBLIC_BASE_URL/api/llm?session=<id>` with `LLM_SHARED_SECRET` as its key; Murf as TTS with `MURF_API_KEY` and `MURF_VOICE_ID`; a greeting in the merchant's language.
4. Browser joins the channel with the Agora SDK and publishes mic audio.
5. Agora transcribes speech and posts the conversation to `/api/llm`. The route checks the shared secret, resolves the session to a merchant, and runs the Gemini tool loop.
6. The reply text streams back; Agora sends it to Murf and plays audio. Barge-in is handled by Agora.
7. `POST /api/agent/stop` ends the agent on hang-up or timeout.

The merchant identity always comes from the server-side session record, never from model output.

## 5. Agent loop (`/api/llm`)

1. Build the system prompt: persona, language policy, safety rules, date, currency, units, shop name.
2. Call Gemini with conversation + tool declarations.
3. For each function call: validate arguments (Zod), check risk level, execute against Supabase scoped by `merchant_id`, return the result to Gemini.
4. Bounded loop (e.g. max 6 steps).
5. Sensitive tools are not executed. Insert an `approvals` row (`pending`), tell Gemini "awaiting approval", and have the agent ask the merchant to confirm with a read-back.
6. On "yes" (voice or tap), `confirm_action(approval_id)` executes the stored, already-validated payload. The model cannot change it at confirmation time.
7. Every tool call, result and error is written to `agent_runs` / `audit_log`.
8. Final answer: short, spoken-style, in the merchant's language, numbers taken only from tool results.

## 6. Tool catalogue

| Tool | Purpose | Risk |
|---|---|---|
| `search_products` | Fuzzy match spoken name via en/hi/kn aliases | Read |
| `get_stock` | Quantity for one or many products | Read |
| `list_low_stock` | Items at or below reorder level | Read |
| `adjust_stock` | Add/deduct with reason | Write; sensitive above threshold |
| `record_sale` | Sale lines, stock deduction, payment mode / udhaar | Write |
| `get_sales_summary` | Day/week/month totals, top items, comparison | Read |
| `compare_suppliers` | Rank by latest price, lead time, reliability | Read |
| `draft_purchase_order` | Create draft PO | Write (draft) |
| `place_purchase_order` | Finalize and send | Sensitive – approval |
| `create_reminder` | Payment, delivery, task | Write |
| `list_reminders` | Upcoming/overdue | Read |
| `complete_reminder` | Done or snooze | Write |
| `confirm_action` / `cancel_action` | Resolve approval | Control |

Sensitive policy: placing orders, deletes, stock changes above a configurable quantity/value, supplier price changes, any message to an external party.

## 7. Data model

| Table | Key columns |
|---|---|
| `merchants` | id (= auth uid), shop_name, preferred_language, currency, timezone |
| `products` | id, merchant_id, name, unit, price, cost, reorder_level, category |
| `product_aliases` | product_id, alias, language (en/hi/kn) |
| `inventory` | product_id, quantity, updated_at |
| `stock_movements` | id, product_id, delta, reason, ref_type, ref_id, created_at |
| `sales`, `sale_items` | header (total, payment_mode, customer_name) + lines |
| `suppliers` | id, merchant_id, name, phone, lead_time_days, reliability_score |
| `supplier_prices` | supplier_id, product_id, price, valid_from |
| `purchase_orders`, `po_items` | status: draft, pending_approval, placed, received, cancelled |
| `reminders` | type, due_at, status, related_id, channel |
| `approvals` | id, merchant_id, tool_name, payload jsonb, status, expires_at, decided_at |
| `agent_sessions` | id, merchant_id, channel, language, started_at, ended_at |
| `agent_runs`, `audit_log` | tool, args, result, error, latency, session_id |

Rules:
- Every table has `merchant_id` with RLS `merchant_id = auth.uid()`.
- All stock changes go through one SQL function `apply_stock_movement` (insert movement + update inventory in one transaction; reject negative stock unless allowed).
- Idempotency keys on sales and approvals prevent double writes.

## 8. Security

| Variable | Used for | Allowed location |
|---|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini calls | Server only |
| `AGORA_APP_ID` | Public SDK identifier | May go to browser |
| `AGORA_APP_CERTIFICATE` | Mint RTC tokens | Server only |
| `AGORA_CUSTOMER_ID` / `AGORA_CUSTOMER_SECRET` | Agora REST auth | Server only |
| `AGORA_AGENT_UID` | Agent's UID in channel | Server |
| `MURF_API_KEY`, `MURF_VOICE_ID` | TTS | Server only |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser Supabase client (RLS) | Browser OK |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side privileged writes | Server only |
| `PUBLIC_BASE_URL` | URL Agora calls for `/api/llm` | Server config |
| `LLM_SHARED_SECRET` | Authenticates Agora → `/api/llm` | Server only |
| `CRON_SECRET` | Authenticates scheduler → `/api/cron/*` | Server only |
| `TOKEN_ENC_KEY` | AES-256-GCM for stored tokens/secrets | Server only |

Controls:
- Only `NEXT_PUBLIC_` variables reach the client. CI fails if a server secret name appears in client code.
- `/api/llm` uses constant-time secret comparison and per-session rate limits.
- `/api/cron/*` requires `Authorization: Bearer CRON_SECRET`.
- Service-role client is created only in server modules and always filters by `merchant_id` from the session.
- Tool arguments validated and bounded. Text from products/customers is treated as data (prompt-injection defence); sensitive tools need a stored approval.
- Append-only audit log.

## 9. Multilingual strategy

- Language detected per turn; reply follows the merchant. Hinglish/Kanglish expected.
- ASR: language hints for en, hi, kn. Verify Kannada accuracy with your chosen ASR vendor in Agora; label Kannada beta if weak.
- TTS: verify the chosen Murf voice supports Hindi and Kannada before promising it; otherwise fall back and tell the merchant.
- `product_aliases` maps "cheeni", "sakkare", "sugar" to one product.
- Numbers, units and currency are normalized server-side ("paanch kilo" → 5 kg).

## 10. Failure handling

| Failure | Behaviour |
|---|---|
| ASR unclear | Ask a short clarifying question |
| Ambiguous product | Offer top 2–3 matches |
| Gemini timeout/error | Retry once, apologise plainly, nothing written |
| DB write fails | Rollback, say what did not happen, log |
| Approval expires (~5 min) | Cancel and tell the merchant |
| Session drops | Pending approvals remain; resume from app |
| Duplicate command | Idempotency key blocks double write |

Success is always confirmed from the database result, never assumed.

## 11. Deployment topology

- Next.js on Vercel (or any Node host) with a public HTTPS `PUBLIC_BASE_URL`.
- Supabase hosted project; migrations via Supabase CLI.
- Scheduler (Vercel Cron, Supabase `pg_cron` + `pg_net`, or similar) calls `/api/cron/reminders` with `CRON_SECRET`.
- Local development: expose localhost with a tunnel so Agora can reach `/api/llm`.

## 12. Verification ("no fake integrations")

A protected `/admin/health` page shows last successful call and timestamp for Agora (agent join), Gemini (tool loop), Murf (audio produced) and Supabase (write/read), taken from real logs.
