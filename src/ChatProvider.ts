import vscode from 'vscode';
import { ModelRegistry } from './ModelRegistry';
import { OpenRouterClient } from './OpenRouterClient';
import { SessionTracker } from './SessionTracker';
import { convertMessages, convertTools } from './messageConverter';
import { handleStream } from './streamHandler';
import { ModelEntry } from './types';
import type { ChatStreamChunk, ChatToolChoice } from '@openrouter/sdk/models';
import { ChatToolChoiceRequired, ChatToolChoiceAuto } from '@openrouter/sdk/models';

function mapToolChoice(toolMode: vscode.LanguageModelChatToolMode | undefined): ChatToolChoice {
  return toolMode === vscode.LanguageModelChatToolMode.Required
    ? ChatToolChoiceRequired.Required
    : ChatToolChoiceAuto.Auto;
}

export class ChatProvider implements vscode.LanguageModelChatProvider<ModelEntry> {
  readonly onDidChangeLanguageModelChatInformation: vscode.Event<void>;

  constructor(
    private readonly registry: ModelRegistry,
    private readonly client: OpenRouterClient,
    private readonly tracker: SessionTracker,
  ) {
    this.onDidChangeLanguageModelChatInformation = this.registry.onDidChange.event;
  }

  async provideLanguageModelChatInformation(
    options: vscode.PrepareLanguageModelChatModelOptions,
    token: vscode.CancellationToken,
  ): Promise<ModelEntry[]> {
    if (options.silent) {
      const key = await this.client.getApiKey();
      if (!key) {
        return [];
      }
    }

    return this.registry.getAll();
  }

  async provideLanguageModelChatResponse(
    model: ModelEntry,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const effort = model.effort;
    const toolChoice = mapToolChoice(options.toolMode);

    const orMessages = convertMessages(messages);
    const orTools = options.tools && options.tools.length > 0
      ? convertTools(options.tools)
      : undefined;

    const abort = new AbortController();
    token.onCancellationRequested(() => abort.abort());

    let stream: AsyncIterable<ChatStreamChunk>;
    try {
      stream = await this.client.streamChat(model.orModelId, orMessages, {
        effort,
        toolChoice,
        tools: orTools,
      }, abort.signal);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('Unauthorized')) {
        throw new Error('ORCP: Invalid API key. Run "ORCP: Set API Key".');
      }
      if (msg.includes('402') || msg.includes('Payment')) {
        throw new Error('ORCP: Insufficient credits. Visit https://openrouter.ai/credits');
      }
      if (msg.includes('429') || msg.includes('rate limit') || msg.includes('Too Many')) {
        throw new Error('ORCP: Rate limit reached. Please wait a moment.');
      }
      throw err;
    }

    const turnRecord = await handleStream(stream, progress, token);

    this.tracker.addTurn(turnRecord);
  }

  async provideTokenCount(
    model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    token: vscode.CancellationToken,
  ): Promise<number> {
    if (typeof text === 'string') {
      return Math.max(1, Math.ceil(text.length / 4));
    }

    const parts = text.content;
    let totalChars = 0;
    for (const part of parts) {
      if (part instanceof vscode.LanguageModelTextPart) {
        totalChars += part.value.length;
      }
    }
    return Math.max(1, Math.ceil(totalChars / 4));
  }
}
