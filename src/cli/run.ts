import { loadYamlConfig } from "../config/loader";
import { RootConfigSchema, RootConfig } from "../config/schema";
import { validateSemantics } from "../config/validator";
import { AgentRegistry } from "../agents/registry";
import { getLLMProvider } from "../llm";
import { runWorkflow } from "../orchestrator/engine";
import { printFinalOutput } from "../reporter/console";
import { ContextStore } from "../context/store";

export async function runCommand(
  configPath: string,
  userInput: string
) {
  // 1. Load raw YAML
  const rawConfig = loadYamlConfig(configPath);

  // 2. Parse + validate structure (Zod is the source of truth)
  const parsed: RootConfig = RootConfigSchema.parse(rawConfig);

  // 3. Semantic validation (IDs, references, logic)
  validateSemantics(parsed);

  // 4. Build agent registry
  const registry = new AgentRegistry(parsed);

  // 5. Initialize shared context
  const context: ContextStore = {
    userInput,
    outputs: {},
    timeline: [],
  };

  // 6. Select LLM provider
  const llm = getLLMProvider();

  // 7. Execute workflow
  await runWorkflow({
    config: parsed,
    registry,
    context,
    llm,
  });

  // 8. Print final output
  printFinalOutput(context);
}
