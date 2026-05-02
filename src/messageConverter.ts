import vscode from 'vscode';
import type {
  ChatAssistantMessage,
  ChatContentItems,
  ChatFunctionTool,
  ChatMessages,
  ChatToolCall,
  ChatToolMessage,
  ChatUserMessage,
} from '@openrouter/sdk/models';

function isLanguageModelInputPart(part: unknown): part is vscode.LanguageModelInputPart {
  return part instanceof vscode.LanguageModelTextPart
    || part instanceof vscode.LanguageModelThinkingPart
    || part instanceof vscode.LanguageModelToolCallPart
    || part instanceof vscode.LanguageModelToolResultPart;
}

export function convertMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): ChatMessages[] {
  const result: ChatMessages[] = [];

  for (const msg of messages) {
    const role = msg.role === vscode.LanguageModelChatMessageRole.User ? 'user' : 'assistant';

    // Validate and get content parts
    if (!Array.isArray(msg.content)) {
      console.warn('[ORCP] Message content is not an array, skipping');
      continue;
    }

    const parts = msg.content.filter(isLanguageModelInputPart);

    let content: ChatContentItems[] = [];
    let reasoning: string | undefined;
    const toolCalls: ChatToolCall[] = [];
    let toolResultContent: string | undefined;
    let toolResultCallId: string | undefined;

    for (const part of parts) {
      if (part instanceof vscode.LanguageModelTextPart) {
        content.push({ type: 'text', text: part.value });
      } else if (part instanceof vscode.LanguageModelThinkingPart) {
        const reasoningValue = typeof part.value === 'string' ? part.value : part.value.join('');
        if (role === 'assistant') {
          reasoning = reasoningValue;
        } else {
          console.warn('[ORCP] Thinking part found in non-assistant message, ignoring');
        }
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        if (!part.callId || !part.name) {
          console.warn('[ORCP] Invalid tool call part, missing callId or name');
          continue;
        }
        toolCalls.push({
          id: part.callId,
          type: 'function',
          function: {
            name: part.name,
            arguments: JSON.stringify(part.input ?? {}),
          },
        });
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        if (!part.callId) {
          console.warn('[ORCP] Tool result part missing callId, ignoring');
          continue;
        }
        toolResultCallId = part.callId;
        const textParts = part.content.filter(
          (p): p is vscode.LanguageModelTextPart => p instanceof vscode.LanguageModelTextPart,
        );
        toolResultContent = textParts.map((p) => p.value).join('\n');
      }
    }

    if (toolResultContent !== undefined && toolResultCallId !== undefined) {
      const toolMessage: ChatToolMessage = {
        role: 'tool',
        content: toolResultContent,
        toolCallId: toolResultCallId,
      };
      result.push(toolMessage);
    } else if (toolCalls.length > 0) {
      const assistantMessage: ChatAssistantMessage = {
        role: 'assistant',
        content: content.length > 0 ? content : undefined,
        reasoning,
        toolCalls,
      };
      result.push(assistantMessage);
    } else if (content.length > 0 || reasoning) {
      const message: ChatUserMessage | ChatAssistantMessage = role === 'user'
        ? { role: 'user', content: content.length > 0 ? content : '' }
        : { role: 'assistant', content: content.length > 0 ? content : undefined, reasoning };
      result.push(message);
    } else {
      console.warn(`[ORCP] Message has no content, reasoning, or tool calls, skipping`);
    }
  }

  return result;
}

export function convertTools(
  tools: readonly vscode.LanguageModelChatTool[],
): ChatFunctionTool[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema ?? {},
    },
  }));
}
