#!/usr/bin/env node
// ============================================
// Prometheus Mars — Entry Point
// ============================================

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";
import { loadConfig } from "./config/config.js";
import { SpaceMarsClient } from "./channels/spacemars-api.js";
import { PrometheusAgent } from "./core/agent.js";
import { loadSkillsFromDir } from "./core/skill-loader.js";

// ---- Package info ----

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_PATH = path.resolve(__dirname, "../package.json");

function getVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// ---- ASCII banner ----

const BANNER = `
  ____                          _   _
 |  _ \\ _ __ ___  _ __ ___   ___| |_| |__   ___ _   _ ___
 | |_) | '__/ _ \\| '_ \` _ \\ / _ \\ __| '_ \\ / _ \\ | | / __|
 |  __/| | | (_) | | | | | |  __/ |_| | | |  __/ |_| \\__ \\
 |_|   |_|  \\___/|_| |_| |_|\\___|\\__|_| |_|\\___|\\__,_|___/
                                    M A R S
`;

// ---- Helpers ----

function printBanner(): void {
  console.log(BANNER);
  console.log(`  Autonomous AI Agent Runtime for SpaceMars  v${getVersion()}`);
  console.log("  https://spacemars.ai");
  console.log();
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ---- Init command ----

async function runInit(): Promise<void> {
  printBanner();
  console.log("=== Agent Initialization ===\n");

  const agentName =
    (await prompt("Agent name (default: Prometheus-Agent): ")) ||
    "Prometheus-Agent";
  const agentDescription =
    (await prompt("Agent description: ")) ||
    "Autonomous AI agent powered by Prometheus runtime";
  const skillsRaw = await prompt("Skills (comma-separated, e.g. coding,research): ");
  const skills = skillsRaw
    ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : ["general"];

  const apiUrl =
    (await prompt("SpaceMars API URL (default: https://spacemars.ai): ")) ||
    "https://spacemars.ai";

  const existingKey = await prompt(
    "SpaceMars API key (leave blank to register a new agent): ",
  );

  let apiKey = existingKey;

  if (!apiKey) {
    console.log("\nRegistering agent with SpaceMars...");
    const client = new SpaceMarsClient(apiUrl, "");
    const res = await client.register(agentName, agentDescription, skills);

    if (res.success && res.data) {
      apiKey = res.data.api_key;
      console.log(`Agent registered! ID: ${res.data.id}`);
      console.log(`API key: ${apiKey}`);
      console.log(`Claim URL: ${res.data.claim_url}`);
      if (res.data.first_task) {
        console.log(`First task: "${res.data.first_task.title}" (${res.data.first_task.difficulty})`);
      }
    } else {
      console.error(`Registration failed: ${res.error ?? "unknown error"}`);
      console.log(
        "You can still create a .env file manually with your SPACEMARS_API_KEY.",
      );
      apiKey = "";
    }
  }

  const llmProvider =
    (await prompt("LLM provider (anthropic/openai/google, default: anthropic): ")) ||
    "anthropic";
  const llmApiKey = await prompt("LLM API key (optional, can set later): ");
  const llmModel =
    (await prompt(
      "LLM model (default: claude-sonnet-4-5-20250929): ",
    )) || "claude-sonnet-4-5-20250929";

  // Build .env content
  const envLines = [
    `# Prometheus Mars Agent Configuration`,
    `# Generated on ${new Date().toISOString()}`,
    ``,
    `SPACEMARS_API_URL=${apiUrl}`,
    `SPACEMARS_API_KEY=${apiKey}`,
    `AGENT_NAME=${agentName}`,
    ``,
    `LLM_PROVIDER=${llmProvider}`,
    `LLM_API_KEY=${llmApiKey}`,
    `LLM_MODEL=${llmModel}`,
    ``,
    `# Heartbeat interval in milliseconds (default: 30 min)`,
    `HEARTBEAT_INTERVAL_MS=1800000`,
    ``,
  ];

  const envPath = path.resolve(process.cwd(), ".env");
  fs.writeFileSync(envPath, envLines.join("\n"), "utf-8");
  console.log(`\nConfiguration saved to ${envPath}`);
  console.log('Run "prometheus-mars" to start the agent.\n');
}

// ---- Skills command ----

function runSkills(): void {
  printBanner();
  dotenvConfig();
  const config = loadConfig();
  const skills = loadSkillsFromDir(config.skillsDir);

  if (skills.length === 0) {
    console.log("No skills found.");
    return;
  }

  console.log(`Found ${skills.length} skill(s):\n`);
  for (const skill of skills) {
    console.log(`  ${skill.meta.name} (${skill.meta.category})`);
    console.log(`    ${skill.meta.description}`);
    console.log(`    Mission: ${skill.meta.mission} | Tools: ${skill.meta.tools.join(", ") || "none"}`);
    console.log();
  }
}

// ---- Default: run the agent ----

async function runAgent(): Promise<void> {
  // Load .env from the current working directory
  dotenvConfig();

  printBanner();

  const config = loadConfig();

  if (!config.apiKey) {
    console.error(
      '[Prometheus] No SPACEMARS_API_KEY found.\n' +
        'Run "prometheus-mars init" to set up, or add SPACEMARS_API_KEY to your .env file.\n',
    );
    process.exit(1);
  }

  const agent = new PrometheusAgent(config);

  // Graceful shutdown on SIGINT / SIGTERM
  const shutdown = () => {
    agent.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await agent.start();
}

// ---- CLI dispatch ----

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  switch (command) {
    case "init":
      await runInit();
      break;

    case "skills":
      runSkills();
      break;

    case "version":
    case "--version":
    case "-v":
      console.log(`prometheus-mars v${getVersion()}`);
      break;

    case "help":
    case "--help":
    case "-h":
      printBanner();
      console.log("Usage:");
      console.log("  prometheus-mars          Start the agent");
      console.log("  prometheus-mars init     Interactive setup & registration");
      console.log("  prometheus-mars skills   List loaded skills");
      console.log("  prometheus-mars version  Show version");
      console.log("  prometheus-mars help     Show this help message");
      console.log();
      break;

    default:
      await runAgent();
      break;
  }
}

main().catch((err) => {
  console.error("[Prometheus] Fatal error:", err);
  process.exit(1);
});
