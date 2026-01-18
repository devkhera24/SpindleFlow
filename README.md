# SpindleFlow

**Declarative YAML-driven multi-agent orchestration engine for building complex AI workflows**

SpindleFlow is a powerful framework that enables you to orchestrate multiple AI agents using simple YAML configuration files. Design sophisticated multi-agent systems with sequential or parallel execution, hierarchical sub-agent delegation, persistent memory, and real-time visualization—all without writing code.

---

## 🎯 Key Features

### Multi-Agent Orchestration
- **Sequential Workflows** - Agents execute one after another, each building on previous outputs
- **Parallel Workflows** - Multiple agents work concurrently with aggregator synthesis
- **Hybrid Workflows** - Combine parallel branches with sequential aggregation
- **Context Sharing** - Agents share context and outputs throughout the workflow

### Hierarchical Sub-Agent System
- **Smart Delegation** - Parent agents intelligently delegate tasks to specialized sub-agents
- **Three Delegation Strategies**:
  - **Auto Mode** - Parent analyzes tasks and decides which sub-agents to invoke
  - **Sequential Mode** - All sub-agents execute in order
  - **Parallel Mode** - Sub-agents execute concurrently
- **Context Inheritance** - Sub-agents inherit parent context and access sibling outputs
- **Tool Support** - Sub-agents can use both standard and MCP tools independently

### Persistent Memory System
- **Cross-Workflow Learning** - Agents remember insights across different workflow executions
- **Pinecone Integration** - Vector-based semantic memory retrieval
- **Local Embeddings** - Zero API costs using local sentence transformers (all-MiniLM-L6-v2)
- **Semantic Search** - Retrieve relevant memories based on agent role and task
- **Namespace Isolation** - Separate memory spaces for different projects

### Iterative Feedback Loops
- **Multi-Agent Refinement** - Reviewer agents can send feedback to specific agents for improvements
- **Configurable Iterations** - Set maximum iteration counts and approval keywords
- **Targeted Feedback** - Direct feedback to specific agents in parallel workflows
- **Automatic Approval Detection** - Workflow completes when reviewer approves

### MCP (Model Context Protocol) Tool Integration
- **Pre-built Tools**: Filesystem, web search, code execution
- **Dynamic Tool Discovery** - Tools automatically discovered and made available to agents
- **Per-Agent Tool Configuration** - Assign specific tools to individual agents
- **Sandboxed Execution** - Safe execution environment with configurable limits

### Multi-Provider LLM Support
- **OpenAI Integration** - GPT-4, GPT-4o, GPT-4o-mini, and other models
- **Google Gemini Integration** - Gemini 1.5 Flash, Gemini 2.5 Flash, and other models
- **Model Configuration** - Define multiple models and switch between them
- **Rate Limiting** - Built-in rate limiters with exponential backoff and caching

### Real-Time Visualization
- **Terminal UI** - Beautiful command-line visualization with progress bars, status indicators, and execution timelines
- **Web Dashboard** - Live WebSocket-powered dashboard showing:
  - Real-time execution timeline
  - Active agents with progress tracking
  - Memory operation statistics
  - Workflow execution metrics
- **Execution Graphs** - Visual context and timing graphs saved after execution

### Robust Error Handling
- **Comprehensive Validation** - YAML syntax, schema validation, and semantic checks
- **Clear Error Messages** - Detailed errors with suggestions for fixes
- **Validation on Load** - Catch configuration errors before execution starts
- **Helpful Suggestions** - Actionable guidance for resolving issues

---

## 🚀 Quick Start

### Installation

Install dependencies:

### Configuration

Create a YAML workflow configuration file. SpindleFlow uses a declarative format to define agents, models, and execution workflows.

### Running Workflows

Execute a workflow with an input prompt:

Add optional flags for enhanced functionality:
- `--dashboard` - Launch real-time web dashboard at http://localhost:3001
- `--graphs` - Generate and save execution visualization graphs

---

## � Complete Example Configuration

Here's a fully-featured YAML configuration demonstrating multiple key features:

