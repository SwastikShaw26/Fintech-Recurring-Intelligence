# Skill Selection Report: Agent Skills & Evaluation Tooling for FinSight

**System**: FinSight Autonomous Multi-Agent Engineering Intelligence System  
**Author**: Lead Systems Architect & Multi-Agent Orchestrator  
**Date**: November 11, 2026  
**Repository**: `D:\Projects\Fintech-Recurring-Intelligence`  
**Antigravity Environment**: Antigravity 2.0 / Windows 11 AMD64 (Sandbox Enabled, Local Python 3.12.6, Node 20 / npm 11.20)

---

## 1. Executive Summary

To build an autonomous, reusable, and evidence-driven multi-agent evaluation framework for FinSight, we performed source-backed research and operational qualification across five candidate external skill/tool ecosystems, alongside Antigravity's native marketplace and customization engine:
1. **Superpowers** (`https://github.com/obra/superpowers`)
2. **Trail of Bits Skills** (`https://github.com/trailofbits/skills`)
3. **Sentry Skills** (`https://github.com/getsentry/skills`)
4. **Playwright CLI / Browserbase** (`https://github.com/microsoft/playwright-cli`)
5. **DeerFlow** (`https://github.com/bytedance/deer-flow`)

Each candidate was evaluated against our 5 core functions: **Research**, **Audit**, **Test**, **Judge**, and **Multi-Agent Orchestration**, taking into account our Windows 11 host, offline/isolated sandbox constraints, dependency requirements, and security boundaries.

---

## 2. Candidate Evaluation Matrix

| Candidate Skill / Tool | Primary Capabilities | Compatibility with Antigravity / Windows | Installation Method & Requirements | Security & Privacy Impact | Overlap with Native Capabilities | Verdict & Decision |
|---|---|---|---|---|---|---|
| **Superpowers** (`obra/superpowers`) | Software engineering workflow booster, systematic review, testing scaffolds | High. Available in Antigravity Marketplace (`antigravity-plugins-partners/plugin/superpowers`). | Marketplace Plugin or YAML skill definition. | Low risk. Operates on local repository workspace. | High overlap with Antigravity native subagent & skill system. | **Adopted via Native Architecture**: Adapted core systematic review and adversarial testing rubrics directly into `.agents/skills/`. |
| **Trail of Bits Skills** (`trailofbits/skills`) | Security auditing, codeql/semgrep integration, threat modeling, vulnerability heuristics | Moderate to Low on Windows Sandbox without pre-installed heavy binary dependencies (Slither, Semgrep, CodeQL). | Requires external binary toolchain & network installation blocked in default sandbox. | Low to Moderate. Scans code for vulnerability signatures. | Complements manual/static code audits. | **Blocked / Replaced**: Heavy external binaries cannot be installed in default sandbox. Replaced with custom native AST and static security auditing rules in `finsight-security-audit`. |
| **Sentry Skills** (`getsentry/skills`) | Production error tracking, runtime triage, stacktrace analysis | High. Available in Antigravity Marketplace (`antigravity-plugins-partners/plugin/sentry`). | Requires active Sentry DSN, project API token, and cloud network access. | High data sensitivity if live customer financial logs are forwarded to cloud. | Low overlap, but FinSight currently operates in synthetic offline mode. | **Excluded for Evaluation**: FinSight has no live Sentry DSN configured; external telemetry violates offline financial privacy constraint. |
| **Playwright CLI / Browserbase** (`microsoft/playwright-cli`) | Headless browser execution, end-to-end DOM testing, visual regression | Moderate. Node/npm installed, but Playwright browser binaries require separate download (`npx playwright install`). | Requires downloading multi-hundred MB Chromium/Firefox binaries outside sandbox. | Medium risk if accessing untrusted web pages; safe locally. | Browserbase plugin (`antigravity-plugins-partners/plugin/browse`) available in marketplace. | **Integrated Locally / Documented Blocker**: Frontend build & lint validated via Vite & ESLint; Playwright browser binary download blocked in sandboxed network; browser verification verified via static DOM review & built assets. |
| **DeerFlow** (`bytedance/deer-flow`) | Multi-agent deep research and workflow framework | Low compatibility. Heavy standalone external Python framework requiring external LLM API endpoints. | Complex Python virtualenv setup, external OpenAI/Anthropic API keys. | High risk if sending financial transactions or code to non-compliant external APIs. | Subsumed entirely by Antigravity native subagents (`invoke_subagent`, `define_subagent`) and swarm system. | **Rejected**: Redundant, architecturally incompatible, and introduces external API dependencies. |

---

## 3. Verified Native Antigravity Tooling & Skill Inventory

Antigravity provides comprehensive built-in customization capabilities (`agy-customizations`, `define_subagent`, `invoke_subagent`, and `manage_subagents`). Rather than introducing brittle external orchestration wrappers, we implemented the evaluation architecture using **Native Antigravity Customizations**:

1. **Workspace Agent Customizations Directory**:
   - Registered under `.agents/skills/` and `.agents/agents/` in accordance with the Antigravity Customization System specification (`agy-customizations`).
2. **Dedicated Modular Skills**:
   - `finsight-research`: Financial domain and algorithm literature investigation.
   - `finsight-code-audit`: Architecture, code smells, coupling, and maintainability.
   - `finsight-security-audit`: OWASP Top 10, data privacy, secrets, and injection vulnerabilities.
   - `finsight-testing`: Test discovery, test execution, adversarial edge-case analysis.
   - `finsight-judge`: Independent critical cross-examination and weighted scorecard generation.
   - `finsight-full-review`: The master entry point coordinating all 5 roles.
3. **Execution Runtime Discovery**:
   - Host Python: Python 3.12.6 at `D:\Programs\Python\Python312\python.exe`.
   - Node.js runtime: v20.18.0 with npm 11.20.0.
   - Frontend bundler: Vite 8.3.5 / React 19 / TypeScript 5.9.

---

## 4. Selection Conclusion & Next Steps

All selected evaluation mechanisms run completely inside the secure workspace environment, produce deterministic, verifiable markdown and CSV artifacts, and do not compromise user privacy or system security.

