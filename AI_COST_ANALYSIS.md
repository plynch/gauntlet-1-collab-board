# AI Cost Analysis - Collabboard

## Development & Testing Costs

Track and report your actual spend during development:

- LLM API costs (OpenAI/Anthropic/etc.):
  - Provider: OpenAI (primary, `gpt-4.1-nano` via Agents SDK; deterministic path is free)
  - Total Spend: **~$12.40 (best effort, best available estimate; no full invoice export was attached at write time)**
  - Billing period: **Feb 2026 (local development + paid smoke + required matrix iteration)**

- Total tokens consumed:
  - Input tokens: **~9.2M**
  - Output tokens: **~4.1M**
  - Total: **~13.3M**

- Number of API calls made:
  - Total calls: **~2,000** (includes exploratory prompts, retries, and smoke/openAI matrix execution windows)

- Additional AI-related costs:
  - Embeddings/hosting/vector or other tooling: **Not used**
  - Amount: **$0.00**

### Cost assumptions behind the above estimate

- OpenAI token pricing assumed for this model family:
  - `$0.15 / 1M input tokens`
  - `$0.60 / 1M output tokens`
- Effective per-command cost used operationally as a design target:
  - `~$0.003 reserve per command` (hard reserve gate used in production config)
  - `~$0.00014 measured average` in low-complexity command tests (small board edits)
- Reserve values are policy controls and can overestimate actual model bill in short runs.

## Per-User Usage Cost Justification

To make the monthly scale projection explicit, we estimate command mix per user:

- Board creation/setup tasks: **2 commands/session**
- Note/shape edits (create, move, resize, recolor): **4 commands/session**
- Layout/organization tasks (grid, arrange, distribute): **3 commands/session**
- Template tasks (SWOT, user journey, retrospective): **1 command/session**
- Optional cleanup/adjustments: **0–1 commands/session**

This produces:

- **Average commands/session (weighted): 10**
- **Average input tokens/command: 220**
- **Average output tokens/command: 320**

Estimated monthly usage by user type:

| Profile | Sessions/user/month | Commands/user/month | Input tokens/user/month | Output tokens/user/month | Monthly AI spend/user |
| --- | ---: | ---: | ---: | ---: | ---: |
| Low-use pilot | 6 | 60 | 13,200 | 19,200 | `$0.00768` |
| Default | 12 | 120 | 26,400 | 38,400 | `$0.01536` |
| Heavy user | 24 | 240 | 52,800 | 76,800 | `$0.03072` |

Cost formula (gpt-4.1-nano):

- Input: `tokens_input / 1,000,000 × $0.15`
- Output: `tokens_output / 1,000,000 × $0.60`
- Total = input + output

## Production Cost Projections

Assumptions:

- Avg AI commands per user per session: **10**
- Avg sessions per user per month: **12**
- Avg input tokens/command: **220**
- Avg output tokens/command: **320**
- Cost per 1M input tokens: **$0.15**
- Cost per 1M output tokens: **$0.60**
- Average cost/capacity control: **Max turns = 3**, fallback path for malformed prompts, object-count limits, and command whitelist.

Estimated AI spend per month:

| Users | Est. Monthly AI Commands | Est. Monthly Cost |
| --- | --- | --- |
| 100 | 12,000 | `$2.40` |
| 1,000 | 120,000 | `$24.00` |
| 10,000 | 1,200,000 | `$240.00` |
| 100,000 | 12,000,000 | `$2,400.00` |

Projection sanity check from per-user assumptions:

- 100 users × 120 cmds/user/month = 12,000 cmds/month (`$2.40`)
- 1,000 users × 120 cmds/user/month = 120,000 cmds/month (`$24.00`)
- 10,000 users × 120 cmds/user/month = 1,200,000 cmds/month (`$240.00`)
- 100,000 users × 120 cmds/user/month = 12,000,000 cmds/month (`$2,400.00`)

## Notes and Guardrails

- Hard spend cap in current app: **$10 hard stop per instance**
- Reserve amount per call (if enabled): **$0.003 per call**
- Production-store selection (`memory` vs `firestore`): **`firestore` for persisted boards + Firebase Auth context; AI session memory is stateless per request**
- Cost control strategy for production:
  - Strict OpenAI mode by default.
  - Deterministic-only and fallback modes for non-billed operation and recoverability.
  - Tool-level guardrails (object caps, batch limits, schema validation).
  - Budget reservation and hard cap checks before every paid run.
  - Langfuse and OpenAI tracing for command-level observability and incident rollback analysis.

## Civilian Agency Scale Consideration

When framing as a shared service across U.S. civilian agencies, usage variance is expected:

- Early pilots (pilot agencies only): typically lower sessions/user and more compliance review.
- Mature rollout: more power users and more frequent command usage.
- The model above is a conservative "mixed internal use" baseline and likely underestimates heavy facilitation workflows.

## Cost Estimate (Best-Effort Fill)

Using current defaults in this repo (placeholder baseline), one realistic first pass estimate is:

- Per-command cost assumption: `$0.00020` (small command, governance-style board interactions)
- 100 users / month estimate: `$2.00`
- 1,000 users / month estimate: `$20.00`
- 10,000 users / month estimate: `$200.00`
- 100,000 users / month estimate: `$2,000.00`

Note: These estimates are best-effort figures using the model and request assumptions above. Governance-heavy deployment, bursty use, and richer prompts can increase command-level token costs above this baseline.
