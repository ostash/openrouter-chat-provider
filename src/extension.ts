import vscode from 'vscode';
import { SecretsManager } from './SecretsManager';
import { registerAll } from './registry';
import type { RegistrationResult } from './registry';

let current: RegistrationResult | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const secrets = new SecretsManager(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('orcp.setApiKey', async () => {
      const saved = await secrets.promptAndSave();
      if (saved) {
        await doRegister(context, secrets);
      }
    }),

    vscode.commands.registerCommand('orcp.clearApiKey', async () => {
      await secrets.deleteApiKey();
      vscode.window.showInformationMessage('OpenRouter: API key removed.');
      await doRegister(context, secrets);
    }),
  );

  context.subscriptions.push(
    context.secrets.onDidChange(e => {
      if (e.key === 'orcp.apiKey') {
        doRegister(context, secrets);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('orcp')) {
        doRegister(context, secrets);
      }
    }),
  );

  await doRegister(context, secrets);
}

async function doRegister(
  context: vscode.ExtensionContext,
  secrets: SecretsManager,
): Promise<void> {
  current?.dispose();
  current = undefined;

  try {
    current = await registerAll(context, secrets);
  } catch (err) {
    console.error('[ORCP] Registration failed:', err);
    vscode.window.showErrorMessage(`ORCP: Failed to initialize. ${String(err)}`);
  }
}

export function deactivate(): void {
  current?.dispose();
  current = undefined;
}
