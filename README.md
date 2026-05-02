# OpenRouter Chat Provider

Access **300+ AI models** from OpenRouter directly in VS Code Copilot Chat.

## Why This Extension?

### Reasoning Content Passthrough

This extension **correctly passes `reasoning` content back to the model** in multi-turn conversations. This is critical
for models like **DeepSeek V4** that require the full context (including previous reasoning tokens) to be included in
subsequent requests.

When a model returns reasoning tokens (the "thinking" process):
1. They're displayed in Copilot Chat via `LanguageModelThinkingPart`
2. They're **preserved and sent back** with assistant messages in the next turn

The built-in VS Code provider does not handle this correctly, making it incompatible with DeepSeek V4 and similar models
for multi-turn conversations.

### Reasoning Effort

For models that support reasoning (Claude, GPT, etc.), you can manually configure effort levels in `orcp.models`.
Available levels:
- **xhigh** — maximum reasoning depth
- **high** — deep reasoning
- **medium** — balanced
- **low** — faster, less thorough
- **minimal** — minimal reasoning

Each effort level creates a separate model entry in Copilot Chat (e.g., `Claude Sonnet 4 · High`).

## Quick Start

1. Install the extension
2. Get your API key from [OpenRouter](https://openrouter.ai/keys)
3. Run `ORCP: Set API Key` from the Command Palette
4. Run `Chat: Manage Language Models` and enable models you want to be visible in Copilot Chat picker
4. Open Copilot Chat and select model to use

## Configuration

### `orcp.baseUrl`

Custom OpenRouter API base URL (default: `https://openrouter.ai/api/v1`).

```json
{
  "orcp.baseUrl": "https://openrouter.ai/api/v1"
}
```

Useful for proxies, self-hosted instances, or testing.

### `orcp.models`

Per-model configuration. Keys are OpenRouter model IDs. Set `enabled` to false to hide a model. Use `effortLevels` to expose reasoning effort variants (low, medium, high) for supported models.

```json
{
  "orcp.models": {
    "anthropic/claude-sonnet-4-5": {
      "enabled": true,
      "effortLevels": ["low", "medium", "high"]
    },
    "openai/gpt-4o": {
      "enabled": true,
      "effortLevels": []
    },
    "meta-llama/llama-3.3-70b-instruct": {
      "enabled": false
    }
  }
}
```

**Notes:**
- Models not listed are **enabled by default** with no effort variants
- Effort levels only work on models that support reasoning (e.g., Claude, GPT-5)
- Model IDs can be found in the [OpenRouter model list](https://openrouter.ai/models)

## Commands

| Command | Description |
|---------|-------------|
| `ORCP: Set API Key` | Store your OpenRouter API key |
| `ORCP: Clear API Key` | Remove the stored API key |

## Requirements

- VS Code 1.117.0 or later
- Copilot Chat extension installed
- OpenRouter API key ([get one here](https://openrouter.ai/keys))

## Troubleshooting

**"ORCP: Invalid API key"**
- Your API key is incorrect or expired
- Run `ORCP: Set API Key` to update it

**"ORCP: Insufficient credits"**
- Add credits at [openrouter.ai/credits](https://openrouter.ai/credits)

**"ORCP: Rate limit reached"**
- You've hit OpenRouter's rate limit
- Wait a moment ando/or check your [rate limit documentation](https://openrouter.ai/docs/api/reference/limits)

**Models not appearing**
- Ensure your API key is set
- Run `Developer: Reload Window` after changing settings

## License

MIT
