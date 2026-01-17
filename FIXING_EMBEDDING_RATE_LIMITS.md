# Fixing Embedding API Rate Limits

## Problem

You're seeing this error:
```
ERROR: ❌ Failed to create embedding
error: "OpenAI API error: Too Many Requests"
```

This happens when persistent memory makes too many calls to OpenAI's embedding API.

## Solutions Implemented

### 1. **Embedding Cache** (Automatic)
The system now caches embeddings in memory to avoid recreating them:
- Caches up to 100 embeddings
- Reuses cached embeddings for identical text
- Significantly reduces API calls

### 2. **Rate Limiting** (Automatic)
Added automatic rate limiting:
- Minimum 100ms between embedding API calls
- Prevents overwhelming the OpenAI API
- Queues requests when needed

### 3. **Graceful Fallback** (Automatic)
If embedding creation fails:
- Uses zero vector instead of crashing
- Logs warning but continues execution
- Memory feature degrades gracefully

## Quick Fixes

### Option A: Disable Persistent Memory (Recommended for Now)

Simply remove or comment out the memory configuration:

**Before:**
```yaml
pinecone_config:
  index_name: spindleflow-memory
  namespace: frontend-dev
  dimension: 1536

agents:
  - id: frontend_lead
    enable_persistent_memory: true  # <-- This causes embeddings
```

**After:**
```yaml
# Persistent memory disabled - no embedding calls
# pinecone_config:
#   index_name: spindleflow-memory
#   namespace: frontend-dev
#   dimension: 1536

agents:
  - id: frontend_lead
    # enable_persistent_memory: true  # <-- Commented out
```

### Option B: Disable for Specific Agents

Keep memory for some agents but not others:

```yaml
agents:
  - id: important_agent
    enable_persistent_memory: true  # Only this one uses memory
  
  - id: frequent_agent
    enable_persistent_memory: false  # This one doesn't
  
  - id: another_agent
    # enable_persistent_memory not set = defaults to false
```

### Option C: Remove OPENAI_API_KEY Temporarily

If you remove the OpenAI API key, the system will:
- Skip embedding creation
- Use zero vectors as fallback
- Still work without memory features

```bash
# Comment out in .env
# OPENAI_API_KEY=...
```

### Option D: Use Only with Sub-Agents (Minimal Calls)

Only enable memory on parent agents, not sub-agents:

```yaml
agents:
  - id: parent
    enable_persistent_memory: true  # Only 1 embedding per workflow
    
    sub_agents:
      - id: child1
        # No enable_persistent_memory = no embeddings
      - id: child2
        # No enable_persistent_memory = no embeddings
```

## How Caching Helps

With the new caching system:

**Before (No Cache):**
- 4 sub-agents × 2 (store + retrieve) = 8 API calls per agent
- Multiple workflows = Many API calls
- Rate limits hit quickly

**After (With Cache):**
- First workflow: 8 API calls (cache misses)
- Second workflow with similar task: 0-2 API calls (cache hits!)
- Dramatically reduced API usage

## Understanding When Embeddings Are Created

Embeddings are created in two scenarios:

1. **Storing Memory** (when workflow completes):
   - 1 embedding per agent with `enable_persistent_memory: true`
   
2. **Retrieving Memory** (when sub-agent starts):
   - 1 embedding per sub-agent query
   - Only if parent has `enable_persistent_memory: true`

### Example:

```yaml
agents:
  - id: parent
    enable_persistent_memory: true
    sub_agents:
      - id: sub1  # Creates 1 query embedding
      - id: sub2  # Creates 1 query embedding
      - id: sub3  # Creates 1 query embedding
```

Total: 4 embeddings (3 queries + 1 store) per workflow

## Best Practices to Minimize API Calls

### 1. Selective Memory
Only enable for agents that truly benefit:

```yaml
# ❌ Too many memory-enabled agents
agents:
  - id: agent1
    enable_persistent_memory: true
  - id: agent2
    enable_persistent_memory: true
  - id: agent3
    enable_persistent_memory: true

# ✅ Selective memory usage
agents:
  - id: important_architect
    enable_persistent_memory: true  # This one learns
  - id: simple_formatter
    # No memory needed
  - id: quick_validator
    # No memory needed
```

### 2. Coarser Granularity
Use fewer, smarter agents instead of many small ones:

```yaml
# ❌ Many small agents with memory
agents:
  - id: css_expert
    enable_persistent_memory: true
  - id: html_expert
    enable_persistent_memory: true
  - id: js_expert
    enable_persistent_memory: true

# ✅ One comprehensive agent
agents:
  - id: frontend_expert
    enable_persistent_memory: true
    sub_agents:  # These don't need individual memory
      - id: css_specialist
      - id: html_specialist
      - id: js_specialist
```

### 3. Namespace Reuse
Use same namespace for similar projects:

```yaml
# Reuse namespace = better cache hits
pinecone_config:
  namespace: web-development  # Same for all web projects
```

## Monitoring Embedding Usage

Check logs for embedding activity:

```bash
# Run with debug logging
LOG_LEVEL=debug npm run dev -- run config.yml -i "task"

# Look for these events:
# - EMBEDDING_CACHE_HIT (good - no API call)
# - EMBEDDING_CREATED (API call made)
# - EMBEDDING_FALLBACK (API failed, using zero vector)
```

## Current Configuration Check

To see if you're using memory features:

```bash
# Check your config files
grep -r "enable_persistent_memory: true" configs/

# Check for pinecone_config
grep -r "pinecone_config" configs/
```

## Recommended Settings for Development

While developing/testing:

```yaml
# Minimal memory usage
pinecone_config:
  index_name: dev-memory
  namespace: testing
  dimension: 1536

agents:
  - id: main_agent
    # Disable memory during dev
    enable_persistent_memory: false
    
    sub_agents:
      - id: sub1
        # No memory on sub-agents
```

## Recommended Settings for Production

When memory is valuable:

```yaml
pinecone_config:
  index_name: prod-memory
  namespace: project-name
  dimension: 1536

agents:
  - id: architect
    enable_persistent_memory: true  # High-level decisions worth remembering
    
    sub_agents:
      - id: implementer
        # No memory on implementation details
```

## Troubleshooting

### Still Getting Rate Limit Errors?

1. **Check other OpenAI usage**:
   - Your config might use OpenAI for LLM calls too
   - Switch to Gemini for main LLM:
   ```yaml
   provider: gemini  # Use Gemini instead of OpenAI
   ```

2. **Increase rate limit delay**:
   Edit `src/memory/persistent-memory.ts`:
   ```typescript
   const EMBEDDING_RATE_LIMIT_MS = 500; // Increase from 100 to 500ms
   ```

3. **Reduce parallel sub-agents**:
   ```yaml
   delegation_strategy: sequential  # Instead of parallel
   ```

### Want to Clear Cache?

Cache is in-memory and clears on restart. To force refresh:
```bash
# Just restart the process
# Cache automatically clears
```

## Summary

**Immediate fix**: Comment out `enable_persistent_memory: true` in your configs

**Long-term solution**: The caching and rate limiting are now automatic, so you can re-enable memory once you:
1. Verify your OpenAI API quota
2. Reduce number of memory-enabled agents
3. Test with smaller workflows first

The system now handles rate limits gracefully - it won't crash, just uses fallback zero vectors if embeddings fail.
