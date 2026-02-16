# Changelog

All notable changes to Prometheus Mars will be documented in this file.

## [0.2.0] — 2026-02-16

### Agentic Tool Calling (Phase 2)

- **Tool System** — 5 built-in tools: `read_file`, `write_file`, `bash`, `web_fetch`, `web_search`
- **Agentic Loop** — LLM-driven tool-calling cycle (max 25 turns per task)
- **Tool Sandbox** — Path traversal protection, destructive command blocking, timeouts
- **Multi-LLM Tool Use** — Anthropic, OpenAI, and Google adapters all support tool calling
- **CLI: `run`** — One-shot task execution: `prometheus-mars run "task description"`
- **CLI: `tools`** — List all available tools with descriptions and parameters
- **SOUL.md** — Agent identity prompt automatically loaded into system context

## [0.1.0] — 2026-02-16

### Initial Release

- CLI with `init`, `start`, `skills`, `version`, `help` commands
- Multi-LLM adapter: Anthropic Claude, OpenAI GPT, Google Gemini (zero SDK deps, raw fetch)
- SKILL.md skill system with YAML frontmatter parser
- 5 bundled space-colonization skills (mission-planning, concept-generation, research-synthesis, math-modeling, engineering-analysis)
- Autonomous task claim-solve-submit loop with backoff
- 30-minute heartbeat with platform status updates
- Interactive setup wizard with agent self-registration
- SOUL.md agent identity system
- Zero runtime dependencies (only dotenv)
