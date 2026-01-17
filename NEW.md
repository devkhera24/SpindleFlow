Feature 3: Sub-Agent System (Claude Code Pattern)
Overview
Implement hierarchical sub-agent system where parent agents can dynamically invoke specialized sub-agents based on task requirements, following Claude Code's architecture.
Example: Frontend agent with sub-agents: UI Strategist, UI Designer, Code Writer, Code Reviewer
Architecture Principles
Key Concepts

Parent Agent: High-level orchestrator with a goal
Sub-Agents: Specialized agents for specific subtasks
Smart Delegation: Parent decides when to call which sub-agent
Feedback Loop: Sub-agents can be called iteratively (if parallel)
Context Inheritance: Sub-agents inherit parent's context

Schema Design
1. Extended Agent Schema
Update src/config/schema.ts:
typescriptimport { z } from 'zod';

export const SubAgentSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  goal: z.string().min(1),
  tools: z.array(z.string()).optional(),
  specialization: z.string().optional(),  // What this sub-agent excels at
  trigger_conditions: z.array(z.string()).optional()  // When to invoke
});

export const AgentSchemaV2 = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  goal: z.string().min(1),
  tools: z.array(z.string()).optional(),
  
  // NEW: Sub-agent support
  sub_agents: z.array(SubAgentSchema).optional(),
  delegation_strategy: z.enum([
    'auto',      // Parent decides intelligently
    'sequential', // All sub-agents in order
    'parallel'    // All sub-agents concurrently
  ]).default('auto')
});

export type SubAgent = z.infer<typeof SubAgentSchema>;
export type AgentV2 = z.infer<typeof AgentSchemaV2>;
2. YAML Configuration Example
yamlagents:
  - id: frontend
    role: Frontend Development Lead
    goal: Create a complete frontend solution
    delegation_strategy: auto  # Parent decides which sub-agents to call
    
    sub_agents:
      - id: ui_strategist
        role: UI/UX Strategist
        goal: Define user interface strategy and information architecture
        specialization: High-level UI planning and user flows
        trigger_conditions:
          - "needs ui planning"
          - "user experience design"
          - "information architecture"
      
      - id: ui_designer
        role: UI Designer
        goal: Create detailed component designs and styling
        specialization: Visual design and component specifications
        trigger_conditions:
          - "needs component design"
          - "styling required"
          - "visual design"
      
      - id: code_writer
        role: Frontend Code Writer
        goal: Implement components based on designs
        specialization: React/Vue/Angular code implementation
        tools:
          - code_execution
          - filesystem
        trigger_conditions:
          - "needs implementation"
          - "write code"
          - "build components"
      
      - id: code_reviewer
        role: Code Reviewer
        goal: Review code quality, best practices, and potential issues
        specialization: Code quality assurance
        trigger_conditions:
          - "review code"
          - "quality check"
          - "code complete"

  - id: backend
    role: Backend Development Lead
    goal: Design and implement backend services
    delegation_strategy: sequential
    
    sub_agents:
      - id: api_designer
        role: API Designer
        goal: Design RESTful API endpoints
      
      - id: db_architect
        role: Database Architect
        goal: Design database schema
      
      - id: implementation_engineer
        role: Implementation Engineer
        goal: Write backend code
Implementation
1. Sub-Agent Executor
Create src/agents/sub-agent-executor.ts:
typescriptimport { SubAgent, AgentV2 } from '../config/schema';
import { LLMProvider } from '../llm/provider';
import { ContextStore } from '../context/store';
import { MCPToolRegistry } from '../mcp/registry';

export interface SubAgentExecutionPlan {
  subAgentsToCall: string[];  // IDs of sub-agents
  reason: string;             // Why these sub-agents
  sequence: 'parallel' | 'sequential';
}

export class SubAgentExecutor {
  constructor(
    private llm: LLMProvider,
    private toolRegistry: MCPToolRegistry
  ) {}
  
  /**
   * Parent agent decides which sub-agents to invoke
   */
  async planSubAgentExecution(
    parent: AgentV2,
    userInput: string,
    context: ContextStore
  ): Promise<SubAgentExecutionPlan> {
    
    if (!parent.sub_agents || parent.sub_agents.length === 0) {
      return {
        subAgentsToCall: [],
        reason: 'No sub-agents available',
        sequence: 'sequential'
      };
    }
    
    // If strategy is explicit, use it
    if (parent.delegation_strategy === 'sequential') {
      return {
        subAgentsToCall: parent.sub_agents.map(s => s.id),
        reason: 'Sequential delegation strategy',
        sequence: 'sequential'
      };
    }
    
    if (parent.delegation_strategy === 'parallel') {
      return {
        subAgentsToCall: parent.sub_agents.map(s => s.id),
        reason: 'Parallel delegation strategy',
        sequence: 'parallel'
      };
    }
    
    // Auto mode: ask parent agent to decide
    const planningPrompt = this.buildPlanningPrompt(
      parent,
      userInput,
      context
    );
    
    const planResponse = await this.llm.generate(planningPrompt);
    
    return this.parsePlan(planResponse, parent.sub_agents);
  }
  
