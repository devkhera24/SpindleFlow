# Sub-Agent System & Persistent Memory

This document describes the sub-agent delegation system and Pinecone-based persistent memory features in SpindleFlow.

## Table of Contents

1. [Sub-Agent System](#sub-agent-system)
2. [Persistent Memory](#persistent-memory)
3. [Configuration](#configuration)
4. [Examples](#examples)
5. [Best Practices](#best-practices)

## Sub-Agent System

### Overview

The sub-agent system enables hierarchical agent delegation where parent agents can dynamically invoke specialized sub-agents based on task requirements. This follows the Claude Code pattern for intelligent task decomposition.

### Key Concepts

- **Parent Agent**: High-level orchestrator with a broad goal
- **Sub-Agents**: Specialized agents for specific subtasks
- **Smart Delegation**: Parent decides when to call which sub-agent (auto mode)
- **Delegation Strategies**: Sequential, parallel, or auto
- **Context Inheritance**: Sub-agents inherit parent's context and can access each other's work

### Delegation Strategies

#### 1. Auto (Recommended)
```yaml
delegation_strategy: auto
```
Parent agent intelligently decides which sub-agents to invoke and in what order based on the task.

#### 2. Sequential
```yaml
delegation_strategy: sequential
```
Execute all sub-agents in order, each building on the previous one's work.

#### 3. Parallel
```yaml
delegation_strategy: parallel
```
Execute all sub-agents concurrently for faster execution when tasks are independent.

### Configuration

#### Basic Sub-Agent Configuration

```yaml
agents:
  - id: parent_agent
    role: Parent Agent Role
    goal: High-level objective
    delegation_strategy: auto  # or sequential, parallel
    
    sub_agents:
      - id: sub_agent_1
        role: Specialist Role
        goal: Specific objective
        specialization: What this sub-agent excels at
        tools:
          - tool_name
        mcpTools:
          - mcp_tool_name
        trigger_conditions:  # Used in auto mode
          - "keyword or phrase"
          - "another trigger"
```

#### Sub-Agent Properties

- `id`: Unique identifier for the sub-agent
- `role`: The sub-agent's role/persona
- `goal`: Specific objective for this sub-agent
- `specialization`: (Optional) Description of expertise
- `tools`: (Optional) Standard tools the sub-agent can use
- `mcpTools`: (Optional) MCP tools the sub-agent can use
- `trigger_conditions`: (Optional) Keywords that trigger this sub-agent in auto mode

### Execution Flow

#### Auto Mode Flow

1. **Planning Phase**: Parent agent analyzes the task and creates an execution plan
2. **Sub-Agent Selection**: Parent decides which sub-agents to invoke
3. **Execution**: Sub-agents execute according to the plan (sequential or parallel)
4. **Synthesis**: Parent integrates all sub-agent outputs into a cohesive solution

#### Output Example

```
▶ Frontend Development Lead (frontend_lead)
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
```

## Persistent Memory

### Overview

Persistent memory uses Pinecone vector database to store agent context across workflows. This enables agents to:

- Learn from previous workflows
- Access relevant context from other agent executions
- Build institutional knowledge over time
- Improve consistency across similar tasks

### How It Works

1. **Storage**: After each agent completes, its summary (insights, decisions, artifacts) is stored in Pinecone
2. **Embedding**: Context is converted to vectors using OpenAI embeddings
3. **Retrieval**: Future agents can query relevant memories based on semantic similarity
4. **Context Enhancement**: Retrieved memories are added to agent prompts

### Configuration

#### Enable Pinecone

```yaml
# Global configuration
pinecone_config:
  api_key: your_api_key  # Optional: defaults to PINECONE_API_KEY env var
  index_name: spindleflow-memory
  namespace: your-namespace
  dimension: 1536  # OpenAI embedding dimension

# Per-agent configuration
agents:
  - id: my_agent
    role: Agent Role
    goal: Agent goal
    enable_persistent_memory: true  # Enable for this agent
```

#### Environment Variables

```bash
# Required for persistent memory
export PINECONE_API_KEY=your_pinecone_api_key

# Required for embeddings
export OPENAI_API_KEY=your_openai_api_key
```

### Memory Structure

Each memory entry contains:

- **Agent ID & Role**: Who created this memory
- **Content**: Full agent output
- **Key Insights**: Summarized learnings (3-5 points)
- **Decisions**: Key decisions made
- **Artifacts**: Files/outputs created
- **Timestamp**: When this was created
- **Workflow ID**: Which workflow this came from
- **Metadata**: Duration, step number, etc.

### Querying Memories

When a sub-agent with persistent memory enabled executes:

1. Query text is constructed from the sub-agent's role, goal, and user input
2. Text is converted to embedding vector
3. Top K (default: 3) most relevant memories are retrieved
4. Memories are added to the sub-agent's prompt with relevance scores

### Memory in Prompts

Retrieved memories appear in the prompt like this:

```
Relevant Past Context from Other Workflows:

[UI Designer - 1/18/2026, 2:30 PM] (relevance: 89.3%)
Key Insights: Used Tailwind CSS for rapid prototyping; Implemented dark mode support
Decisions: Chose mobile-first approach; Used CSS Grid for layout

[Frontend Code Writer - 1/17/2026, 4:15 PM] (relevance: 76.8%)
Key Insights: React hooks pattern for state; TypeScript for type safety
Decisions: Used Context API instead of Redux
```

## Configuration

### Complete Example

```yaml
models:
  gpt4:
    provider: openai
    model: gpt-4
    max_tokens: 4000

provider: gpt4

# Persistent memory configuration
pinecone_config:
  index_name: spindleflow-memory
  namespace: frontend-dev
  dimension: 1536

agents:
  - id: frontend_lead
    role: Frontend Development Lead
    goal: Create production-ready frontend
    delegation_strategy: auto
    enable_persistent_memory: true
    
    sub_agents:
      - id: strategist
        role: UX Strategist
        goal: Define user experience
        specialization: UX design and user flows
        trigger_conditions:
          - "user experience"
          - "wireframe"
      
      - id: implementer
        role: Code Implementer
        goal: Write production code
        specialization: React implementation
        mcpTools:
          - filesystem
        trigger_conditions:
          - "write code"
          - "implement"

workflow:
  type: sequential
  steps:
    - agent: frontend_lead
```

## Examples

### Example 1: Frontend Development Team

```yaml
agents:
  - id: frontend
    role: Frontend Lead
    goal: Complete frontend solution
    delegation_strategy: auto
    enable_persistent_memory: true
    
    sub_agents:
      - id: ui_strategist
        role: UI/UX Strategist
        goal: Define UI strategy
        specialization: User flows and IA
      
      - id: ui_designer
        role: UI Designer
        goal: Component designs
        specialization: Visual design
      
      - id: coder
        role: Code Writer
        goal: Implement components
        specialization: React/TypeScript
        mcpTools:
          - filesystem
      
      - id: reviewer
        role: Code Reviewer
        goal: Quality assurance
        specialization: Best practices
```

### Example 2: Backend API Development

```yaml
agents:
  - id: backend
    role: Backend Lead
    goal: Build REST API
    delegation_strategy: sequential
    enable_persistent_memory: true
    
    sub_agents:
      - id: api_designer
        role: API Designer
        goal: Design endpoints
      
      - id: db_architect
        role: DB Architect
        goal: Design schema
      
      - id: implementer
        role: Backend Engineer
        goal: Write API code
        mcpTools:
          - filesystem
          - code_execution
```

### Example 3: Parallel Specialists

```yaml
agents:
  - id: fullstack
    role: Full Stack Lead
    goal: Complete application
    delegation_strategy: parallel
    enable_persistent_memory: true
    
    sub_agents:
      - id: frontend_expert
        role: Frontend Expert
        goal: Handle frontend
      
      - id: backend_expert
        role: Backend Expert
        goal: Handle backend
      
      - id: devops_expert
        role: DevOps Expert
        goal: Handle deployment
```

## Best Practices

### Sub-Agent Design

1. **Clear Specializations**: Each sub-agent should have a distinct area of expertise
2. **Appropriate Granularity**: Not too fine-grained (too many sub-agents) or too coarse
3. **Trigger Conditions**: Provide clear keywords for auto mode
4. **Tool Assignment**: Give tools only to sub-agents that need them

### Delegation Strategy Selection

- **Auto**: Best for complex, variable tasks where flexibility is needed
- **Sequential**: When sub-agents must build on each other's work
- **Parallel**: When sub-agents work on independent aspects

### Persistent Memory

1. **Enable Selectively**: Only enable for agents whose context should persist
2. **Namespace Strategy**: Use different namespaces for different domains (frontend, backend, etc.)
3. **Index Management**: One index can serve multiple namespaces
4. **Regular Cleanup**: Consider periodically archiving old memories

### Performance Considerations

- **Sub-Agent Count**: 3-5 sub-agents is optimal; more may slow execution
- **Parallel vs Sequential**: Parallel is faster but uses more API quota
- **Memory Retrieval**: Limit topK (default: 3) for faster queries
- **Embedding Costs**: Each memory storage requires an embedding API call

### Security

1. **API Keys**: Use environment variables, never hardcode
2. **Namespace Isolation**: Use separate namespaces for different projects/clients
3. **Memory Content**: Be mindful of sensitive data in stored memories
4. **Access Control**: Pinecone API key grants full access to the index

## Troubleshooting

### Sub-Agents Not Executing

- Check `delegation_strategy` is set
- Verify `sub_agents` array is not empty
- In auto mode, ensure trigger_conditions are relevant to the task

### Persistent Memory Not Working

- Verify `PINECONE_API_KEY` environment variable is set
- Verify `OPENAI_API_KEY` is set (for embeddings)
- Check `enable_persistent_memory: true` is set on the agent
- Check logs for initialization errors

### Poor Memory Retrieval

- Improve trigger_conditions specificity
- Use more descriptive agent roles and goals
- Consider adjusting topK parameter
- Ensure consistent namespace usage

## API Reference

### Schema Types

```typescript
// Sub-agent schema
export interface SubAgent {
  id: string;
  role: string;
  goal: string;
  tools?: string[];
  mcpTools?: string[];
  specialization?: string;
  trigger_conditions?: string[];
}

// Pinecone configuration
export interface PineconeConfig {
  api_key?: string;
  index_name: string;
  namespace: string;
  dimension: number;
}

// Agent with sub-agents
export interface Agent {
  id: string;
  role: string;
  goal: string;
  tools?: string[];
  mcpTools?: string[];
  sub_agents?: SubAgent[];
  delegation_strategy?: 'auto' | 'sequential' | 'parallel';
  enable_persistent_memory?: boolean;
}
```

### Memory Manager Methods

```typescript
// Initialize Pinecone connection
await memoryManager.initialize();

// Store a memory
await memoryManager.storeMemory(entry, embedding);

// Query relevant memories
const memories = await memoryManager.queryRelevantMemories(
  queryEmbedding,
  topK = 3,
  filter?
);

// Check if initialized
const isReady = memoryManager.isInitialized();
```

## Migration Guide

### From Non-Hierarchical Agents

**Before:**
```yaml
agents:
  - id: ui_designer
    role: UI Designer
    goal: Design UI
  
  - id: code_writer
    role: Code Writer
    goal: Write code

workflow:
  type: sequential
  steps:
    - agent: ui_designer
    - agent: code_writer
```

**After:**
```yaml
agents:
  - id: frontend_lead
    role: Frontend Lead
    goal: Complete frontend
    delegation_strategy: auto
    
    sub_agents:
      - id: ui_designer
        role: UI Designer
        goal: Design UI
      
      - id: code_writer
        role: Code Writer
        goal: Write code

workflow:
  type: sequential
  steps:
    - agent: frontend_lead
```

### Adding Persistent Memory

1. Add Pinecone configuration to your YAML
2. Set environment variables
3. Enable `enable_persistent_memory: true` on desired agents
4. Run your workflow - memories will automatically be stored and retrieved

## Performance Metrics

Typical execution times (4 sub-agents, auto mode):

- **Planning**: 2-3s
- **Sub-Agent Execution** (sequential): 8-12s total
- **Sub-Agent Execution** (parallel): 3-5s total
- **Synthesis**: 2-3s
- **Memory Storage**: <1s per agent
- **Memory Retrieval**: <1s per query

Total: 12-20s for sequential, 6-12s for parallel

## Changelog

### v2.0.0 (Current)

- Added hierarchical sub-agent system
- Implemented auto delegation strategy
- Added Pinecone persistent memory
- Sub-agents can use tools and MCP tools
- Memory retrieval in sub-agent prompts
- Context inheritance between sub-agents

### v1.0.0

- Basic agent orchestration
- Sequential and parallel workflows
- Tool invocation
- Context summarization
