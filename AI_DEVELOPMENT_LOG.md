# AI Development Log (Required)

## Project Context

- Project: Collabboard - an AI-assisted multi-user whiteboard with deterministic and LLM command execution paths
- Date Range: Feb 17-Feb 21, 2026
- Author / Team: Patrick Lynch (human lead) + Codex coding agents (GPT-5.3 Codex / Spark variants for implementation)
- Runtime version: Next.js App Router on Node.js (local + Firebase App Hosting backend runtime)
- AI model/runtime stack: OpenAI Agents SDK (`@openai/agents`) using `gpt-4.1-nano` in strict mode, with deterministic/MCP fallback paths kept for resilience and lower-cost runs

## Tools & Workflow

### AI Coding Tools Used
- Tool: Codex coding agent (GPT-5.3 Codex + Spark)
- How integrated: Prompt-driven feature specs, direct repo edits, rapid fix loops, and scripted test/build runs
- Role in code design: Primary implementation engine for feature work, tracing plumbing, schema expansion, and test scaffolding
- Used via Codex app primarily. Also Codex CLI through Terminals
- ChatGPT Pro subscription for access to Codex, $200/mo
- Terminals in Cursor, VS Code, and Ghostty

- Tool: OpenAI Agents SDK (`@openai/agents`)
- How integrated: Runtime backend for `/api/ai/board-command` in `agents-sdk` mode
- Role in code design: Happy-path command planning/tool-calling for natural language board edits

- Tool: Langfuse + OpenAI tracing/logs
- How integrated: Request/operation-level spans with trace ID correlation
- Role in code design: Debuggability, incident triage, and command-level auditability

- Tool: Playwright + Vitest
- How integrated: On-demand paid OpenAI matrix tests plus deterministic/fallback coverage
- Role in code design: Regression detection for required AI capabilities and command reliability

- Tool: Cursor
- How Integrated: I started using cursor as my IDE, set it up The way Zac demo'd in offic hours one day
- Role: minor. I plan to upgrade to pro and use it to throw other LLMs at the codebase over the weekend

### Development Workflow
- How prompts were generated: Human lead supplied high-signal implementation briefs (PRD/plan blocks), then narrowed scope by priority and deployment urgency
- How outputs were reviewed: Review loop was command-first and behavior-first (live command results, trace validation, then code-level inspection)
- How changes were validated: Fast loop used `npm run build` and targeted unit tests; paid OpenAI e2e suites were intentionally run on demand only by human operator

## MCP Usage

- MCP framework(s) used: `@modelcontextprotocol/sdk` over streamable HTTP transport
- MCP endpoints/tools enabled: `command.plan` and `template.instantiate` style tool calls in deterministic pipeline
- What MCP enabled: Structured, schema-constrained planning and template generation without paid LLM dependency for core fallback paths
- Why MCP was used (vs not used): Used for deterministic reliability and cost control; not used as sole path because open-ended natural-language quality was better on OpenAI Agents for happy-path UX
- Failure and fallback behavior: Timeout/schema failures in MCP or planner paths trigger controlled fallback or strict-mode errors (depending on `AI_PLANNER_MODE`)

## Effective Prompts (3-5)

1. The prompt to create a Main Developer:

    You are the main developer agent on this codebase. You are tasked with completing the final submission branch of this project in as usable, clean, functional, and most importantly, useful, state possible.

    Everything must be ready to ship by end of day Friday (tomorrow).

    You have access to skills, especially pdf and a react typescript developer skill, among others. Acquant yourself with your abilities and try to finish this project as fast as possible while still delivering a good result.

    And coach me as the human who has to explain our technical decisions.

    I'm also your usability tester.  Every time we add a new feature or command, I want you (aside from setting up nice playwright e2e tests) to tell me when to open a browser and use the app

    Ask me any follow up questions. Read the .agents folder to get up to speed, feel free to edit everything in .agents to help you work better and faster. I'm just here to help and steer if I think we're headed for trouble.

    And good luck! You'll be great!

2. Queueing up Codex to keep her busy worked well:


     add this to the queue of work:

      I don't see tracing in Langfuse. Also I don't even know where to look for tracing in openAI

      Also, note the blue rectangle was not created at the right position.

      Let's fix that.

      Finally, make the lines at x = 0 and y = 0 light pink instead of blue, so it's easier to orient to the center of the canvas