  private buildPlanningPrompt(
    parent: AgentV2,
    userInput: string,
    context: ContextStore
  ): { system: string; user: string } {
    
    const subAgentsList = parent.sub_agents!.map(sa => `
- ${sa.id} (${sa.role})
  Goal: ${sa.goal}
  Specialization: ${sa.specialization || 'General'}
  Triggers: ${sa.trigger_conditions?.join(', ') || 'Any'}
`).join('\n');
    
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
  
  private parsePlan(
    response: string,
    availableSubAgents: SubAgent[]
  ): SubAgentExecutionPlan {
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
        sequence: plan.sequence || 'sequential'
      };
      
    } catch (error) {
      // Fallback: use all sub-agents sequentially
      console.warn('Failed to parse plan, using fallback');
      return {
        subAgentsToCall: availableSubAgents.map(sa => sa.id),
        reason: 'Fallback: using all sub-agents',
        sequence: 'sequential'
      };
    }
  }
  
  /**
   * Execute sub-agents based on plan
   */
  async executeSubAgents(
    parent: AgentV2,
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
    parent: AgentV2
  ): Promise<Map<string, string>> {
    
    const outputs = new Map<string, string>();
    
    for (let i = 0; i < subAgents.length; i++) {
      const subAgent = subAgents[i];
      
      console.log(`    ↳ Sub-agent ${i + 1}/${subAgents.length}: ${subAgent.role}`);
      
      const prompt = this.buildSubAgentPrompt(
        subAgent,
        userInput,
        context,
        outputs,
        parent
      );
      
      const output = await this.llm.generate(prompt);
      
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
    parent: AgentV2
  ): Promise<Map<string, string>> {
    
    console.log(`    ⚡ Parallel execution of ${subAgents.length} sub-agents`);
    
    const promises = subAgents.map(async (subAgent) => {
      const prompt = this.buildSubAgentPrompt(
        subAgent,
        userInput,
        context,
        new Map(),  // No cross-contamination in parallel
        parent
      );
      
      const output = await this.llm.generate(prompt);
      
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
  
  private buildSubAgentPrompt(
    subAgent: SubAgent,
    userInput: string,
    context: ContextStore,
    previousSubOutputs: Map<string, string>,
    parent: AgentV2
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

    if (previousSubOutputs.size > 0) {
      user += `\n\nPrevious Sub-Agent Work:\n`;
      for (const [id, output] of previousSubOutputs.entries()) {
        user += `\n--- ${id} ---\n${output}\n`;
      }
    }
    
    user += `\n\nProvide your ${subAgent.role} contribution.`;
    
    return { system, user };
  }
  
  /**
   * Parent synthesizes sub-agent outputs
   */
  async synthesizeResults(
    parent: AgentV2,
    subAgentOutputs: Map<string, string>,
    userInput: string,
    context: ContextStore
  ): Promise<string> {
    
    const synthesisPrompt = this.buildSynthesisPrompt(
      parent,
      subAgentOutputs,
      userInput,
      context
    );
    
    return await this.llm.generate(synthesisPrompt);
  }
  
  private buildSynthesisPrompt(
    parent: AgentV2,
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
    
    return summaries.map(s => 
      `${s.role}: ${s.keyInsights?.join(', ') || 'No insights'}`
    ).join('\n');
  }
}
2. Context Store Enhancement
Update src/context/store.ts:
typescriptexport class ContextStore {
  // Existing properties...
  
  private subAgentOutputs: Map<string, Map<string, string>> = new Map();
  // parentId -> (subAgentId -> output)
  
  setSubAgentOutput(
    parentId: string,
    subAgentId: string,
    output: string
  ): void {
    if (!this.subAgentOutputs.has(parentId)) {
      this.subAgentOutputs.set(parentId, new Map());
    }
    
    this.subAgentOutputs.get(parentId)!.set(subAgentId, output);
    
    contextLogger.info({
      event: 'SUB_AGENT_OUTPUT_SET',
      parentId,
      subAgentId,
      outputLength: output.length
    }, `📝 Sub-agent output stored: ${parentId} > ${subAgentId}`);
  }
  
  getSubAgentOutputs(parentId: string): Map<string, string> {
    return this.subAgentOutputs.get(parentId) || new Map();
  }
  
  getAllSubAgentOutputs(): Map<string, Map<string, string>> {
    return this.subAgentOutputs;
  }
}
3. Orchestrator Integration
Update src/orchestrator/sequential.ts:
typescriptimport { SubAgentExecutor } from '../agents/sub-agent-executor';

export async function runSequentialWorkflow(params: {
  steps: { agent: string }[];
  registry: AgentRegistry;
  context: ContextStore;
  llm: LLMProvider;
  toolRegistry: MCPToolRegistry;
}) {
  const { steps, registry, context, llm, toolRegistry } = params;
  const subAgentExecutor = new SubAgentExecutor(llm, toolRegistry);
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const agent = registry.getAgent(step.agent);
    
    printAgentStart(agent.id, agent.role);
    
    // Check if agent has sub-agents
    if (agent.sub_agents && agent.sub_agents.length > 0) {
      console.log(`  🔍 Planning sub-agent delegation...`);
      
      // 1. Plan which sub-agents to use
      const plan = await subAgentExecutor.planSubAgentExecution(
        agent,
        context.userInput,
        context
      );
      
      console.log(`  📋 Plan: ${plan.reason}`);
      console.log(`  👥 Sub-agents: ${plan.subAgentsToCall.join(', ')}`);
      console.log(`  ⚙️  Mode: ${plan.sequence}`);
      console.log();
      
      // 2. Execute sub-agents
      const subOutputs = await subAgentExecutor.executeSubAgents(
        agent,
        plan,
        context.userInput,
        context
      );
      
      console.log(`  🔄 Synthesizing results...`);
      
      // 3. Parent synthesizes results
      const finalOutput = await subAgentExecutor.synthesizeResults(
        agent,
        subOutputs,
        context.userInput,
        context
      );
      
      context.setOutput(agent.id, finalOutput);
      
    } else {
      // Normal agent without sub-agents
      const prompt = buildPrompt(agent, context);
      const output = await llm.generate(prompt);
      context.setOutput(agent.id, output);
    }
    
    printAgentComplete(/* ... */);
  }
}
4. Parallel Sub-Agent Feedback
For parallel sub-agents with feedback loop:
typescriptasync function executeParallelSubAgentsWithFeedback(
  parent: AgentV2,
  subAgents: SubAgent[],
  userInput: string,
  context: ContextStore,
  llm: LLMProvider,
  maxIterations: number = 3
): Promise<Map<string, string>> {
  
  let iteration = 0;
  let approved = false;
  let subOutputs = new Map<string, string>();
  
  // Initial execution
  subOutputs = await executeParallel(subAgents, userInput, context, parent);
  
  while (!approved && iteration < maxIterations) {
    iteration++;
    
    console.log(`\n  🔄 Sub-agent feedback iteration ${iteration}/${maxIterations}`);
    
    // Parent reviews sub-agent work
    const reviewPrompt = buildReviewPrompt(
      parent,
      subOutputs,
      userInput,
      iteration
    );
    
    const review = await llm.generate(reviewPrompt);
    
    // Check if approved
    if (review.toUpperCase().includes('APPROVED')) {
      approved = true;
      console.log(`  ✅ Sub-agent work approved`);
      break;
    }
    
    // Extract feedback
    const feedback = extractSubAgentFeedback(review, subAgents);
    
    // Re-execute sub-agents with feedback
    console.log(`  📝 Sending feedback to sub-agents...`);
    
    subOutputs = await executeRevisionsParallel(
      subAgents,
      feedback,
      subOutputs,
      userInput,
      context,
      parent,
      llm
    );
  }
  
  return subOutputs;
}
Console Output Example
▶ Frontend Development Lead (frontend)
  🔍 Planning sub-agent delegation...
  📋 Plan: Need UI strategy first, then design, then implementation, then review
  👥 Sub-agents: ui_strategist, ui_designer, code_writer, code_reviewer
  ⚙️  Mode: sequential

    ↳ Sub-agent 1/4: UI/UX Strategist
    ✓ UI/UX Strategist complete

    ↳ Sub-agent 2/4: UI Designer
    ✓ UI Designer complete

    ↳ Sub-agent 3/4: Frontend Code Writer
      🔧 Tool call: code_execution
      ✓ Code written and tested
    ✓ Frontend Code Writer complete

    ↳ Sub-agent 4/4: Code Reviewer
    ✓ Code Reviewer complete

  🔄 Synthesizing results...
  
✓ Frontend Development Lead completed (12.3s)
  Final output: Complete frontend solution with strategy, designs, and implementation
Benefits
✅ Specialization: Each sub-agent excels in specific area
✅ Flexibility: Parent decides delegation dynamically
✅ Modularity: Easy to add/remove sub-agents
✅ Quality: Dedicated reviewer sub-agent
✅ Scalability: Hierarchical structure supports complexity
✅ Reusability: Sub-agents can be shared across parents
File Structure
src/
├── agents/
│   ├── agent.ts
│   ├── registry.ts
│   └── sub-agent-executor.ts  # NEW
├── config/
│   └── schema.ts              # Extended with sub-agents
└── orchestrator/
    ├── sequential.ts          # Enhanced
    └── parallel.ts            # Enhanced

configs/
├── demo-sub-agents.yml
└── demo-parallel-sub-agents.yml
Success Metrics

 Sub-agents execute based on parent decision
 Parent successfully synthesizes sub-outputs
 Feedback loops work for parallel sub-agents
 Tools accessible to sub-agents
 Context properly inherited
 Performance acceptable (<20s for 4 sub-agents)

Estimated Effort

Development: 7-9 days
Testing: 2-3 days
Documentation: 1-2 days
Total: ~2 weeks
