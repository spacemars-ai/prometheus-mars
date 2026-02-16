# Changelog

All notable changes to Prometheus Mars will be documented in this file.

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
