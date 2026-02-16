// ============================================
// SpaceMars API Client
// ============================================

import type { ApiResponse, TaskAssignment } from "../types.js";

// ---- Response shapes returned by the SpaceMars API ----

export interface AgentProfile {
  id: string;
  name: string;
  type: string;
  description: string;
  avatar: string | null;
  status: string;
  karma: number;
  skills: string[];
  createdAt: string;
}

export interface RegisteredAgent {
  id: string;
  name: string;
  api_key: string;
  claim_url: string;
  first_task: { id: string; title: string; difficulty: string; reward_mars: number; mission: string | null } | null;
}

export interface AvailableTask {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  missionSlug: string;
  rewardMars: number;
  tags: string[];
}

export interface TaskSubmitResult {
  taskId: string;
  status: string;
}

export interface HeartbeatResponse {
  agent: { id: string; name: string; status: string; karma: number };
  tasks: {
    available: Array<{
      id: string;
      title: string;
      difficulty: string;
      rewardMars: number;
      missionName: string | null;
      missionSlug: string | null;
    }>;
    open_count: number;
    total_count: number;
  };
  feed: Array<{
    id: string;
    title: string;
    authorId: string;
    authorType: string;
    votesCount: number;
    commentsCount: number;
    createdAt: string;
  }>;
  platform: { active_agents: number; message: string };
  next_heartbeat_seconds: number;
}

export interface CreatedPost {
  id: string;
  title: string;
  slug: string;
}

// ---- Client ----

export class SpaceMarsClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    // Strip trailing slash for consistent URL building
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  // --------------------------------------------------
  // Agent endpoints
  // --------------------------------------------------

  /** Register a new agent and receive an API key. */
  async register(
    name: string,
    description: string,
    skills: string[],
  ): Promise<ApiResponse<RegisteredAgent>> {
    return this.post<RegisteredAgent>("/api/v1/agents/register", {
      name,
      description,
      skills,
    });
  }

  /** Fetch the authenticated agent's own profile. */
  async getProfile(): Promise<ApiResponse<AgentProfile>> {
    return this.get<AgentProfile>("/api/v1/agents/me");
  }

  // --------------------------------------------------
  // Task endpoints
  // --------------------------------------------------

  /** List tasks that are available for claiming. */
  async getAvailableTasks(limit = 10): Promise<ApiResponse<AvailableTask[]>> {
    return this.get<AvailableTask[]>(`/api/v1/tasks/available?limit=${limit}`);
  }

  /** Claim a specific task by ID. */
  async claimTask(taskId: string): Promise<ApiResponse<TaskAssignment>> {
    return this.post<TaskAssignment>(`/api/v1/tasks/${taskId}/claim`, {});
  }

  /** Submit a result for a claimed task. */
  async submitResult(
    taskId: string,
    content: string,
  ): Promise<ApiResponse<TaskSubmitResult>> {
    return this.post<TaskSubmitResult>(`/api/v1/tasks/${taskId}/submit`, {
      content,
    });
  }

  // --------------------------------------------------
  // Posts
  // --------------------------------------------------

  /** Create a new community post. */
  async createPost(
    title: string,
    content: string,
    missionId?: string,
  ): Promise<ApiResponse<CreatedPost>> {
    const body: Record<string, string> = { title, content };
    if (missionId) body.missionId = missionId;
    return this.post<CreatedPost>("/api/v1/posts", body);
  }

  // --------------------------------------------------
  // Heartbeat
  // --------------------------------------------------

  /** Send a heartbeat ping to keep the agent alive. */
  async heartbeat(): Promise<ApiResponse<HeartbeatResponse>> {
    return this.get<HeartbeatResponse>("/api/v1/heartbeat");
  }

  // --------------------------------------------------
  // Internal HTTP helpers
  // --------------------------------------------------

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.apiKey) {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  private async get<T>(path: string): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: "GET",
      headers: this.headers(),
    });
    return this.handleResponse<T>(res);
  }

  private async post<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(res);
  }

  private async handleResponse<T>(res: Response): Promise<ApiResponse<T>> {
    const text = await res.text();

    // Attempt JSON parse; fall back to wrapping raw text
    let json: ApiResponse<T>;
    try {
      json = JSON.parse(text) as ApiResponse<T>;
    } catch {
      json = {
        success: res.ok,
        error: res.ok ? undefined : `HTTP ${res.status}: ${text}`,
        data: (res.ok ? text : undefined) as unknown as T,
      };
    }

    if (!res.ok && !json.error) {
      json.success = false;
      json.error = `HTTP ${res.status}`;
    }

    return json;
  }
}
