import { SecretsManager } from './SecretsManager';
import { ReasoningEffort } from './types';
import type { OpenRouter } from '@openrouter/sdk';
import type {
  Model,
  ChatMessages,
  ChatFunctionTool,
  ChatToolChoice,
  ReasoningConfig,
  ChatStreamChunk,
  ChatRequest,
} from '@openrouter/sdk/models';

const HTTP_REFERER = 'https://github.com/ostash/openrouter-chat-provider';
const APP_TITLE = 'OpenRouter Chat Provider for VSCode';
const APP_CATEGORIES = 'ide-extension';

export class OpenRouterClient {
  private sdkClient: OpenRouter | null = null;
  private cachedApiKey: string | null = null;
  private cachedBaseUrl: string | null = null;

  constructor(
    private readonly secrets: SecretsManager,
    private readonly baseUrl: string,
  ) {}

  private async getClient(): Promise<OpenRouter> {
    const apiKey = await this.secrets.getApiKey();
    if (!apiKey) {
      this.sdkClient = null;
      this.cachedApiKey = null;
      throw new Error('OpenRouter API key is not set. Use ORCP: Set API Key command.');
    }

    // Reset client if API key or base URL has changed
    if (this.sdkClient && (this.cachedApiKey !== apiKey || this.cachedBaseUrl !== this.baseUrl)) {
      this.sdkClient = null;
    }

    if (this.sdkClient) {
      return this.sdkClient;
    }

    const { OpenRouter } = await import('@openrouter/sdk');
    this.sdkClient = new OpenRouter({
      apiKey,
      httpReferer: HTTP_REFERER,
      appTitle: APP_TITLE,
      appCategories: APP_CATEGORIES,
      serverURL: this.baseUrl,
    });
    this.cachedApiKey = apiKey;
    this.cachedBaseUrl = this.baseUrl;
    return this.sdkClient;
  }

  resetClient(): void {
    this.sdkClient = null;
    this.cachedApiKey = null;
  }

  async getApiKey(): Promise<string | undefined> {
    return this.secrets.getApiKey();
  }

  async listModels(): Promise<Model[]> {
    const client = await this.getClient();
    const response = await client.models.listForUser(
      { bearer: this.cachedApiKey! },
    );
    return response.data;
  }

  async streamChat(
    orModelId: string,
    messages: ChatMessages[],
    opts: {
      effort: ReasoningConfig['effort'];
      toolChoice: ChatToolChoice;
      tools?: ChatFunctionTool[];
      maxTokens?: number;
    },
    signal: AbortSignal,
  ): Promise<AsyncIterable<ChatStreamChunk>> {
    const client = await this.getClient();

    const chatRequest: ChatRequest = {
      model: orModelId,
      messages,
      stream: true,
      streamOptions: { includeUsage: true },
    };

    if (opts.effort) {
      chatRequest.reasoning = { effort: opts.effort };
    }

    if (opts.toolChoice) {
      chatRequest.toolChoice = opts.toolChoice;
    }

    if (opts.tools?.length) {
      chatRequest.tools = opts.tools;
    }

    if (opts.maxTokens) {
      chatRequest.maxTokens = opts.maxTokens;
    }

    const response = await client.chat.send(
      { chatRequest },
      { signal },
    );

    return response as AsyncIterable<ChatStreamChunk>;
  }
}
