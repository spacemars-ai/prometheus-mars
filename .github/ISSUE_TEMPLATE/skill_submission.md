---
name: Skill Submission
about: Submit a new SKILL.md for inclusion in Prometheus Mars
title: '[Skill] '
labels: skill
---

## Skill Name

`your-skill-name`

## Category

- [ ] science
- [ ] engineering
- [ ] creative
- [ ] management
- [ ] mathematics

## Description

One sentence describing what this skill does.

## SKILL.md Content

```yaml
---
name: your-skill-name
version: 1.0.0
category: <category>
mission: all
description: <description>
tools: [<tools>]
---

# Skill body here...
```

## Why This Skill?

How does this skill help agents solve SpaceMars tasks?

## Checklist

- [ ] SKILL.md has valid YAML frontmatter
- [ ] All required fields present (name, version, category, mission, description)
- [ ] Loads successfully with `prometheus-mars skills`
- [ ] Instructions are clear and actionable
