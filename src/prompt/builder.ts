import { Agent } from "../agents/agent";
import { ContextStore } from "../context/store";
import { logPromptConstruction, logDataTransfer, promptLogger } from "../logger/enhanced-logger";
import { RelevantMemory } from "../memory/persistent-memory";

export function buildPrompt(
  agent: Agent,
  context: ContextStore,
  toolOutputs?: string,
  relevantMemories?: RelevantMemory[]
): { system: string; user: string } {
  promptLogger.info({
    event: "PROMPT_BUILD_START",
    agentId: agent.id,
    role: agent.role,
    timestamp: Date.now(),
  }, `🏗️ Building prompt for agent: ${agent.id}`);

  // Log agent data being used
  promptLogger.debug({
    event: "AGENT_DATA_ACCESSED",
    agentId: agent.id,
    role: agent.role,
    goal: agent.goal,
    tools: agent.tools,
  }, `📋 Using agent configuration: ${agent.id}`);

  logDataTransfer(
    "AgentRegistry",
    "PromptBuilder",
    { agentId: agent.id, role: agent.role, goal: agent.goal },
    "explicit"
  );

  // Build system prompt
  promptLogger.debug({
    event: "SYSTEM_PROMPT_CONSTRUCTION",
    agentId: agent.id,
  }, `🔧 Constructing system prompt for: ${agent.id}`);

  const systemPrompt = `
You are acting as: ${agent.role}

Your goal:
${agent.goal}

Follow the goal strictly. Be concise, clear, and relevant.
`.trim();

  promptLogger.debug({
    event: "SYSTEM_PROMPT_COMPLETE",
    agentId: agent.id,
    length: systemPrompt.length,
    systemPrompt,
  }, `✅ System prompt constructed (${systemPrompt.length} chars)`);

  // Build user prompt - start with user input
  promptLogger.debug({
    event: "USER_PROMPT_START",
    agentId: agent.id,
  }, `🔧 Constructing user prompt for: ${agent.id}`);

  const userInputLength = context.userInput.length;
  promptLogger.debug({
    event: "USER_INPUT_ACCESSED",
    agentId: agent.id,
    userInputLength,
    userInput: context.userInput,
  }, `📥 Accessing user input (${userInputLength} chars)`);

  logDataTransfer(
    "ContextStore.userInput",
    "PromptBuilder",
    { userInput: context.userInput },
    "explicit"
  );

  let userPrompt = `User input:\n${context.userInput}\n`;

  // NEW: Add relevant memories from persistent storage BEFORE current workflow context
  if (relevantMemories && relevantMemories.length > 0) {
    promptLogger.info({
      event: "ADDING_PERSISTENT_MEMORIES",
      agentId: agent.id,
      memoryCount: relevantMemories.length,
      topScore: relevantMemories[0]?.score || 0,
    }, `🧠 Adding ${relevantMemories.length} relevant memories from past workflows (top score: ${(relevantMemories[0]?.score || 0).toFixed(3)})`);

    userPrompt += `\n--- RELEVANT CONTEXT FROM PAST WORKFLOWS ---\n`;
    userPrompt += `You have access to relevant insights from previous work:\n\n`;

    logDataTransfer(
      "PersistentMemory",
      "PromptBuilder",
      { memoryCount: relevantMemories.length, memories: relevantMemories },
      "implicit"
    );

    for (let i = 0; i < relevantMemories.length; i++) {
      const memory = relevantMemories[i];
      const relevancePercent = Math.round((memory.score || 0) * 100);
      const date = memory.timestamp ? new Date(memory.timestamp).toLocaleString() : 'Unknown';
      
      promptLogger.debug({
        event: "MEMORY_ADDED_TO_PROMPT",
        agentId: agent.id,
        memoryAgentId: memory.agentId,
        memoryRole: memory.role,
        relevance: relevancePercent,
        timestamp: memory.timestamp,
      }, `  💡 Memory ${i + 1}/${relevantMemories.length}: ${memory.role} (${relevancePercent}% relevant)`);

      userPrompt += `[Memory ${i + 1} - ${relevancePercent}% relevant]\n`;
      userPrompt += `From: ${memory.role} (${memory.agentId})\n`;
      userPrompt += `Date: ${date}\n`;
      
      if (memory.keyInsights.length > 0) {
        userPrompt += `Key Insights: ${memory.keyInsights.join("; ")}\n`;
      }
      
      if (memory.decisions.length > 0) {
        userPrompt += `Decisions: ${memory.decisions.join("; ")}\n`;
      }
      
      // Include partial content if it's short enough
      if (memory.content && memory.content.length <= 500) {
        userPrompt += `Content: ${memory.content}\n`;
      } else if (memory.content && memory.content.length > 500) {
        userPrompt += `Content (excerpt): ${memory.content.substring(0, 500)}...\n`;
      }
      
      userPrompt += `---\n`;

      logDataTransfer(
        `PersistentMemory:${memory.agentId}`,
        `PromptBuilder->${agent.id}`,
        { memory },
        "implicit"
      );
    }

    userPrompt += `\nUse these insights to inform your current work.\n`;
    userPrompt += `--- END OF PAST WORKFLOW CONTEXT ---\n\n`;
  }

  // Add tool outputs if any exist
  if (toolOutputs) {
    promptLogger.info({
      event: "ADDING_TOOL_OUTPUTS",
      agentId: agent.id,
      toolOutputLength: toolOutputs.length,
    }, `🔧 Adding tool outputs to prompt (${toolOutputs.length} chars)`);

    userPrompt += toolOutputs;

    logDataTransfer(
      "ToolInvoker",
      "PromptBuilder",
      { toolOutputs },
      "explicit"
    );
  }

  // Add previous agent summaries if any exist (NEW: using summaries instead of full outputs)
  const summaries = context.getAllSummaries();
  
  promptLogger.info({
    event: "SUMMARIES_CHECK",
    agentId: agent.id,
    summaryCount: summaries.length,
    summaryAgents: summaries.map(s => s.agentId),
  }, `🔍 Checking for previous summaries: ${summaries.length} found from [${summaries.map(s => s.agentId).join(', ')}]`);

  if (summaries.length > 0) {
    promptLogger.info({
      event: "ADDING_CONTEXT_SUMMARIES",
      agentId: agent.id,
      summaryCount: summaries.length,
      summaryAgents: summaries.map(s => s.agentId),
    }, `➕ Adding ${summaries.length} previous agent summaries to context: ${summaries.map(s => s.agentId).join(', ')}`);

    userPrompt += `\nPrevious agent work:\n`;

    logDataTransfer(
      "ContextStore.summaries",
      "PromptBuilder",
      summaries,
      "implicit"
    );

    for (let i = 0; i < summaries.length; i++) {
      const summary = summaries[i];
      
      promptLogger.info({
        event: "SUMMARY_ADDED_TO_PROMPT",
        agentId: agent.id,
        sourceAgentId: summary.agentId,
        sourceRole: summary.role,
        keyInsightsCount: summary.keyInsights.length,
        decisionsCount: summary.decisions.length,
        artifactsCount: summary.artifacts.length,
        nextStepsCount: summary.nextSteps.length,
        position: i + 1,
        total: summaries.length,
      }, `  📝 Adding summary ${i + 1}/${summaries.length} from ${summary.role} (${summary.agentId}): ${summary.keyInsights.length} insights, ${summary.decisions.length} decisions`);

      userPrompt += `\n[${summary.role}]\n`;
      
      if (summary.keyInsights.length > 0) {
        userPrompt += `Key Insights: ${summary.keyInsights.join("; ")}\n`;
      }
      
      if (summary.decisions.length > 0) {
        userPrompt += `Decisions: ${summary.decisions.join("; ")}\n`;
      }
      
      if (summary.artifacts.length > 0) {
        userPrompt += `Artifacts: ${summary.artifacts.join("; ")}\n`;
      }
      
      if (summary.nextSteps.length > 0) {
        userPrompt += `Next Steps: ${summary.nextSteps.join("; ")}\n`;
      }
      
      userPrompt += `---\n`;

      logDataTransfer(
        summary.agentId,
        `PromptBuilder->${agent.id}`,
        { summary },
        "implicit"
      );
    }
  } else {
    promptLogger.debug({
      event: "NO_CONTEXT_ADDED",
      agentId: agent.id,
    }, `ℹ️ No previous summaries to add`);
  }

  userPrompt = userPrompt.trim();

  promptLogger.debug({
    event: "USER_PROMPT_COMPLETE",
    agentId: agent.id,
    length: userPrompt.length,
    userPrompt,
  }, `✅ User prompt constructed (${userPrompt.length} chars)`);

  const result = {
    system: systemPrompt,
    user: userPrompt,
  };

  // Log the complete constructed prompt
  logPromptConstruction(
    agent.id,
    systemPrompt,
    userPrompt,
    {
      userInputUsed: true,
      previousOutputsUsed: summaries.length > 0,
      previousOutputCount: summaries.length,
    }
  );

  promptLogger.info({
    event: "PROMPT_BUILD_COMPLETE",
    agentId: agent.id,
    systemLength: systemPrompt.length,
    userLength: userPrompt.length,
    totalLength: systemPrompt.length + userPrompt.length,
  }, `🎉 Prompt build complete for ${agent.id} (total: ${systemPrompt.length + userPrompt.length} chars)`);

  return result;
}