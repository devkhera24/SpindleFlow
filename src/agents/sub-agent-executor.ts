import { SubAgent, Agent } from "../config/schema";
import { LLMProvider } from "../llm/provider";
import { ContextStore } from "../context/store";
import { MCPToolRegistry } from "../mcp/registry";
import { ToolAwareLLMProvider } from "../llm/tool-aware-provider";
import { orchestratorLogger } from "../logger/enhanced-logger";
import { PersistentMemoryManager, createEmbedding, RelevantMemory } from "../memory/persistent-memory";
import { ToolInvoker } from "../tools/invoker";

export interface SubAgentExecutionPlan {
  subAgentsToCall: string[];
  reason: string;
  sequence: 'parallel' | 'sequential';
}

export class SubAgentExecutor {
  constructor(
    private llm: LLMProvider,
    private toolRegistry?: MCPToolRegistry,
    private memoryManager?: PersistentMemoryManager
  ) {}

  /**
   * Parent agent decides which sub-agents to invoke
   */
  async planSubAgentExecution(
    parent: Agent,
    userInput: string,
    context: ContextStore
  ): Promise<SubAgentExecutionPlan> {
    if (!parent.sub_agents || parent.sub_agents.length === 0) {
      return {
        subAgentsToCall: [],
        reason: 'No sub-agents available',
        sequence: 'sequential',
      };
    }

    // If strategy is explicit, use it
    const strategy = parent.delegation_strategy || 'auto';
    
    if (strategy === 'sequential') {
      return {
        subAgentsToCall: parent.sub_agents.map(s => s.id),
        reason: 'Sequential delegation strategy',
        sequence: 'sequential',
      };
    }

    if (strategy === 'parallel') {
      return {
        subAgentsToCall: parent.sub_agents.map(s => s.id),
        reason: 'Parallel delegation strategy',
        sequence: 'parallel',
      };
    }

    // Auto mode: ask parent agent to decide
    const planningPrompt = this.buildPlanningPrompt(parent, userInput, context);

    orchestratorLogger.info({
      event: 'SUB_AGENT_PLANNING',
      parentId: parent.id,
      availableSubAgents: parent.sub_agents.length,
    }, `🤔 Planning sub-agent delegation for: ${parent.id}`);

    const planResponse = await this.llm.generate(planningPrompt);

    return this.parsePlan(planResponse, parent.sub_agents);
  }

  private buildPlanningPrompt(
    parent: Agent,
    userInput: string,
    context: ContextStore
  ): { system: string; user: string } {
    const subAgentsList = parent.sub_agents!.map(
      sa => `
- ${sa.id} (${sa.role})
  Goal: ${sa.goal}
  Specialization: ${sa.specialization || 'General'}
  Triggers: ${sa.trigger_conditions?.join(', ') || 'Any'}`
    ).join('\n');

    const system = `
You are ${parent.role}, a team lead with specialized sub-agents.

Your goal: ${parent.goal}

Available sub-agents:
${subAgentsList}

Your task: Analyze the user's request and determine:
1. Which sub-agents should be involved
2. In what order (sequential or parallel)
3. Why each sub-agent is needed

Respond with a JSON plan:
{
  "sub_agents": ["id1", "id2", ...],
  "sequence": "sequential" or "parallel",
  "reason": "explanation"
}
`.trim();

    const user = `
User Request: ${userInput}

Previous Context:
${this.formatContext(context)}

Create an execution plan for your sub-agents.
`.trim();

    return { system, user };
  }

  private parsePlan(response: string, availableSubAgents: SubAgent[]): SubAgentExecutionPlan {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON plan found');
      }

      const plan = JSON.parse(jsonMatch[0]);

      // Validate sub-agent IDs
      const validIds = plan.sub_agents.filter((id: string) =>
        availableSubAgents.some(sa => sa.id === id)
      );

