# Quick Start: Sub-Agents & Persistent Memory

## Sub-Agents in 5 Minutes

### Basic Concept

Instead of defining flat agents:
```yaml
agents:
  - id: designer
    role: Designer
  - id: coder
    role: Coder
```

Create hierarchical teams:
```yaml
agents:
  - id: frontend_lead
    role: Frontend Lead
    delegation_strategy: auto
    
    sub_agents:
      - id: designer
        role: Designer
      - id: coder
        role: Coder
```

### Your First Sub-Agent Workflow

1. **Create a config file** (`my-team.yml`):

```yaml
models:
  gpt4:
    provider: openai
    model: gpt-4
    max_tokens: 3000

provider: gpt4

agents:
  - id: dev_team
    role: Development Team Lead
    goal: Build complete solutions
    delegation_strategy: sequential
    
    sub_agents:
      - id: planner
        role: Solution Planner
        goal: Design the architecture
      
      - id: builder
        role: Code Builder
        goal: Implement the solution
        mcpTools:
          - filesystem
      
      - id: tester
        role: Quality Tester
        goal: Test the implementation

workflow:
  type: sequential
  steps:
    - agent: dev_team
```

2. **Run it**:

```bash
npm run dev -- run my-team.yml -i "Create a simple calculator"
```

3. **Watch the magic**:

```
▶ Development Team Lead (dev_team)
  🔍 Planning sub-agent delegation...
  📋 Plan: Sequential execution needed
  
    ↳ Sub-agent 1/3: Solution Planner
    ✓ Solution Planner complete
    
    ↳ Sub-agent 2/3: Code Builder
      🔧 Tool call: filesystem
    ✓ Code Builder complete
    
    ↳ Sub-agent 3/3: Quality Tester
    ✓ Quality Tester complete
  
  🔄 Synthesizing results...
✓ Development Team Lead completed
```

## Persistent Memory in 5 Minutes

### Why Use It?

Agents remember insights from previous workflows:
- Frontend agent remembers your preferred CSS framework
- Backend agent remembers your database schema patterns
- Reduces repetition across similar tasks

### Setup

1. **Get Pinecone API Key**:
   - Go to [pinecone.io](https://www.pinecone.io/)
   - Create free account
   - Get API key

2. **Set environment variables**:

```bash
export PINECONE_API_KEY=your_key_here
export OPENAI_API_KEY=your_openai_key  # for embeddings
```

3. **Add to your config**:

```yaml
# Add at top level
pinecone_config:
  index_name: my-project-memory
  namespace: frontend
  dimension: 1536

# Enable per-agent
agents:
  - id: my_agent
    role: My Agent
    goal: Do stuff
    enable_persistent_memory: true  # <-- Enable here
```

### See It In Action

Run the same config twice with memory:

**First run:**
```bash
npm run dev -- run configs/demo-sub-agents.yml -i "Build a React form"
```
Output includes fresh analysis.

**Second run (same or similar task):**
```bash
npm run dev -- run configs/demo-sub-agents.yml -i "Build a React login form"
```

Output includes:
```
Relevant Past Context from Other Workflows:

[Frontend Code Writer - 1/18/2026] (relevance: 87.2%)
Key Insights: Used Formik for form handling; Implemented Yup validation
Decisions: Chose controlled components; Used custom hooks
```

The agent learns from the first run!

## Delegation Strategies

### Auto (Smart)
```yaml
delegation_strategy: auto
```
Parent decides which sub-agents to use and when.

**Use when**: Task complexity varies

### Sequential (Ordered)
```yaml
delegation_strategy: sequential
```
All sub-agents run in order, each builds on previous.

**Use when**: Clear workflow stages (design → build → test)

### Parallel (Fast)
```yaml
delegation_strategy: parallel
```
All sub-agents run at same time.

**Use when**: Independent work (frontend + backend + docs)

## Common Patterns

### Pattern 1: Specialist Team
```yaml
- id: specialists
  role: Specialist Team
  delegation_strategy: parallel
  
  sub_agents:
    - id: frontend_expert
      role: Frontend Expert
    - id: backend_expert
      role: Backend Expert
    - id: devops_expert
      role: DevOps Expert
```

### Pattern 2: Sequential Pipeline
```yaml
- id: pipeline
  role: Development Pipeline
  delegation_strategy: sequential
  
  sub_agents:
    - id: analyzer
      role: Requirements Analyzer
    - id: designer
      role: Solution Designer
    - id: coder
      role: Code Implementer
    - id: tester
      role: Quality Tester
```

### Pattern 3: Smart Router
```yaml
- id: router
  role: Smart Router
  delegation_strategy: auto
  
  sub_agents:
    - id: simple_task_handler
      role: Simple Task Handler
      trigger_conditions:
        - "simple"
        - "basic"
    
    - id: complex_task_handler
      role: Complex Task Handler
      trigger_conditions:
        - "complex"
        - "advanced"
```

## Troubleshooting

### Sub-agents not executing?
- Check `sub_agents` array exists and not empty
- Verify `delegation_strategy` is set
- Check logs for errors

### Memory not working?
- Verify `PINECONE_API_KEY` is set
- Verify `OPENAI_API_KEY` is set
- Check `enable_persistent_memory: true` on agent
- Look for initialization logs

### Too slow?
- Use `parallel` delegation for independent tasks
- Reduce number of sub-agents (3-5 is optimal)
- Use smaller models (`gpt-3.5-turbo`)

## Next Steps

1. Read full docs: [SUB_AGENTS_AND_MEMORY.md](SUB_AGENTS_AND_MEMORY.md)
2. Try examples: `configs/demo-sub-agents.yml`
3. Experiment with delegation strategies
4. Enable memory on frequently used agents

## Tips

✅ **Do**:
- Give sub-agents clear specializations
- Use meaningful trigger conditions in auto mode
- Enable memory for knowledge-heavy agents
- Start with sequential, optimize to parallel

❌ **Don't**:
- Create too many sub-agents (>7)
- Mix concerns in one sub-agent
- Enable memory on all agents (cost)
- Forget to set environment variables