3. This one did well for me early:

    "I want to refactor the individual board page to make better use of space.

    let's have a header bar with the board title in the center, a left pointing arrow on the left side that says "Back to My Boards" on hover, and a profile image on the right side that links to an account settings page (small circle profile icon, the way google's apps do it)

    let's move the toolbar to the left side of the screen, as a left side panel, not on top of the canvas. we lose "relocate the toolbar" functionality.

    let's have the online presence be in the right side panel

    the board canvas should be in the middle. make each side panel collapsable into a drawer.

    there should be no margin between the side panels an the canvas, just a 2px line in w/e color makes sense

    there should be a footer (also full page width), below the canvas and the side panels. it will eventually (but not now) have a text bot to chat with an ai agent. things like (rearrange all the sticky notes, rearrange only the red sticky notes, draw a swot diagram for a planning meeting, clear every shape off the board).

    the ai chat drawer should be resizable vertically, but default to whatever seems reasonable on a retina monitor at full resolution

    for now, allow the user to type messages to the ai agent, but print back "AI agent coming soon!" after each request"


## Code Analysis

- AI-generated code: `99% +`
- Hand-written code: `< 1%`
- How that estimate was made: `git log --since='2026-02-17' --numstat --pretty=tformat: -- . ':(exclude)package-lock.json'` plus manual adjustment for planning/docs-only commits

## Strengths

From Codex:

- Strength: Very fast implementation throughput when requirements were explicit (plan blocks with acceptance criteria and file targets)
- Strength: Strong at repetitive refactor/validation tasks (schema updates, test scaffolding, route wiring, env/readiness probes)
- Strength: High utility for debugging integration issues with observability (Langfuse/OpenAI trace checks, error-path hardening)

From Patrick:
- AI is amazing at prodicing code quickly. I'm in awe. Head spinning.
- I've used 123,445 tokens through OpenAI's api platform. I'm at about $.01 there of my $20 budget.
- Codex Spark is a lot faster. I need to use it more.
- I created a custom skill for Codex. That was fun. React Next.js Developer skill. It uses it for some taskes automatically. That's cool.
- It's fun in spite of the suffering.

## Limitations

From Codex:
- Limitation: Can over-optimize toward local correctness while UI/UX edge behavior still needs live human verification
- Limitation: Occasionally introduced brittle output formatting (doc/PDF generation path required correction)
- Limitation: Prompt ambiguity around “fallback vs strict” caused temporary behavior mismatches until policy was explicitly locked

From Patrick:
- Codex 5.3 Extra High can be slow. I didn't get every feature I wanted in. I'm disappointed I didn't switch to Spark earlier for more.
- It's hard to manage multiple agents. I have to get better.


## Key Learnings


From Codex:
- Lesson: Best results came from strict “decision-locked” plans with clear scope boundaries and explicit acceptance criteria
- Lesson: OpenAI strict mode + deterministic fallback is a practical production pattern when cost and reliability both matter
- Lesson: Tracing must be validated in deployed environment early; local success does not guarantee cloud secret/config correctness

From Patrick:
- I can get a lot done with AI, but there's a lot to learn.
- Spark is better use of time.
- I wanted to try other LLMs, but didn't have time.
- I'm going to keep trying my best, and work on this more for final submission.

## Reflection for Grading

From Codex:
- What worked especially well: Golden-eval-driven development, on-demand paid test scripts with `:PAID` suffix, and trace-first debugging discipline
- What required the most iteration: Live tracing visibility, planner mode behavior, and command intent precision for layout/batch operations
- What you would keep for production: OpenAI Agents SDK strict path, deterministic fallback for resilience, hard spend guardrails, and mandatory tracing correlation IDs per command

From Patrick:
- I may be in over my head. Trying to do well. There's much to learn.

From Patrick, Sunday, 23:11

- I've done what I could to respond to the AUDIT and MITIGATIONS suggested after early submission Friday.
- Refactored out god components, 300 line cap for source code
- Did what we could to mitigate performance impacts without time for a full rewrite
- There's still much to do, but I'm going to submit and demo what I have.