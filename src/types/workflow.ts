export type AgentConfig = {
  id: string;
  role: string;
  goal: string;
  tools?: string[];
};

export type SequentialWorkflow = {
  type: "sequential";
  steps: { agent: string }[];
};

export type ParallelWorkflow = {
  type: "parallel";
  branches: string[];
  then: { agent: string };
};

export type WorkflowConfig = SequentialWorkflow | ParallelWorkflow;

export type RootConfig = {
  agents: AgentConfig[];
  workflow: WorkflowConfig;
};
