// ============================================
// Task Worker — Agentic Task Lifecycle
// ============================================
//
// Responsible for the full task lifecycle:
//   1. Fetch available tasks from SpaceMars
//   2. Claim a task
//   3. Match relevant skills to the task
//   4. Solve it with the LLM using an agentic tool-calling loop
//   5. Submit the result
// ============================================

import type { SpaceMarsClient, AvailableTask } from "../channels/spacemars-api.js";
import type { LLMAdapter, ContentBlock, LLMMessage, ToolResultContent } from "./llm-adapter.js";
import type { Skill } from "../types.js";
import type { ToolExecutor } from "../tools/tool-executor.js";

const MAX_AGENT_TURNS = 25;

const TASK_SYSTEM_PROMPT = `You are Prometheus, an autonomous AI agent working on the SpaceMars platform.
Your mission is to help humanity expand into space by completing tasks assigned to you.

You have access to tools. Use them when they would help you produce a better answer:
- read_file: Read files to understand context
- write_file: Create or update files
- bash: Run shell commands for computation, data processing, or system tasks
- web_fetch: Fetch content from URLs
- web_search: Search the web for information

When solving a task:
1. Think about what information or actions you need
2. Use tools to gather data or perform operations
3. Synthesize your findings into a clear, actionable solution

Produce clear, actionable, well-structured output. If the task asks for code, return
working code with comments. If it asks for research, return well-sourced analysis.
Always be thorough and accurate.`;

export class TaskWorker {
  private skills: Skill[] = [];
  private toolExecutor: ToolExecutor | null = null;
  private soulPrompt = "";

  constructor(
    private readonly client: SpaceMarsClient,
    private readonly llm: LLMAdapter,
  ) {}

  setSkills(skills: Skill[]): void {
    this.skills = skills;
    console.log(
      `[TaskWorker] ${skills.length} skill(s) available: ${skills.map((s) => s.meta.name).join(", ")}`,
    );
  }

  setToolExecutor(executor: ToolExecutor): void {
    this.toolExecutor = executor;
    console.log(
      `[TaskWorker] ${executor.getToolNames().length} tool(s) available: ${executor.getToolNames().join(", ")}`,
    );
  }

  setSoulPrompt(soul: string): void {
    this.soulPrompt = soul;
  }

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
   * Solve a task using the agentic tool-calling loop.
   * The LLM can call tools, observe results, and iterate until done.
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

    // If no tool executor, fall back to simple completion
    if (!this.toolExecutor) {
      const response = await this.llm.complete(systemPrompt, userPrompt);
      console.log(
        `[TaskWorker] LLM responded (${response.provider}/${response.model}` +
          `${response.tokensUsed ? `, ${response.tokensUsed} tokens` : ""})`,
      );
      return response.content;
    }

    return this.agenticLoop(systemPrompt, userPrompt);
  }

  /**
   * Solve a task described as a simple string (for `run` command).
   */
  async solveDirectTask(description: string): Promise<string> {
    const systemPrompt = this.buildSystemPromptWithSkills(this.skills.slice(0, 2));

    if (!this.toolExecutor) {
      const response = await this.llm.complete(systemPrompt, description);
      return response.content;
    }

    return this.agenticLoop(systemPrompt, description);
  }

  private async agenticLoop(systemPrompt: string, userPrompt: string): Promise<string> {
    const tools = this.toolExecutor!.getDefinitions();
    const messages: LLMMessage[] = [{ role: "user", content: userPrompt }];

    let totalTokens = 0;

    for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
      const response = await this.llm.completeWithTools(systemPrompt, messages, tools);

      totalTokens += response.tokensUsed ?? 0;

      messages.push({ role: "assistant", content: response.content });

      // Log reasoning text
      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) {
          console.log(`[Agent] ${block.text.slice(0, 200)}${block.text.length > 200 ? "..." : ""}`);
        }
      }

      // If the LLM is done, extract final text
      if (response.stopReason === "end_turn" || response.stopReason === "max_tokens") {
        console.log(
          `[TaskWorker] Agentic loop completed in ${turn + 1} turn(s), ${totalTokens} tokens`,
        );

        return response.content
          .filter((b): b is { type: "text"; text: string } => b.type === "text")
          .map((b) => b.text)
          .join("\n");
      }

      // Execute tool calls
      const toolUseBlocks = response.content.filter(
        (b): b is ContentBlock & { type: "tool_use" } => b.type === "tool_use",
      );

      const toolResults: ToolResultContent[] = [];

      for (const toolCall of toolUseBlocks) {
        console.log(`[Tool] ${toolCall.name}(${JSON.stringify(toolCall.input).slice(0, 100)})`);

        const result = await this.toolExecutor!.execute({
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
        });

        console.log(
          `[Tool] ${toolCall.name} -> ${result.is_error ? "ERROR: " : ""}${result.content.slice(0, 150)}${result.content.length > 150 ? "..." : ""}`,
        );

        toolResults.push({
          type: "tool_result",
          tool_use_id: result.tool_use_id,
          content: result.content,
          is_error: result.is_error,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    console.warn(`[TaskWorker] Max turns (${MAX_AGENT_TURNS}) reached.`);

    const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
    if (lastAssistant && Array.isArray(lastAssistant.content)) {
      const textBlocks = (lastAssistant.content as ContentBlock[])
        .filter((b): b is { type: "text"; text: string } => b.type === "text");
      if (textBlocks.length > 0) {
        return textBlocks.map((b) => b.text).join("\n") +
          "\n\n[Warning: Agent reached maximum turns limit]";
      }
    }

    return "[Agent reached maximum turns without producing a final answer]";
  }

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

  private selectSkillsForTask(task: AvailableTask): Skill[] {
    if (this.skills.length === 0) return [];

    const taskTags = new Set(task.tags.map((t) => t.toLowerCase()));
    const taskTitle = task.title.toLowerCase();
    const taskDesc = task.description.toLowerCase();

    const scored = this.skills
      .filter((skill) => {
        return skill.meta.mission === "all" || skill.meta.mission === task.missionSlug;
      })
      .map((skill) => {
        let score = 0;
        const name = skill.meta.name.toLowerCase();
        const category = skill.meta.category.toLowerCase();
        const desc = skill.meta.description.toLowerCase();

        if (taskTags.has(category)) score += 3;
        if (taskTags.has(name)) score += 3;

        for (const part of name.split("-")) {
          if (taskTags.has(part)) score += 2;
        }

        if (taskTitle.includes(name) || taskTitle.includes(category)) score += 2;
        if (taskDesc.includes(name) || taskDesc.includes(category)) score += 1;

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
    const parts = [TASK_SYSTEM_PROMPT];

    if (this.soulPrompt) {
      parts.push("", "---", "", this.soulPrompt);
    }

    if (skills.length > 0) {
      const skillBlocks = skills.map((skill) =>
        [
          `### Skill: ${skill.meta.name} (${skill.meta.category})`,
          skill.meta.description,
          "",
          skill.instructions,
        ].join("\n"),
      );

      parts.push(
        "",
        "---",
        "",
        "# Available Skills",
        "",
        "You have specialized knowledge from the following skills.",
        "Use their instructions and approaches when relevant to the task.",
        "",
        ...skillBlocks,
      );
    }

    return parts.join("\n");
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
