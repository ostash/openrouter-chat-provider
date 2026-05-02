import vscode from 'vscode';

const SECRET_KEY = 'orcp.apiKey';

export class SecretsManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getApiKey(): Promise<string | undefined> {
    return this.context.secrets.get(SECRET_KEY);
  }

  async setApiKey(key: string): Promise<void> {
    await this.context.secrets.store(SECRET_KEY, key);
  }

  async deleteApiKey(): Promise<void> {
    await this.context.secrets.delete(SECRET_KEY);
  }

  async promptAndSave(): Promise<boolean> {
    const input = await vscode.window.showInputBox({
      prompt: 'Enter your OpenRouter API key',
      placeHolder: 'sk-or-v1-...',
      password: true,
      ignoreFocusOut: true,
    });

    if (input === undefined || input.trim() === '') {
      return false;
    }

    await this.setApiKey(input.trim());
    vscode.window.showInformationMessage('ORCP: API key saved.');
    return true;
  }
}
