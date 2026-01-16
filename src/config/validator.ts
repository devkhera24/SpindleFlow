import { RootConfig } from "./schema";
import {
  createDuplicateAgentError,
  createUnknownAgentError,
  createAggregatorInBranchesError,
} from "./errors";

export function validateSemantics(config: RootConfig) {
  const agentIds = new Set<string>();

  // Check for duplicate agent IDs
  for (const agent of config.agents) {
    if (agentIds.has(agent.id)) {
      throw createDuplicateAgentError(agent.id);
    }
    agentIds.add(agent.id);
  }

  const availableAgents = Array.from(agentIds);

  const assertAgentExists = (id: string, stepIndex?: number) => {
    if (!agentIds.has(id)) {
      throw createUnknownAgentError(id, availableAgents, config.workflow.type, stepIndex);
    }
  };

  // Validate workflow-specific semantics
  if (config.workflow.type === "sequential") {
    config.workflow.steps.forEach((step, index) =>
      assertAgentExists(step.agent, index)
    );
  }

  if (config.workflow.type === "parallel") {
    // Check branches reference valid agents
    config.workflow.branches.forEach(assertAgentExists);
    
    // Check aggregator agent exists
    assertAgentExists(config.workflow.then.agent);
    
    // Check that aggregator is not in branches
    if (config.workflow.branches.includes(config.workflow.then.agent)) {
      throw createAggregatorInBranchesError(config.workflow.then.agent);
    }
  }
}
