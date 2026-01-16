import { ZodError } from "zod";
import chalk from "chalk";

/**
 * Custom error classes for different types of configuration errors
 */

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly details?: string,
    public readonly suggestions?: string[]
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

export class FileLoadingError extends ConfigError {
  constructor(filePath: string, reason: string, suggestions: string[]) {
    super(`Failed to load configuration file: ${filePath}`, reason, suggestions);
    this.name = "FileLoadingError";
  }
}

export class YAMLParsingError extends ConfigError {
  constructor(filePath: string, yamlError: Error, suggestions: string[]) {
    super(`Failed to parse YAML file: ${filePath}`, yamlError.message, suggestions);
    this.name = "YAMLParsingError";
  }
}

export class SchemaValidationError extends ConfigError {
  constructor(zodError: ZodError, suggestions: string[]) {
    super("Your configuration file has validation errors", formatZodError(zodError), suggestions);
    this.name = "SchemaValidationError";
  }
}

export class SemanticValidationError extends ConfigError {
  constructor(message: string, details: string, suggestions: string[]) {
    super(message, details, suggestions);
    this.name = "SemanticValidationError";
  }
}

/**
 * Format Zod validation errors into readable output
 */
function formatZodError(error: ZodError): string {
  const lines: string[] = [];
  
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    lines.push(`  At "${path}":`);
    lines.push(`    • ${issue.message}`);
  }
  
  return lines.join("\n");
}

/**
 * Print formatted error message to console
 */
export function printConfigError(error: ConfigError): void {
  console.error("\n" + chalk.red.bold("❌ Configuration Error"));
  console.error("\n" + chalk.white(error.message));
  
  if (error.details) {
    console.error("\n" + chalk.cyan.bold("📋 Details:"));
    console.error(chalk.gray(error.details));
  }
  
  if (error.suggestions && error.suggestions.length > 0) {
    console.error("\n" + chalk.yellow.bold("💡 Suggestions:"));
    error.suggestions.forEach((suggestion, index) => {
      console.error(chalk.yellow(`  ${index + 1}. ${suggestion}`));
    });
  }
  
  console.error(""); // Empty line at the end
}

/**
 * Helper functions to create specific error types
 */

export function createFileNotFoundError(filePath: string): FileLoadingError {
  return new FileLoadingError(
    filePath,
    `File does not exist: ${filePath}`,
    [
      "Check that the file path is correct",
      "Make sure the file exists in the specified location",
      "Use an absolute path or a path relative to your current directory",
    ]
  );
}

export function createFileIsDirectoryError(filePath: string): FileLoadingError {
  return new FileLoadingError(
    filePath,
    `Path points to a directory, not a file: ${filePath}`,
    [
      "Provide a path to a YAML file, not a directory",
      "Example: configs/demo-sequential.yml",
    ]
  );
}

export function createFileEmptyError(filePath: string): FileLoadingError {
  return new FileLoadingError(
    filePath,
    `Configuration file is empty: ${filePath}`,
    [
      "Add your configuration content to the file",
      "Check example configs in the configs/ directory",
      "A valid config must have 'agents' and 'workflow' sections",
    ]
  );
}

export function createFilePermissionError(filePath: string, error: Error): FileLoadingError {
  return new FileLoadingError(
    filePath,
    `Permission denied or unable to read file: ${error.message}`,
    [
      "Check file permissions (use chmod to fix)",
      "Make sure you have read access to the file",
      "Verify the file is not locked by another process",
    ]
  );
}

export function createYAMLParsingError(filePath: string, error: Error): YAMLParsingError {
  const suggestions = [
    "Check for proper YAML indentation (use spaces, not tabs)",
    "Ensure all keys and values are properly formatted",
    "Verify that colons are followed by a space (e.g., 'key: value')",
    "Check for unmatched quotes or brackets",
    "Common YAML mistakes:",
    "  - Mixing tabs and spaces",
    "  - Missing space after colon",
    "  - Incorrect indentation levels",
    "  - Unclosed quotes",
    "Use a YAML validator online or check example files in configs/ directory",
  ];
  
  return new YAMLParsingError(filePath, error, suggestions);
}

export function createSchemaValidationError(zodError: ZodError): SchemaValidationError {
  const suggestions = [
    "Make sure all agents have 'id', 'role', and 'goal' fields",
    "Workflow type must be either 'sequential' or 'parallel'",
    "Check the demo configs for examples: configs/demo-sequential.yml or configs/demo-parallel.yml",
  ];
  
  return new SchemaValidationError(zodError, suggestions);
}

export function createDuplicateAgentError(agentId: string): SemanticValidationError {
  return new SemanticValidationError(
    `Duplicate agent ID found: "${agentId}"`,
    `Problem with agent: "${agentId}"`,
    [
      "Each agent must have a unique ID",
      "Check your 'agents' section for duplicate IDs",
      `Found multiple agents with ID: "${agentId}"`,
    ]
  );
}

export function createUnknownAgentError(
  agentId: string,
  availableAgents: string[],
  workflowType: "sequential" | "parallel",
  stepIndex?: number
): SemanticValidationError {
  const stepInfo = stepIndex !== undefined 
    ? `${workflowType === "sequential" ? "Sequential" : "Parallel"} workflow step ${stepIndex + 1}` 
    : `${workflowType === "sequential" ? "Sequential" : "Parallel"} workflow`;
    
  return new SemanticValidationError(
    `${stepInfo} references unknown agent: "${agentId}"`,
    `Problem with agent: "${agentId}"`,
    [
      `Agent "${agentId}" is not defined in the 'agents' section`,
      `Available agents: ${availableAgents.join(", ")}`,
      "Make sure the agent ID matches exactly (IDs are case-sensitive)",
      "Check for typos in agent IDs",
    ]
  );
}

export function createAggregatorInBranchesError(agentId: string): SemanticValidationError {
  return new SemanticValidationError(
    `Aggregator agent "${agentId}" is also listed in parallel branches`,
    `Problem with agent: "${agentId}"`,
    [
      "The 'then' agent should be different from branch agents",
      "The aggregator runs after all branches complete",
      `Remove "${agentId}" from branches or use a different agent for 'then'`,
    ]
  );
}

export function createEmptyWorkflowError(workflowType: "sequential" | "parallel"): SemanticValidationError {
  if (workflowType === "sequential") {
    return new SemanticValidationError(
      "Sequential workflow has no steps",
      "The 'steps' array is empty",
      [
        "Add at least one step to your sequential workflow",
        "Each step must reference an agent by ID",
        "Example: steps: [{agent: 'researcher'}]",
      ]
    );
  } else {
    return new SemanticValidationError(
      "Parallel workflow has no branches",
      "The 'branches' array is empty",
      [
        "Add at least one branch to your parallel workflow",
        "Each branch must reference an agent by ID",
        "Example: branches: ['researcher', 'analyst']",
      ]
    );
  }
}
