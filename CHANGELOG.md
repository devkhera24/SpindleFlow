# Changelog

## [2.0.0] - 2026-01-18

### Added - Major Features

#### Hierarchical Sub-Agent System
- **Sub-Agent Delegation**: Parent agents can now delegate work to specialized sub-agents
- **Three Delegation Strategies**:
  - `auto`: Intelligent selection based on task requirements and trigger conditions
  - `sequential`: All sub-agents execute in order, building on each other's work
  - `parallel`: All sub-agents execute concurrently for faster completion
- **Smart Planning**: Auto mode analyzes tasks and creates optimal execution plans
- **Context Inheritance**: Sub-agents inherit parent context and can access each other's outputs
- **Tool Support**: Sub-agents can use both standard tools and MCP tools
- **Specialization System**: Define expertise areas and trigger conditions per sub-agent

#### Persistent Memory with Pinecone
- **Vector Memory Storage**: Agent summaries stored in Pinecone for cross-workflow learning
- **Semantic Retrieval**: Relevant memories retrieved based on similarity to current task
- **Cross-Workflow Learning**: Sub-agents can access insights from previous workflows
- **Per-Agent Control**: Enable/disable persistent memory per agent with `enable_persistent_memory`
- **Namespace Support**: Isolate memories by domain or project
- **Automatic Embeddings**: Uses OpenAI text-embedding-3-small for vector creation
- **Graceful Degradation**: Works without Pinecone if API key not provided

### Modified

#### Core System
- `src/config/schema.ts`: Added `SubAgentSchema`, `delegation_strategy`, `enable_persistent_memory`, `pinecone_config`
- `src/agents/agent.ts`: Now re-exports types from schema for consistency
- `src/agents/registry.ts`: Simplified to use schema types directly
- `src/context/store.ts`: Added sub-agent output storage (`setSubAgentOutput`, `getSubAgentOutputs`)
- `src/orchestrator/sequential.ts`: Integrated sub-agent execution flow and persistent memory
- `src/orchestrator/parallel.ts`: Added sub-agent support and memory manager
- `src/orchestrator/parallel-iterative.ts`: Added memory manager parameter passing
- `src/orchestrator/engine.ts`: Initialize persistent memory manager and pass to workflows

#### Documentation
- `README.md`: Updated with new features, examples, and documentation links
- `.env.example`: Added `PINECONE_API_KEY` example

### New Files

#### Core Implementation
- `src/agents/sub-agent-executor.ts`: Sub-agent orchestration, planning, and synthesis
- `src/memory/persistent-memory.ts`: Pinecone integration and memory management

#### Configuration Examples
- `configs/demo-sub-agents.yml`: Sequential sub-agent delegation example
- `configs/demo-parallel-sub-agents.yml`: Parallel sub-agent delegation example
- `configs/test-sub-agents-simple.yml`: Simple test configuration

#### Documentation
- `SUB_AGENTS_AND_MEMORY.md`: Comprehensive guide (300+ lines)
- `QUICK_START_SUB_AGENTS.md`: 5-minute quick start guide
- `IMPLEMENTATION_SUMMARY.md`: Technical implementation details
- `CHANGELOG.md`: This file

### Performance

#### Typical Execution Times (4 sub-agents)
- **Sequential**: 12-18 seconds total
- **Parallel**: 6-12 seconds total
- **Memory Storage**: <1 second per agent
- **Memory Retrieval**: <1 second per query

### Dependencies

#### Already Included (No Installation Required)
- `@pinecone-database/pinecone@6.1.3`: Vector database integration
- `uuid@13.0.0`: Unique identifier generation

### Breaking Changes
- **None**: All changes are backward compatible
- Existing configurations work without modification
- New features are opt-in

### Migration Guide

#### To Use Sub-Agents
1. Add `sub_agents` array to parent agent
2. Set `delegation_strategy: auto | sequential | parallel`
3. Define sub-agent roles, goals, and specializations

```yaml
agents:
  - id: parent
    role: Parent Agent
    delegation_strategy: auto
    sub_agents:
      - id: child
        role: Child Agent
        goal: Specific task
```

#### To Use Persistent Memory
1. Sign up for Pinecone (free tier available)
2. Add environment variable: `PINECONE_API_KEY=your_key`
3. Add config section:
```yaml
pinecone_config:
  index_name: my-memory
  namespace: my-namespace
  dimension: 1536
```
4. Enable per agent: `enable_persistent_memory: true`

### Known Limitations
- Sub-agents support one level of nesting (no nested sub-agents)
- Embedding model hardcoded to OpenAI text-embedding-3-small
- Pinecone region hardcoded to AWS us-east-1
- Auto mode planning quality depends on LLM capabilities

### Future Enhancements Considered
- Nested sub-agents (sub-agents with their own sub-agents)
- Multiple embedding model support
- Memory analytics dashboard
- Automatic memory pruning
- Dynamic sub-agent generation
- Sub-agent level feedback loops

## [1.0.0] - Previous Release

- Sequential and parallel workflows
- Feedback loops with iterative refinement
- MCP tool integration (filesystem, web search, code execution)
- Multi-provider LLM support (Gemini, OpenAI)
- Context summarization
- Visualization (execution graphs, timing diagrams)
- Rate limiting
- Structured logging
