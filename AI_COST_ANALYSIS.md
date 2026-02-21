# AI Cost Analysis (Required)

## Development & Testing Costs

Track and report your actual spend during development:

- LLM API costs (OpenAI/Anthropic/etc.):
  - Provider:
  - Total Spend:
  - Billing period:

- Total tokens consumed:
  - Input tokens:
  - Output tokens:
  - Total:

- Number of API calls made:
  - Total calls:

- Additional AI-related costs:
  - Embeddings/hosting/vector or other tooling:
  - Amount:

## Production Cost Projections

Assumptions:

- Avg AI commands per user per session: `___`
- Avg sessions per user per month: `___`
- Avg input tokens/command: `___`
- Avg output tokens/command: `___`
- Cost per 1M input tokens: `$___`
- Cost per 1M output tokens: `$___`

Estimated AI spend per month:

| Users | Est. Monthly AI Commands | Est. Monthly Cost |
| --- | --- | --- |
| 100 | `___` | `$___` |
| 1,000 | `___` | `$___` |
| 10,000 | `___` | `$___` |
| 100,000 | `___` | `$___` |

## Notes and Guardrails

- Hard spend cap in current app:
- Reserve amount per call (if enabled):
- Production-store selection (`memory` vs `firestore`):
- Cost control strategy for production:

## Cost Estimate (Best-Effort Fill)

Using current defaults in this repo (placeholder baseline), one realistic first pass estimate is:

- Per-command cost assumption: `$0.00014` (example estimate for ~200 input / 300 output)
- 100 users / month estimate: `$___`
- 1,000 users / month estimate: `$___`
- 10,000 users / month estimate: `$___`
- 100,000 users / month estimate: `$___`
