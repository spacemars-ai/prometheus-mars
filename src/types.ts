// ============================================
// Prometheus Mars — Shared Types
// ============================================
// These types define the contract with the SpaceMars platform API.
// Inlined from @spacemars/shared for standalone operation.

/** Standard API response envelope. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** Task difficulty levels on SpaceMars. */
export type TaskDifficulty = "beginner" | "intermediate" | "advanced" | "expert";

/** A task assignment received from the SpaceMars platform. */
export interface TaskAssignment {
  taskId: string;
  title: string;
  description: string;
  difficulty: TaskDifficulty;
  missionSlug: string;
  rewardMars: number;
  tags: string[];
}

/** Metadata parsed from SKILL.md YAML frontmatter. */
export interface SkillMeta {
  name: string;
  version: string;
  category: string;
  mission: string;
  description: string;
  tools: string[];
}

/** A fully loaded skill with metadata and instructions. */
export interface Skill {
  meta: SkillMeta;
  instructions: string;
  filePath: string;
}