```yaml
# Multi-agent workflow with sub-agents, persistent memory, and MCP tools

models:
  gemini:
    provider: gemini
    model: gemini-2.5-flash-lite
    max_tokens: 8000
  openai:
    provider: openai
    model: gpt-4o-mini
    max_tokens: 4096

provider: gemini

# Persistent memory configuration (optional)
pinecone_config:
  index_name: spindleflow-example
  namespace: demo-workflow
  dimension: 384
  embedding_provider: local  # Free local embeddings, no API costs

# Global tool configuration (optional)
tool_config:
  filesystem:
    working_directory: ./workspace
    allowed_extensions: [".txt", ".md", ".json", ".yml"]
  code_execution:
    timeout: 10000
    memory_limit: 16

agents:
  # Parent agent with hierarchical sub-agents
  - id: technical_lead
    role: Technical Lead
    goal: Design a complete full-stack application architecture
    delegation_strategy: auto  # Intelligently decides which sub-agents to invoke
    enable_persistent_memory: true
    
    sub_agents:
      # Specialized sub-agent for backend design
      - id: backend_specialist
        role: Backend Architect
        goal: Design scalable backend architecture with APIs and database
        specialization: Backend systems, APIs, databases, authentication
        trigger_conditions:
          - "backend"
          - "api"
          - "database"
          - "server"
      
      # Specialized sub-agent for frontend design
      - id: frontend_specialist
        role: Frontend Architect
        goal: Design modern frontend with component structure and state management
        specialization: Frontend frameworks, UI components, state management
        trigger_conditions:
          - "frontend"
          - "ui"
          - "components"
          - "interface"
      
      # Specialized sub-agent with tool access
      - id: documentation_writer
        role: Documentation Specialist
        goal: Create comprehensive technical documentation
        specialization: Technical writing, documentation, examples
        mcpTools:
          - filesystem
        trigger_conditions:
          - "documentation"
          - "docs"
          - "readme"

  # Research agent with web search capability
  - id: researcher
    role: Technology Researcher
    goal: Research latest technologies and best practices for the application
    enable_persistent_memory: true
    mcpTools:
      - web_search
      - filesystem

  # Final reviewer agent
  - id: chief_architect
    role: Chief Architect
    goal: Review all designs and provide final integrated architecture recommendation
    enable_persistent_memory: true

workflow:
  type: parallel
  branches:
    - technical_lead
    - researcher
  then:
    agent: chief_architect
```

**To run this configuration:**

```bash
npm run dev -- run example-config.yml -i "Design a real-time chat application with React and Node.js"
```

This example demonstrates:
- Multiple model providers (Gemini and OpenAI)
- Persistent memory with local embeddings
- Hierarchical sub-agents with auto delegation
- MCP tool integration (filesystem, web_search)
- Parallel workflow with aggregator
- Specialized agents with trigger conditions

---

## �📝 YAML Configuration Format

### Basic Structure

All SpindleFlow configuration files follow this structure:

**models** - Define LLM providers and model configurations

**provider** - Select which model provider to use (references a key in models)

**pinecone_config** (optional) - Configure persistent memory storage

**agents** - Define all agents with roles, goals, and capabilities

**workflow** - Specify execution pattern (sequential or parallel)

---

## 🔧 Workflow Types

### Sequential Workflow

Agents execute one after another in order. Each agent receives outputs from all previous agents.

**Configuration Pattern:**
- `workflow.type`: Set to "sequential"
- `workflow.steps`: Array of agents to execute in order
- Each step references an agent ID

**Use Cases:**
- Progressive refinement pipelines
- Multi-stage analysis
- Build processes with dependencies

### Parallel Workflow

Multiple agents execute concurrently, then an aggregator synthesizes their outputs.

**Configuration Pattern:**
- `workflow.type`: Set to "parallel"
- `workflow.branches`: Array of agent IDs to execute concurrently
- `workflow.then.agent`: Aggregator agent ID
- `workflow.then.feedback_loop` (optional): Enable iterative refinement

**Use Cases:**
- Independent task execution
- Multi-perspective analysis
- Faster execution when tasks don't depend on each other

---

## 👥 Agent Configuration

### Standard Agent

Basic agent configuration includes:
- `id`: Unique identifier for the agent
- `role`: Agent's role or persona
- `goal`: Specific objective for the agent
- `tools` (optional): Array of standard tool names
- `mcpTools` (optional): Array of MCP tool names
- `enable_persistent_memory` (optional): Enable cross-workflow memory

### Agent with Sub-Agents

Parent agents can delegate to specialized sub-agents:
- `delegation_strategy`: How to invoke sub-agents (auto, sequential, or parallel)
- `sub_agents`: Array of sub-agent definitions

**Sub-Agent Properties:**
- `id`: Unique identifier
- `role`: Specialized role
- `goal`: Specific objective
- `specialization`: Description of expertise
- `trigger_conditions`: Keywords for auto-mode selection
- `tools`: Sub-agent specific tools
- `mcpTools`: Sub-agent specific MCP tools

---

## 🧠 Persistent Memory Configuration

Enable agents to remember insights across workflow executions.

**Configuration:**
- `index_name`: Pinecone index name
- `namespace`: Namespace for memory isolation
- `dimension`: Vector dimension (384 for local, 1536 for OpenAI)
- `embedding_provider`: "local" (free, no API) or "openai" (requires key)

