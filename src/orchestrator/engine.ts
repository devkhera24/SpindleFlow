import { RootConfig } from "../config/schema";
import { AgentRegistry } from "../agents/registry";
import { ContextStore } from "../context/store";
import { LLMProvider } from "../llm/provider";
import { runSequentialWorkflow } from "./sequential";
import { runParallelWorkflow } from "./parallel";

export async function runWorkflow(params: {
  config: RootConfig;
  registry: AgentRegistry;
  context: ContextStore;
  llm: LLMProvider;
}) {
  const { config, registry, context, llm } = params;

  if (config.workflow.type === "sequential") {
    await runSequentialWorkflow({
      steps: config.workflow.steps,
      registry,
      context,
      llm,
    });
  }

  if (config.workflow.type === "parallel") {
    await runParallelWorkflow({
      branches: config.workflow.branches,
      then: config.workflow.then,
      registry,
      context,
      llm,
    });
  }
}
