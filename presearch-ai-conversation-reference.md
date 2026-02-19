# Pre-Search AI Conversation Reference: CollabBoard

Date: 2026-02-16  
Context: AI-assisted pre-search planning session used to complete the project checklist before coding.

## Purpose

This document summarizes the AI conversation used to:

- define project constraints,
- evaluate architecture options,
- capture tradeoffs, and
- produce defensible stack decisions for MVP delivery.

## Conversation Outcome Summary

- Confirmed hard-gate MVP scope and speed-first strategy.
- Selected stack: Next.js monolith on Vercel with Firebase (Auth + Firestore) and OpenAI for AI commands.
- Defined collaboration requirements: real-time object sync, visible multiplayer cursors, low latency expectations.
- Established auth/permission model: user-owned boards (max 3), open-edit default, optional restricted editor allowlist.
- Set deployment and ops posture: push-to-deploy, managed services first, minimal CI complexity for MVP.
- Set security/testing guardrails appropriate for deadline: strict server-side authorization checks, basic AI rate/token limits, targeted tests on hard-gate collaboration flows.
- Documented vendor lock-in posture: accepted for speed, mitigated with thin adapters/wrappers.

## Key Tradeoff Decisions Captured

- Managed services vs custom infra: chose managed for delivery speed.
- Simplicity vs extensibility: chose monolith/REST now, defer complexity.
- Coverage percentage vs behavior confidence: no strict % target; validate all hard-gate behaviors.
- Cost control depth: basic but explicit AI usage guardrails for MVP.

## Representative Prompt Themes Used

- Constraint clarification: scale, budget, timeline, compliance, and skill limits.
- Architecture narrowing: hosting, auth, data layer, API style, frontend rendering mode.
- Risk review: security pitfalls, misconfigurations, and dependency strategy.
- Delivery readiness: project structure, naming/style, testing scope, tooling/debugging setup.

## Artifacts Produced

- Completed checklist: `/Users/patrick/Code/gauntlet/1-collab-board/presearch-checklist-answers.md`
- This reference document: `/Users/patrick/Code/gauntlet/1-collab-board/presearch-ai-conversation-reference.md`

## Notes

- The planning session was intentionally pragmatic and MVP-focused to satisfy the 24-hour hard gate.
- If needed for submission packaging, this summary can be expanded into a fuller transcript-style log.