**Local Embeddings (Recommended):**
- Uses all-MiniLM-L6-v2 model
- Zero API costs
- No rate limits
- 384-dimensional vectors
- Automatic model caching

**OpenAI Embeddings:**
- Uses text-embedding-3-small
- Requires OPENAI_API_KEY
- 1536-dimensional vectors
- Subject to API rate limits

---

## 🔄 Feedback Loops

Enable iterative refinement where a reviewer can send feedback to agents for improvements.

**Configuration:**
- `enabled`: Set to true
- `max_iterations`: Maximum refinement cycles
- `approval_keyword`: Keyword that signals approval (e.g., "APPROVED")
- `feedback_targets`: Array of agent IDs that can receive feedback

**How It Works:**
1. Parallel agents execute
2. Aggregator reviews outputs
3. If not approved, provides targeted feedback
4. Specified agents re-execute with feedback context
5. Repeats until approved or max iterations reached

---

## 🛠️ MCP Tools

SpindleFlow supports Model Context Protocol tools for extended capabilities.

### Available Tools

**filesystem** - File operations (read, write, list directories)
- Configuration: `working_directory`, `allowed_extensions`

**web_search** - Internet search capabilities
- Configuration: `search_engine` (google)
- Requires GOOGLE_API_KEY and GOOGLE_CX

**code_execution** - Safe code execution sandbox
- Configuration: `timeout`, `memory_limit`

### Tool Configuration

Global tool settings:

Per-agent tool assignment:

---

## 🌐 Real-Time Dashboard

Launch the web dashboard for live workflow visualization.

**Features:**
- Live execution timeline with color-coded events
- Active agents panel with real-time progress
- Statistics dashboard (workflows, agents, memory queries)
- WebSocket-powered real-time updates
- Clear history functionality

**Access:** Open http://localhost:3001 in your browser after starting with `--dashboard` flag

---

## 📊 Model Providers

### OpenAI Configuration

Supported models:gpt-4o-mini

Environment variable required: OPENAI_API_KEY

### Gemini Configuration

Supported models: gemini-2.5-flash-lite, gemini-flash-latest

Environment variable required: GEMINI_API_KEY

### Multiple Models

Define multiple models and select one as the default provider.

---

## 📂 Example Configurations

### Sequential Analysis Pipeline

Simple three-stage sequential workflow for system design.

### Parallel Multi-Perspective Analysis

Concurrent execution with aggregator synthesis.

### Hierarchical Sub-Agent System

Parent agent with specialized sub-agents using auto delegation.

### Iterative Feedback Workflow

Parallel execution with review-driven refinement.

---

## 🔍 Error Handling

SpindleFlow provides comprehensive error detection and helpful messages:

**Configuration Errors:**
- Missing required fields
- Duplicate agent IDs
- Unknown agent references
- Invalid workflow types

**YAML Errors:**
- Syntax errors
- Indentation issues
- Invalid data types

**Runtime Errors:**
- API failures with retry logic
- Rate limit handling with exponential backoff
- Tool execution errors

All errors include clear descriptions and actionable suggestions for fixes.

---

## 🌟 Advanced Features

### Context Management
- Intelligent context summarization
- Cross-agent context sharing
- Sub-agent context inheritance



## 📝 Environment Variables

Create a `.env` file in the project root:

**Required (based on usage):**
- `OPENAI_API_KEY` - For OpenAI models or OpenAI embeddings
- `GEMINI_API_KEY` - For Gemini models
- `PINECONE_API_KEY` - For persistent memory
- `GOOGLE_API_KEY` - For web search tool
- `GOOGLE_CX` - Google Custom Search Engine ID

---

## 🤝 Contributing

SpindleFlow is designed to be extensible. Contributions are welcome for:
- New LLM provider integrations
- Additional MCP tools
- Enhanced visualization features
- Workflow patterns and templates

---


## 🔗 Links

- **Repository**: https://github.com/devkhera24/SpindleFlow
- **Issues**: https://github.com/devkhera24/SpindleFlow/issues

---

## 💡 Tips for Best Results

**Agent Design:**
- Write clear, specific goals for each agent
- Define distinct roles to avoid overlap
- Use descriptive IDs for better debugging

**Workflow Selection:**
- Use sequential for dependent tasks
- Use parallel for independent tasks
- Combine both for complex pipelines

**Sub-Agents:**
- Define clear specializations
- Use trigger conditions for auto mode
- Keep sub-agent goals focused and specific

**Memory Management:**
- Use local embeddings to avoid API costs
- Use namespaces to separate project contexts
- Enable memory selectively for agents that benefit from history

**Feedback Loops:**
- Set reasonable max_iterations (2-4)
- Write clear approval criteria in reviewer goal
- Use specific feedback targets for efficiency


