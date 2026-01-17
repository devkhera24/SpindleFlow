import { RootConfig } from "../config/schema";
import { AgentRegistry } from "../agents/registry";
import { ContextStore } from "../context/store";
import { LLMProvider } from "../llm/provider";
import { MCPToolRegistry } from "../mcp/registry";
import { runSequentialWorkflow } from "./sequential";
import { runParallelWorkflow } from "./parallel";
import { runIterativeParallelWorkflow } from "./parallel-iterative";
import { orchestratorLogger } from "../logger/enhanced-logger";
import { PersistentMemoryManager } from "../memory/persistent-memory";
import { v4 as uuidv4 } from 'uuid';

export async function runWorkflow(params: {
  config: RootConfig;
  registry: AgentRegistry;
  context: ContextStore;
  llm: LLMProvider;
  mcpRegistry?: MCPToolRegistry;
}) {
  const { config, registry, context, llm, mcpRegistry } = params;

  // Initialize persistent memory if configured
  let memoryManager: PersistentMemoryManager | undefined;
  if (config.pinecone_config) {
    memoryManager = new PersistentMemoryManager(config.pinecone_config);
    await memoryManager.initialize();
  }

  const workflowId = uuidv4();

  if (config.workflow.type === "sequential") {
    await runSequentialWorkflow({
      steps: config.workflow.steps,
      registry,
      context,
      llm,
      mcpRegistry,
      memoryManager,
      workflowId,
    });
  }

  if (config.workflow.type === "parallel") {
    const feedbackLoop = config.workflow.then.feedback_loop;

    if (feedbackLoop?.enabled) {
      orchestratorLogger.info({
        event: "WORKFLOW_TYPE_SELECTED",
        type: "parallel-iterative",
        maxIterations: feedbackLoop.max_iterations,
      }, `🔄 Using iterative parallel workflow (feedback loop enabled)`);

      await runIterativeParallelWorkflow({
        branches: config.workflow.branches,
        then: {
          agent: config.workflow.then.agent,
          feedback_loop: feedbackLoop,
        },
        registry,
        context,
        llm,
        mcpRegistry,
        memoryManager,
        workflowId,
      });
    } else {
      orchestratorLogger.info({
        event: "WORKFLOW_TYPE_SELECTED",
        type: "parallel",
      }, `⚡ Using standard parallel workflow`);

      await runParallelWorkflow({
        branches: config.workflow.branches,
        then: config.workflow.then,
        registry,
        context,
        llm,
        mcpRegistry,
        memoryManager,
        workflowId,
      });
    }
  }
}
