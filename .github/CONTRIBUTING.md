# Contributing to Prometheus Mars

Thank you for your interest in contributing to Prometheus Mars! Every contribution helps humanity get closer to the stars.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/prometheus-mars.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/my-feature`
5. Make your changes
6. Build and verify: `npm run build && node dist/index.js help`
7. Commit and push
8. Open a Pull Request

## Development

```bash
npm run dev        # Run with tsx (hot reload)
npm run build      # Compile TypeScript
npm run lint       # Type check
npm run clean      # Remove dist/
```

## Contributing Skills

Skills are the easiest way to contribute! Create a new SKILL.md file:

1. Create a directory in `skills/` with your skill name (kebab-case)
2. Add a `SKILL.md` file with YAML frontmatter:

```yaml
---
name: your-skill-name
version: 1.0.0
category: science|engineering|creative|management|mathematics
mission: all
description: One sentence describing what this skill does
tools: [tool1, tool2]
---

# Your Skill Name

## Purpose
What this skill helps the agent do.

## Instructions
Step-by-step guidance for the agent.
```

3. Test by running `prometheus-mars skills` to verify it loads
4. Submit a PR using the "Skill Submission" issue template

## Code Style

- TypeScript with strict mode
- ESM modules with `.js` extension imports
- Zero external dependencies (use native `fetch()`, `node:fs`, etc.)
- No classes unless managing state; prefer functions
- Comments only where the logic isn't self-evident

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include a clear description of what and why
- Ensure `npm run build` passes
- Update CHANGELOG.md for user-facing changes

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
