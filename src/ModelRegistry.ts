import vscode from 'vscode';
import { ModelEntry, ModelConfig, ReasoningEffort } from './types';
import type { Model } from '@openrouter/sdk/models';
import { Parameter, InputModality, OutputModality } from '@openrouter/sdk/models';

function deriveFamily(orModelId: string): string {
  const slashIndex = orModelId.indexOf('/');
  const afterSlash = slashIndex !== -1 ? orModelId.substring(slashIndex + 1) : orModelId;
  const digitMatch = afterSlash.match(/^[^0-9]*/);
  const raw = digitMatch ? digitMatch[0] : afterSlash;
  return raw.replace(/[-_]+$/, '');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class ModelRegistry {
  private entries = new Map<string, ModelEntry>();

  readonly onDidChange = new vscode.EventEmitter<void>();

  rebuild(rawModels: Model[], modelConfigs: Record<string, ModelConfig>): void {
    this.entries.clear();

    for (const model of rawModels) {
      const config = modelConfigs[model.id];
      if (config && config.enabled === false) {
        continue;
      }

      // Skip models that don't support text input and output, as they can't be used for chat completions. 
      if (!model.architecture.inputModalities.includes(InputModality.Text) ||
        !model.architecture.outputModalities.includes(OutputModality.Text)) {
        continue;
      }

      // Models without tool calling support are useless for our scenario.
      if (!model.supportedParameters.includes(Parameter.Tools)) {
        continue;
      }

      const supportsImageInput = model.architecture.inputModalities.includes(InputModality.Image);
      const supportsReasoning = model.supportedParameters.includes(Parameter.Reasoning);
      const maxOutputTokens = model.topProvider.maxCompletionTokens ?? 4096;

      const baseEntry: ModelEntry = {
        id: model.id,
        name: model.name,
        family: deriveFamily(model.id),
        tooltip: model.description,
        detail: 'ORCP',
        version: model.id,
        maxInputTokens: model.contextLength ?? 0,
        maxOutputTokens,
        capabilities: {
          toolCalling: true,
          imageInput: supportsImageInput,
        },

        orModelId: model.id,
        effort: null,
      };

      this.entries.set(baseEntry.id, baseEntry);

      if (supportsReasoning && config?.effortLevels?.length > 0) {
        for (const effort of config.effortLevels) {
          const effortEntry: ModelEntry = {
            id: model.id + '::' + effort,
            name: model.name + ' · ' + capitalize(effort),
            family: deriveFamily(model.id),
            tooltip: model.description,
            detail: 'ORCP',
            version: model.id,
            maxInputTokens: model.contextLength ?? 0,
            maxOutputTokens,
            capabilities: {
              toolCalling: true,
              imageInput: supportsImageInput,
            },

            orModelId: model.id,
            effort: effort as ReasoningEffort,
          };
          this.entries.set(effortEntry.id, effortEntry);
        }
      }
    }

    // TODO: vscode.proposed.chatProvider.d.ts
    // TODO: vscode.proposed.languageModelPricing.d.ts
    
    this.onDidChange.fire();
  }

  getAll(): ModelEntry[] {
    return Array.from(this.entries.values());
  }

  dispose(): void {
    this.onDidChange.dispose();
  }
}
