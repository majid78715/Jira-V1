import { ChatContext } from "./aiChatContextBuilder";
import { getSystemSetting } from "../data/repositories";
import { AiConfig } from "../models/_types";
import { callLlmProvider, LlmMessage } from "./llmProviders";

export interface LLMAdapterPayload {
  userId: string;
  message: string;
  context: ChatContext;
}

export type LLMAction =
  | { type: "CREATE_PROJECT"; name: string }
  | { type: "CREATE_TASK"; title: string; projectName: string };

export interface LLMAdapterResult {
  text: string;
  guardrailTriggered: boolean;
  topics: string[];
  action?: LLMAction;
}

const PRIVILEGED_KEYWORDS = [
  "change role",
  "promote",
  "demote",
  "grant access",
  "elevate access",
  "approve timesheet",
  "approve vendor",
  "approve task",
  "final approve",
  "update permissions",
  "override approval",
  "bypass approval"
];

export class LLMAdapter {
  static async sendMessage({ message, context }: LLMAdapterPayload): Promise<LLMAdapterResult> {
    const config = await getSystemSetting<AiConfig>("ai-config");
    const provider = config?.provider || "local";
    const prefix = provider !== "local" ? `[${provider.toUpperCase()}] ` : "";

    const normalized = message.toLowerCase();

    // 1. Guardrails for privileged actions
    const wantsPrivilegedAction =
      PRIVILEGED_KEYWORDS.some((keyword) => normalized.includes(keyword)) ||
      (normalized.includes("change") && normalized.includes("role")) ||
      (normalized.includes("approve") &&
        (normalized.includes("access") || normalized.includes("vendor") || normalized.includes("timesheet")));

    if (wantsPrivilegedAction) {
      return {
        text: withGuardrailSuffix(
          `${prefix}I can't modify approvals or permissions, but I'm happy to outline the steps so you can action them.`
        ),
        guardrailTriggered: true,
        topics: ["guardrail"]
      };
    }

    // 2. Deterministic Command Parsing (Fast Path)
    // Simple parser for "create project <name>"
    const createProjectMatch = normalized.match(/create project ["']?([^"']+)["']?/i);
    if (createProjectMatch) {
      const name = createProjectMatch[1];
      return {
        text: `${prefix}I'm initializing a new project draft named "${name}".`,
        guardrailTriggered: false,
        topics: ["create-project"],
        action: { type: "CREATE_PROJECT", name }
      };
    }

    // Simple parser for "create task <title> for <project>"
    const createTaskMatch = normalized.match(/create task ["']?([^"']+)["']? for ["']?([^"']+)["']?/i);
    if (createTaskMatch) {
      const title = createTaskMatch[1];
      const projectName = createTaskMatch[2];
      return {
        text: `${prefix}I'm creating a new task "${title}" for project "${projectName}".`,
        guardrailTriggered: false,
        topics: ["create-task"],
        action: { type: "CREATE_TASK", title, projectName }
      };
    }

    // 3. Dynamic LLM Call (Slow Path)
    // If a real provider is configured (or local with URL), use it.
    // Otherwise, fall back to the mock logic.
    const useRealLlm = provider !== "local" || (provider === "local" && config?.localUrl);

    if (useRealLlm && config) {
      try {
        const systemPrompt = buildSystemPrompt(context);
        const messages: LlmMessage[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ];
        
        const responseText = await callLlmProvider(config, messages);
        
        return {
          text: `${prefix}${responseText}`,
          guardrailTriggered: false,
          topics: ["llm-response"]
        };
      } catch (error: any) {
        console.error("LLM Call Failed:", error);
        return {
          text: `${prefix}Error calling AI provider: ${error.message}. Falling back to local summary.`,
          guardrailTriggered: false,
          topics: ["error"]
        };
      }
    }

    // 4. Mock Fallbacks (Legacy/Local without URL)
    if (normalized.includes("blocked")) {
      return {
        text: withGuardrailSuffix(`${prefix}${describeBlockedTasks(context)}`),
        guardrailTriggered: false,
        topics: ["blocked-tasks"]
      };
    }

    if (normalized.includes("vendor") && normalized.includes("week")) {
      return {
        text: withGuardrailSuffix(`${prefix}${summarizeVendorWeek(context, normalized)}`),
        guardrailTriggered: false,
        topics: ["vendor-summary"]
      };
    }

    if (normalized.includes("draft") && (normalized.includes("update") || normalized.includes("email"))) {
      return {
        text: withGuardrailSuffix(`${prefix}${draftLeadershipUpdate(context)}`),
        guardrailTriggered: false,
        topics: ["draft-update"]
      };
    }

    // Default fallback
    return {
      text: withGuardrailSuffix(`${prefix}${defaultWorkspaceSummary(context)}`),
      guardrailTriggered: false,
      topics: ["general"]
    };
  }
}

