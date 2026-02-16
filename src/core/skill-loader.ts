// ============================================
// Skill Loader — Parse SKILL.md files
// ============================================

import * as fs from "node:fs";
import * as path from "node:path";
import type { Skill, SkillMeta } from "../types.js";

/**
 * Parse a SKILL.md file into its metadata and instruction body.
 *
 * Expected format:
 * ```
 * ---
 * name: skill-name
 * version: 1.0.0
 * category: science
 * mission: all
 * description: A short description
 * tools: [web-search, calculator]
 * ---
 *
 * # Markdown body with full instructions...
 * ```
 */
export function parseSkillMd(content: string, filePath: string): Skill {
  // Normalize line endings (Windows CRLF → LF)
  const normalized = content.replace(/\r\n/g, "\n");
  const frontMatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontMatterMatch) {
    throw new Error(`Invalid SKILL.md format in ${filePath}: no YAML front matter found`);
  }

  const yamlBlock = frontMatterMatch[1];
  const instructions = frontMatterMatch[2].trim();

  const meta = parseYamlFrontMatter(yamlBlock, filePath);

  return { meta, instructions, filePath };
}

/**
 * Minimal YAML front matter parser (handles the simple key: value format
 * used in SKILL.md files without requiring a full YAML library).
 */
function parseYamlFrontMatter(yaml: string, filePath: string): SkillMeta {
  const lines = yaml.split("\n");
  const obj: Record<string, string | string[]> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    // Handle array format: [item1, item2, item3]
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1);
      obj[key] = inner
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      obj[key] = value;
    }
  }

  const required = ["name", "version", "category", "mission", "description"];
  for (const field of required) {
    if (!obj[field]) {
      throw new Error(
        `SKILL.md at ${filePath} is missing required field: ${field}`,
      );
    }
  }

  return {
    name: obj.name as string,
    version: obj.version as string,
    category: obj.category as string,
    mission: obj.mission as string,
    description: obj.description as string,
    tools: (obj.tools as string[]) ?? [],
  };
}

/**
 * Load a single skill from a SKILL.md file path.
 */
export function loadSkill(skillPath: string): Skill {
  const absolute = path.resolve(skillPath);
  const content = fs.readFileSync(absolute, "utf-8");
  return parseSkillMd(content, absolute);
}

/**
 * Discover and load all SKILL.md files in a directory (recursively).
 * Returns an array of loaded skills.
 */
export function loadSkillsFromDir(dir: string): Skill[] {
  const absolute = path.resolve(dir);
  if (!fs.existsSync(absolute)) {
    console.warn(`[SkillLoader] Directory not found: ${absolute}`);
    return [];
  }

  const skills: Skill[] = [];
  const entries = fs.readdirSync(absolute, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(absolute, entry.name);

    if (entry.isDirectory()) {
      // Look for SKILL.md inside subdirectories
      const skillFile = path.join(fullPath, "SKILL.md");
      if (fs.existsSync(skillFile)) {
        try {
          skills.push(loadSkill(skillFile));
        } catch (err) {
          console.warn(
            `[SkillLoader] Failed to load ${skillFile}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    } else if (entry.name === "SKILL.md") {
      try {
        skills.push(loadSkill(fullPath));
      } catch (err) {
        console.warn(
          `[SkillLoader] Failed to load ${fullPath}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  console.log(
    `[SkillLoader] Loaded ${skills.length} skill(s) from ${absolute}`,
  );

  return skills;
}

/**
 * Fetch and parse a remote SKILL.md from a URL (e.g. https://spacemars.ai/skill.md).
 */
export async function loadSkillFromUrl(url: string): Promise<Skill> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch SKILL.md from ${url}: HTTP ${res.status}`);
  }
  const content = await res.text();
  return parseSkillMd(content, url);
}