      return {
        subAgentsToCall: validIds,
        reason: plan.reason || 'No reason provided',
        sequence: plan.sequence || 'sequential',
      };
    } catch (error) {
      orchestratorLogger.warn({
        event: 'PLAN_PARSE_FALLBACK',
        error: error instanceof Error ? error.message : String(error),
      }, '⚠️ Failed to parse plan, using fallback');

      // Fallback: use all sub-agents sequentially
      return {
        subAgentsToCall: availableSubAgents.map(sa => sa.id),
        reason: 'Fallback: using all sub-agents',
        sequence: 'sequential',
      };
    }
  }

  /**
   * Execute sub-agents based on plan
   */
  async executeSubAgents(
    parent: Agent,
    plan: SubAgentExecutionPlan,
    userInput: string,
    context: ContextStore
  ): Promise<Map<string, string>> {
    const subAgents = parent.sub_agents!.filter(sa =>
      plan.subAgentsToCall.includes(sa.id)
    );

    if (plan.sequence === 'sequential') {
      return await this.executeSequential(subAgents, userInput, context, parent);
    } else {
      return await this.executeParallel(subAgents, userInput, context, parent);
    }
  }

  private async executeSequential(
    subAgents: SubAgent[],
    userInput: string,
    context: ContextStore,
    parent: Agent
  ): Promise<Map<string, string>> {
    const outputs = new Map<string, string>();

    for (let i = 0; i < subAgents.length; i++) {
      const subAgent = subAgents[i];

      console.log(`    ↳ Sub-agent ${i + 1}/${subAgents.length}: ${subAgent.role}`);

      orchestratorLogger.info({
        event: 'SUB_AGENT_EXECUTE',
        parentId: parent.id,
        subAgentId: subAgent.id,
        position: i + 1,
        total: subAgents.length,
      }, `🔸 Executing sub-agent: ${subAgent.role}`);

      const output = await this.executeSubAgent(
        subAgent,
        userInput,
        context,
        outputs,
        parent
      );

      outputs.set(subAgent.id, output);

      // Store in context
      context.setSubAgentOutput(parent.id, subAgent.id, output);

      console.log(`    ✓ ${subAgent.role} complete`);
    }

    return outputs;
  }

  private async executeParallel(
    subAgents: SubAgent[],
    userInput: string,
    context: ContextStore,
    parent: Agent
  ): Promise<Map<string, string>> {
    console.log(`    ⚡ Parallel execution of ${subAgents.length} sub-agents`);

    orchestratorLogger.info({
      event: 'SUB_AGENT_PARALLEL_START',
      parentId: parent.id,
      subAgentCount: subAgents.length,
    }, `⚡ Parallel execution of ${subAgents.length} sub-agents`);

    const promises = subAgents.map(async subAgent => {
      const output = await this.executeSubAgent(
        subAgent,
        userInput,
        context,
        new Map(), // No cross-contamination in parallel
        parent
      );

      return { id: subAgent.id, output };
    });

    const results = await Promise.all(promises);

    const outputs = new Map<string, string>();
    for (const result of results) {
      outputs.set(result.id, result.output);
      context.setSubAgentOutput(parent.id, result.id, result.output);
    }

    return outputs;
  }

  private async executeSubAgent(
    subAgent: SubAgent,
    userInput: string,
    context: ContextStore,
    previousSubOutputs: Map<string, string>,
    parent: Agent
  ): Promise<string> {
    const startedAt = Date.now();

    // Invoke tools if declared
    let toolOutputs = '';
    if (subAgent.tools && subAgent.tools.length > 0) {
      orchestratorLogger.info({
        event: 'SUB_AGENT_TOOL_INVOCATION',
        subAgentId: subAgent.id,
        tools: subAgent.tools,
      }, `🔧 Sub-agent invoking tools: ${subAgent.tools.join(', ')}`);

      const toolInvoker = new ToolInvoker();
      const toolResults = await toolInvoker.invokeTools(subAgent.tools, {
        userInput: context.userInput,
        previousOutputs: context.getPreviousOutputs(),
      });

      toolOutputs = toolInvoker.formatToolResults(toolResults);
    }

    // Get relevant memories if persistent memory is enabled
    let relevantMemories: RelevantMemory[] = [];
    if (parent.enable_persistent_memory && this.memoryManager?.isInitialized()) {
      try {
        const queryText = `${subAgent.role}: ${subAgent.goal}\nUser: ${userInput}`;
        const provider = this.memoryManager.getEmbeddingProvider();
        const embedding = await createEmbedding(queryText, provider);
        relevantMemories = await this.memoryManager.queryRelevantMemories(embedding, 3);

        orchestratorLogger.info({
          event: 'SUB_AGENT_MEMORY_RETRIEVED',
          subAgentId: subAgent.id,
          memoryCount: relevantMemories.length,
        }, `🧠 Retrieved ${relevantMemories.length} relevant memories for sub-agent`);
      } catch (error) {
        orchestratorLogger.warn({
          event: 'SUB_AGENT_MEMORY_ERROR',
          subAgentId: subAgent.id,
          error: error instanceof Error ? error.message : String(error),
        }, '⚠️ Failed to retrieve memories for sub-agent');
      }
    }

    const prompt = this.buildSubAgentPrompt(
      subAgent,
      userInput,
      context,
      previousSubOutputs,
      parent,
      toolOutputs,
      relevantMemories
    );

    // Check if sub-agent has MCP tools
    const subAgentMCPTools = subAgent.mcpTools || [];
    let output: string;

    if (subAgentMCPTools.length > 0 && this.toolRegistry) {
      orchestratorLogger.info({
        event: 'SUB_AGENT_MCP_TOOLS',
        subAgentId: subAgent.id,
        mcpTools: subAgentMCPTools,
      }, `🔧 Sub-agent using MCP tools: ${subAgentMCPTools.join(', ')}`);

      const toolSchemas = subAgentMCPTools
        .map(toolName => {
          const toolProvider = this.toolRegistry!.getTool(toolName);
          return toolProvider ? toolProvider.getSchema() : null;
        })
        .filter((schema): schema is import('../mcp/schema').MCPTool => schema !== null);

      const toolAwareLLM = new ToolAwareLLMProvider(this.llm, this.toolRegistry);

      const result = await toolAwareLLM.generateWithTools({
        system: prompt.system,
        user: prompt.user,
        temperature: 0.2,
        tools: toolSchemas,
        maxToolCalls: 10,
      });

      output = result.output;
    } else {
      output = await this.llm.generate({
        system: prompt.system,
        user: prompt.user,
        temperature: 0.2,
      });
    }

    const endedAt = Date.now();
    const duration = endedAt - startedAt;

    orchestratorLogger.info({
      event: 'SUB_AGENT_COMPLETE',
      subAgentId: subAgent.id,
      duration,
      outputLength: output.length,
    }, `✅ Sub-agent completed: ${subAgent.id} (${duration}ms)`);

    return output;
  }

  private buildSubAgentPrompt(
    subAgent: SubAgent,
    userInput: string,
    context: ContextStore,
    previousSubOutputs: Map<string, string>,
    parent: Agent,
    toolOutputs?: string,
    relevantMemories?: RelevantMemory[]
  ): { system: string; user: string } {
    const system = `
You are ${subAgent.role}, working as part of ${parent.role}'s team.

Your specialization: ${subAgent.specialization || 'General tasks'}

Your specific goal: ${subAgent.goal}

IMPORTANT:
- Focus only on your specialization
- Provide detailed, high-quality output
- Build on previous sub-agents' work if available
`.trim();

    let user = `
Original Request: ${userInput}

Parent Agent Goal: ${parent.goal}
`;

    // Add tool outputs
    if (toolOutputs) {
      user += `\n\nTool Outputs:\n${toolOutputs}`;
    }

    // Add previous sub-agent outputs
    if (previousSubOutputs.size > 0) {
      user += `\n\nPrevious Sub-Agent Work:\n`;
      for (const [id, output] of previousSubOutputs.entries()) {
        user += `\n--- ${id} ---\n${output}\n`;
      }
    }

    // Add relevant memories from other workflows
    if (relevantMemories && relevantMemories.length > 0) {
      user += `\n\nRelevant Past Context from Other Workflows:\n`;
      for (const memory of relevantMemories) {
        user += `\n[${memory.role} - ${new Date(memory.timestamp).toLocaleString()}] (relevance: ${(memory.score * 100).toFixed(1)}%)`;
        if (memory.keyInsights.length > 0) {
          user += `\nKey Insights: ${memory.keyInsights.join('; ')}`;
        }
        if (memory.decisions.length > 0) {
          user += `\nDecisions: ${memory.decisions.join('; ')}`;
        }
        user += '\n';
      }
    }

    user += `\n\nProvide your ${subAgent.role} contribution.`;

    return { system, user };
  }

  /**
   * Parent synthesizes sub-agent outputs
   */
  async synthesizeResults(
    parent: Agent,
    subAgentOutputs: Map<string, string>,
    userInput: string,
    context: ContextStore
  ): Promise<string> {
    orchestratorLogger.info({
      event: 'SUB_AGENT_SYNTHESIS_START',
      parentId: parent.id,
      subAgentCount: subAgentOutputs.size,
    }, `🔄 Synthesizing ${subAgentOutputs.size} sub-agent outputs`);

    const synthesisPrompt = this.buildSynthesisPrompt(
      parent,
      subAgentOutputs,
      userInput,
      context
    );

    const result = await this.llm.generate(synthesisPrompt);

    orchestratorLogger.info({
      event: 'SUB_AGENT_SYNTHESIS_COMPLETE',
      parentId: parent.id,
      outputLength: result.length,
    }, `✅ Synthesis complete for: ${parent.id}`);

    return result;
  }

  private buildSynthesisPrompt(
    parent: Agent,
    subAgentOutputs: Map<string, string>,
    userInput: string,
    context: ContextStore
  ): { system: string; user: string } {
    const system = `
You are ${parent.role}.

Your goal: ${parent.goal}

Your sub-agents have completed their specialized work.
Now synthesize their outputs into a cohesive final deliverable.

IMPORTANT:
- Integrate all sub-agent contributions
- Ensure consistency and quality
- Provide a complete, unified solution
`.trim();

    let user = `
Original Request: ${userInput}

Sub-Agent Contributions:
`;

    for (const [id, output] of subAgentOutputs.entries()) {
      const subAgent = parent.sub_agents!.find(sa => sa.id === id);
      user += `\n--- ${subAgent?.role || id} ---\n${output}\n`;
    }

    user += `\n\nProvide the final integrated solution.`;

    return { system, user };
  }

  private formatContext(context: ContextStore): string {
    const summaries = context.getAllSummaries?.() || [];
    if (summaries.length === 0) return 'No previous context';

    return summaries
      .map(s => `${s.role}: ${s.keyInsights?.join(', ') || 'No insights'}`)
      .join('\n');
  }
}
