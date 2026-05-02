import vscode from 'vscode';
import { TurnRecord, SessionSummary } from './types';

export class SessionTracker {
  private readonly turns: TurnRecord[] = [];
  readonly onDidChange = new vscode.EventEmitter<SessionSummary>();

  addTurn(record: TurnRecord): void {
    this.turns.push(record);
    this.onDidChange.fire(this.summary);
  }

  get summary(): SessionSummary {
    return {
      turns: this.turns.length,
      totalPromptTokens: this.turns.reduce((sum, t) => sum + t.promptTokens, 0),
      totalCompletionTokens: this.turns.reduce((sum, t) => sum + t.completionTokens, 0),
      totalReasoningTokens: this.turns.reduce((sum, t) => sum + t.reasoningTokens, 0),
      totalCostUSD: this.turns.reduce((sum, t) => sum + (t.costUSD ?? 0), 0),
    };
  }

  reset(): void {
    this.turns.length = 0;
    this.onDidChange.fire(this.summary);
  }

  dispose(): void {
    this.onDidChange.dispose();
  }
}
