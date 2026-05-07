import vscode from 'vscode';

const MAGIC = 0x9e3779b9;

function hashCombine(seed: number, value: number): number {
  return (seed ^ (value + MAGIC + (seed << 6) + (seed >>> 2))) >>> 0;
}

function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0
}

function hashBytes(data: Uint8Array): number {
  let hash = 2166136261;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0
}

function hashPart(part: unknown): number | undefined {
  if (part instanceof vscode.LanguageModelTextPart) {
    return hashString(part.value);
  }
  else if (part instanceof vscode.LanguageModelToolResultPart || part instanceof vscode.LanguageModelToolCallPart) {
    return hashString(part.callId);
  }
  else if (part instanceof vscode.LanguageModelDataPart && part.mimeType != 'cache_control') {
    return hashBytes(part.data);
  }
  else if (part instanceof vscode.LanguageModelThinkingPart) {
    if (typeof part.value === 'string') {
      return hashString(part.value);
    } else {
      let seed = 0;
      for (const v of part.value) {
        seed = hashCombine(seed, hashString(v));
      }
      return seed >>> 0;
    }
  }
  return undefined;
}

function hashMessage(msg: vscode.LanguageModelChatRequestMessage): number | undefined {
  if (!Array.isArray(msg.content) || msg.content.length === 0) {
    return undefined;
  }

  let seed = hashString(msg.role.toString());
  let anySupported = false;

  for (const part of msg.content) {
    const h = hashPart(part);
    if (h !== undefined) {
      anySupported = true;
      seed = hashCombine(seed, h);
    }
  }

  return anySupported ? seed : undefined;
}

function generateId(): string {
  const rand = () => Math.random().toString(36).slice(2, 12);
  return `orcp-${Date.now()}-${rand()}${rand()}`;
}

interface TrieNode {
  sessionId: string | undefined;
  lastSeen: number | undefined
  children: Record<string, TrieNode>;
}

function createNode(): TrieNode {
  return { sessionId: undefined, lastSeen: undefined, children: {} };
}

export class ConversationSessionManager {
  private root: TrieNode = createNode();
  private readonly globalStorageDir: vscode.Uri;
  private storageDir!: vscode.Uri;
  private fileUri!: vscode.Uri;
  private ready: Promise<void>;
  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private lastPersistTime = 0;
  private disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.globalStorageDir = context.globalStorageUri;
    this.computeUris(context.storageUri);
    this.ready = this.load();

    this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.handleWorkspaceChange(context.storageUri);
    }));
  }

  private computeUris(storageUri: vscode.Uri | undefined): void {
    if (storageUri) {
      this.storageDir = storageUri;
      this.fileUri = vscode.Uri.joinPath(this.storageDir, 'sessions.json');
    } else {
      this.storageDir = this.globalStorageDir;
      this.fileUri = vscode.Uri.joinPath(this.globalStorageDir, 'sessions.json');
    }
  }

  private handleWorkspaceChange(storageUri: vscode.Uri | undefined): void {
    clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    this.doPersist();

    this.computeUris(storageUri);
    this.ready = this.load();
  }

  async getOrCreateSession(
    messages: readonly vscode.LanguageModelChatRequestMessage[],
  ): Promise<string | undefined> {
    await this.ready;

    const messageHashes: number[] = [];
    for (const msg of messages) {
      const h = hashMessage(msg);
      if (h === undefined) {
        return undefined;
      }
      messageHashes.push(h);
    }

    let node = this.root;
    let best: string | undefined;

    for (const h of messageHashes) {
      const key = String(h);
      let child = node.children[key];
      if (!child) {
        child = createNode();
        node.children[key] = child;
      }
      if (child.sessionId !== undefined) {
        best = child.sessionId;
      }
      node = child;
    }

    const sessionId = best ?? generateId();
    node.sessionId = sessionId;
    node.lastSeen = Date.now();

    this.throttlePersist();
    return sessionId;
  }

  private async load(): Promise<void> {
    try {
      const data = await vscode.workspace.fs.readFile(this.fileUri);
      const json = JSON.parse(new TextDecoder().decode(data));
      if (json && typeof json === 'object') {
        this.root = json as TrieNode;
        if (!this.root.children) {
          this.root = createNode();
        }
      } else {
        this.root = createNode();
      }
    } catch (err: unknown) {
      if (!(err instanceof vscode.FileSystemError) || err.code !== 'FileNotFound') {
        console.warn('Failed to load session trie:', err);
      }
      this.root = createNode();
    }
  }

  private async doPersist(): Promise<void> {
    try {
      const json = JSON.stringify(this.root);
      await vscode.workspace.fs.createDirectory(this.storageDir);
      await vscode.workspace.fs.writeFile(this.fileUri, new TextEncoder().encode(json));
    } catch (err) {
      console.warn('Failed to persist session trie:', err);
    }
  }

  private throttlePersist(): void {
    const elapsed = Date.now() - this.lastPersistTime;
    if (elapsed >= 5000) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
      this.lastPersistTime = Date.now();
      this.doPersist();
      return;
    }
    if (this.persistTimer) {
      return;
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      this.lastPersistTime = Date.now();
      this.doPersist();
    }, 5000 - elapsed);
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    clearTimeout(this.persistTimer);
    this.doPersist();
  }
}
