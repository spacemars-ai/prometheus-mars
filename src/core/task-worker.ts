// ============================================
// Task Worker
// ============================================
//
// Responsible for the full task lifecycle:
//   1. Fetch available tasks from SpaceMars
//   2. Claim a task
//   3. Match relevant skills to the task
//   4. Solve it with the LLM (with skill context)
//   5. Submit the result
// ============================================

import type { SpaceMarsClient, AvailableTask } from "../channels/spacemars-api.js";
import type { LLMAdapter } from "./llm-adapter.js";
import type { Skill } from "../types.js";

const TASK_SYSTEM_PROMPT = `You are Prometheus, an autonomous AI agent working on the SpaceMars platform.
Your mission is to help humanity expand into space by completing tasks assigned to you.
Produce clear, actionable, well-structured output. If the task asks for code, return
working code with comments. If it asks for research, return well-sourced analysis.
Always be thorough and accurate.`;

export class TaskWorker {
  private skills: Skill[] = [];

  constructor(
    private readonly client: SpaceMarsClient,
    private readonly llm: LLMAdapter,
  ) {}

  /**
   * Set the available skills for this worker.
   * Skills are loaded from SKILL.md files by the agent runtime.
   */
  setSkills(skills: Skill[]): void {
    this.skills = skills;
    console.log(
      `[TaskWorker] ${skills.length} skill(s) available: ${skills.map((s) => s.meta.name).join(", ")}`,
    );
  }

  /**
   * Fetch one page of available tasks and attempt to claim the first one.
   * Returns the claimed task, or `null` if nothing was available.
   */
  async fetchAndClaimTask(): Promise<AvailableTask | null> {
    console.log("[TaskWorker] Fetching available tasks...");

    const listRes = await this.client.getAvailableTasks(5);

    if (!listRes.success || !listRes.data || listRes.data.length === 0) {
      console.log("[TaskWorker] No tasks available right now.");
      return null;
    }

    console.log(`[TaskWorker] Found ${listRes.data.length} task(s). Claiming first...`);

    const task = listRes.data[0];
    const claimRes = await this.client.claimTask(task.id);

    if (!claimRes.success) {
      console.warn(
        `[TaskWorker] Failed to claim task ${task.id}: ${claimRes.error ?? "unknown"}`,
      );
      return null;
    }

    console.log(`[TaskWorker] Claimed task: "${task.title}" (${task.id})`);
    return task;
  }

  /**
   * Use the LLM to generate a solution for the given task.
   * Automatically selects relevant skills and injects their context.
   */
  async solveTask(task: AvailableTask): Promise<string> {
    console.log(`[TaskWorker] Solving task: "${task.title}"...`);

    const relevantSkills = this.selectSkillsForTask(task);

    if (relevantSkills.length > 0) {
      console.log(
        `[TaskWorker] Using skills: ${relevantSkills.map((s) => s.meta.name).join(", ")}`,
      );
    }

    const systemPrompt = this.buildSystemPromptWithSkills(relevantSkills);
    const userPrompt = this.buildTaskPrompt(task);
    const response = await this.llm.complete(systemPrompt, userPrompt);

    console.log(
      `[TaskWorker] LLM responded (${response.provider}/${response.model}` +
        `${response.tokensUsed ? `, ${response.tokensUsed} tokens` : ""})`,
    );

    return response.content;
  }

  /**
   * Submit a solution for a previously-claimed task.
   */
  async submitSolution(taskId: string, solution: string): Promise<boolean> {
    console.log(`[TaskWorker] Submitting solution for task ${taskId}...`);

    const res = await this.client.submitResult(taskId, solution);

    if (res.success) {
      console.log(`[TaskWorker] Solution submitted successfully.`);
    } else {
      console.error(
        `[TaskWorker] Submission failed: ${res.error ?? "unknown error"}`,
      );
    }

    return res.success;
  }

  /**
   * Run the full lifecycle once: fetch -> claim -> solve -> submit.
   * Returns true if a task was completed, false otherwise.
   */
  async runOnce(): Promise<boolean> {
    const task = await this.fetchAndClaimTask();
    if (!task) return false;

    try {
      const solution = await this.solveTask(task);
      return await this.submitSolution(task.id, solution);
    } catch (err) {
      console.error(
        `[TaskWorker] Error processing task ${task.id}:`,
        err instanceof Error ? err.message : err,
      );
      return false;
    }
  }

  // ---- Skill matching ----

  /**
   * Select skills relevant to a task based on tags, category, and mission.
   * Returns at most 2 skills to avoid prompt bloat.
   */
  private selectSkillsForTask(task: AvailableTask): Skill[] {
    if (this.skills.length === 0) return [];

    const taskTags = new Set(task.tags.map((t) => t.toLowerCase()));
    const taskTitle = task.title.toLowerCase();
    const taskDesc = task.description.toLowerCase();

    const scored = this.skills
      .filter((skill) => {
        // Mission filter: skill must apply to "all" or this specific mission
        return skill.meta.mission === "all" || skill.meta.mission === task.missionSlug;
      })
      .map((skill) => {
        let score = 0;
        const name = skill.meta.name.toLowerCase();
        const category = skill.meta.category.toLowerCase();
        const desc = skill.meta.description.toLowerCase();

        // Direct tag match (highest signal)
        if (taskTags.has(category)) score += 3;
        if (taskTags.has(name)) score += 3;

        // Partial match: skill name parts against tags
        for (const part of name.split("-")) {
          if (taskTags.has(part)) score += 2;
        }

        // Title/description keyword match
        if (taskTitle.includes(name) || taskTitle.includes(category)) score += 2;
        if (taskDesc.includes(name) || taskDesc.includes(category)) score += 1;

        // Tag keywords in skill description
        for (const tag of taskTags) {
          if (desc.includes(tag)) score += 1;
        }

        return { skill, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, 2).map(({ skill }) => skill);
  }

  // ---- Prompt builders ----

  private buildSystemPromptWithSkills(skills: Skill[]): string {
    if (skills.length === 0) return TASK_SYSTEM_PROMPT;

    const skillBlocks = skills.map((skill) =>
      [
        `### Skill: ${skill.meta.name} (${skill.meta.category})`,
        skill.meta.description,
        "",
        skill.instructions,
      ].join("\n"),
    );

    return [
      TASK_SYSTEM_PROMPT,
      "",
      "---",
      "",
      "# Available Skills",
      "",
      "You have specialized knowledge from the following skills.",
      "Use their instructions and approaches when relevant to the task.",
      "",
      ...skillBlocks,
    ].join("\n");
  }

  private buildTaskPrompt(task: AvailableTask): string {
    const parts = [
      `## Task: ${task.title}`,
      "",
      task.description,
      "",
      `- Difficulty: ${task.difficulty}`,
      `- Mission: ${task.missionSlug}`,
      `- Reward: ${task.rewardMars} MARS`,
    ];

    if (task.tags.length > 0) {
      parts.push(`- Tags: ${task.tags.join(", ")}`);
    }

    parts.push(
      "",
      "Provide a comprehensive, well-structured solution for this task.",
    );

    return parts.join("\n");
  }
}
