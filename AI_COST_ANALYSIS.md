# AI Cost Analysis (Required)

## Development & Testing Costs

### What was spent during development

CollabBoard uses:

- `OPENAI_RESERVE_USD_PER_CALL=0.003` (reserved before each OpenAI call)
- OpenAI pricing variables from runtime config:
  - `OPENAI_INPUT_COST_PER_1M_USD=0.1`
  - `OPENAI_OUTPUT_COST_PER_1M_USD=0.4`
- Hard app budget guardrail:
  - `OPENAI_HARD_SPEND_LIMIT_USD=10`

As of this submission, the repo does not persist a local ledger of exact paid API calls, token counts, and dollar totals across all external test runs.  
For this reason, the development/test cost section is reported as:

- **Exact API calls:** not centrally logged in this codebase yet  
- **Exact input/output token totals:** not centrally logged in this codebase yet  
- **Exact development spend:** not centrally logged in this codebase yet  
- **Runtime-enforced limit impact:** each call is still capped by reserve policy and hard budget guardrail

**How to validate exact spend externally**

- Pull billing values from OpenAI usage endpoints (preferred).
- Use request logs in Langfuse/OpenAI traces to estimate command-level token counts.
- Export API usage summary for the project period used for grading/demo.

## Production Cost Projections

Assumptions used for projection:

- Model: `gpt-4.1-nano` (OpenAI pricing currently represented by env defaults above).
- Average tokens per command:
  - Input: `200`
  - Output: `300`
  - Total: `500` tokens/command
- Average command rate:
  - Users/Month × Sessions/User/Month × Commands/Session
  - User assumptions:
    - **100 users:** 4 sessions/user/month, 3 AI commands/session
    - **1,000 users:** 8 sessions/user/month, 3 AI commands/session
    - **10,000 users:** 12 sessions/user/month, 3 AI commands/session
    - **100,000 users:** 20 sessions/user/month, 3 AI commands/session

Cost per command:

`(200 / 1,000,000 × $0.1) + (300 / 1,000,000 × $0.4) = $0.00014`

Projected monthly AI API cost:

| Users      | Estimated Sessions/User | Commands (est.) | Estimated Monthly Cost |
| ---------- | ---------------------- | --------------- | --------------------- |
| 100        | 4                      | 1,200           | `$0.17`               |
| 1,000      | 8                      | 24,000          | `$3.36`               |
| 10,000     | 12                     | 360,000         | `$50.40`              |
| 100,000    | 20                     | 6,000,000       | `$840.00`             |

### Projection notes

- Actual spend varies with command complexity. Long prompts and large board reads increase output tokens.
- If command payloads are more complex (or if retries/fallback loops increase), costs can rise materially above this table.
- The current runtime reserve cap (`$0.003`/call) is a guardrail, not an expected cost. Effective per-command spend is typically much lower than the cap.
- `OPENAI_HARD_SPEND_LIMIT_USD=10` plus guardrail store strategy is a **hard budget safety** control; production environments should use a persisted store (`AI_GUARDRAIL_STORE=firestore`) and explicit monitoring to enforce this predictably across instances.

## Additional AI-Related Cost Areas

- **Firebase App Hosting:** infrastructure usage (hosting + server compute).
- **Firestore writes/read amplification:** increases with AI-driven bulk operations.
- **Langfuse:** tracing ingestion and retention (if enabled at higher volume).
- **Testing cost:** paid command suites are on-demand and should be run intentionally only when needed.

## Recommended Cost Control Strategy

1. Keep `AI_GUARDRAIL_STORE=firestore` in production for consistent spend accounting.
2. Keep `OPENAI_RESERVE_USD_PER_CALL=0.003` for a strong default cap.
3. Run strict AI mode with prompt constraints (golden eval + constrained commands) to reduce retries.
4. Export monthly usage from OpenAI + Langfuse and reconcile against `OPENAI_SPEND_LIMIT` signals.