function buildSystemPrompt(context: ChatContext): string {
  return `You are Jira-V1 AI, a helpful project management assistant.
  
CONTEXT:
User: ${context.user.name} (${context.user.role})
Company: ${context.user.companyName || "N/A"}
Current Time: ${context.generatedAt}

PROJECTS:
${context.projects.map(p => `- ${p.name} (${p.status}): ${p.openTasks} open tasks`).join("\n")}

BLOCKED TASKS:
${context.blockedTasks.map(t => `- ${t.title} (Project: ${t.projectName}) blocked for ${t.blockedDays} days`).join("\n")}

ALERTS:
${context.alerts.openCount} open alerts.

TIMESHEETS:
${context.timesheets.recent.map(t => `- Week ${t.weekStart}: ${t.status}`).join("\n")}

INSTRUCTIONS:
- Answer the user's question based on the context provided.
- Be extremely concise.
- Use bullet points for your response.
- Limit each bullet point to 1-3 sentences.
- Bold the key term or title of each bullet point (e.g., **Project Name:**).
- If you cannot answer based on the context, say so.
- Do not invent facts not in the context.
`;
}

function describeBlockedTasks(context: ChatContext) {
  const blocked =
    context.blockedTasks.filter((task) => (task.blockedDays ?? 0) >= 3) ??
    context.blockedTasks.filter((task) => (task.blockedDays ?? 0) >= 1);

  if (!blocked.length) {
    return "No tasks have been blocked for 3+ days based on the latest schedule. Everything else is moving.";
  }

  const lines = blocked.slice(0, 5).map((task) => {
    const projectSegment = task.projectName ? ` – ${task.projectName}` : "";
    const blockedDays = task.blockedDays ?? 0;
    const dueSegment = task.dueDate ? ` (due ${task.dueDate})` : "";
    return `• ${task.title}${projectSegment}: blocked ~${blockedDays} day(s)${dueSegment}`;
  });

  return ["Tasks stuck for 3+ days:", ...lines, followUpReminder()].join("\n");
}

function summarizeVendorWeek(context: ChatContext, normalizedMessage: string) {
  const vendor =
    context.vendors.find((entry) => normalizedMessage.includes(entry.companyName.toLowerCase())) ??
    context.vendors[0];

  if (!vendor) {
    return "I don't see vendor activity yet. Once projects reference a vendor company, I'll summarize it here.";
  }

  const timesheetNotes = Object.entries(vendor.timesheetStatuses)
    .map(([status, count]) => `${count} ${status.toLowerCase()}`)
    .join(", ");
  const contributorPreview = vendor.contributors.slice(0, 3).join(", ") || "no active contributors listed";

  return [
    `${vendor.companyName} this week (${formatRange(context.currentWeek.start, context.currentWeek.end)}):`,
    `• Projects active: ${vendor.activeProjects}, blocked tasks: ${vendor.blockedTasks}`,
    `• Timesheets: ${timesheetNotes || "none submitted yet"}`,
    `• Contributors: ${contributorPreview}${vendor.contributors.length > 3 ? " +" : ""}`,
    followUpReminder()
  ].join("\n");
}

function draftLeadershipUpdate(context: ChatContext) {
  const blockedLine = describeBlockedTasks(context);
  const alertLine = context.alerts.openCount
    ? `${context.alerts.openCount} automation alerts open (top: ${(context.alerts.items[0]?.message ?? "").slice(0, 60)})`
    : "No open automation alerts.";
  const timesheetLine = context.timesheets.recent.length
    ? `Latest timesheet: ${context.timesheets.recent[0].status} for week of ${context.timesheets.recent[0].weekStart}.`
    : "No submitted timesheets yet.";
  return [
    "Draft update for leadership:",
    "",
    `Team: ${context.user.companyName ?? "Humain"} (${context.user.role})`,
    blockedLine,
    alertLine,
    timesheetLine,
    followUpReminder()
  ].join("\n");
}

function defaultWorkspaceSummary(context: ChatContext) {
  const totalProjects = context.projects.length;
  const blockedTasks = context.blockedTasks.length;
  const alertCount = context.alerts.openCount;
  return [
    `Workspace pulse @ ${new Date(context.generatedAt).toLocaleString()}:`,
    `• Projects: ${totalProjects} active`,
    `• Blocked tasks: ${blockedTasks}`,
    `• Alerts: ${alertCount} open`,
    followUpReminder()
  ].join("\n");
}

function followUpReminder() {
  return "Need deeper help? I can draft notes or summarize context so you can take action manually.";
}

function withGuardrailSuffix(text: string) {
  const suffix = "\n\n_I can't change roles, approvals, or permissions — sharing read-only guidance only._";
  return `${text}${suffix}`;
}

function formatRange(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
}
