/**
 * Model Configuration for Smart Model Selection
 *
 * This module manages model tiers and cost optimization.
 * Using the right model for each task can save 10-60x in costs.
 */

import { ModelTier, ModelConfig } from '../types';

// Available models with their costs (per 1M tokens)
export const MODELS: Record<string, ModelConfig> = {
  'claude-3-5-haiku-20241022': {
    id: 'claude-3-5-haiku-20241022',
    tier: 'fast',
    inputCost: 0.25,
    outputCost: 1.25
  },
  'claude-sonnet-4-5-20250929': {
    id: 'claude-sonnet-4-5-20250929',
    tier: 'balanced',
    inputCost: 3,
    outputCost: 15
  },
  'claude-opus-4-5-20251101': {
    id: 'claude-opus-4-5-20251101',
    tier: 'powerful',
    inputCost: 15,
    outputCost: 75
  }
};

// Map tier to default model
export const TIER_TO_MODEL: Record<ModelTier, string> = {
  'fast': 'claude-3-5-haiku-20241022',
  'balanced': 'claude-sonnet-4-5-20250929',
  'powerful': 'claude-opus-4-5-20251101'
};

// Tier descriptions for UI
export const TIER_INFO: Record<ModelTier, { name: string; description: string; costMultiplier: string }> = {
  'fast': {
    name: 'Haiku (Fast)',
    description: 'Best for simple tasks: formatting, explaining, summarizing',
    costMultiplier: '1x'
  },
  'balanced': {
    name: 'Sonnet (Balanced)',
    description: 'Best for coding, debugging, code review',
    costMultiplier: '12x'
  },
  'powerful': {
    name: 'Opus (Powerful)',
    description: 'Best for complex reasoning, architecture, security audits',
    costMultiplier: '60x'
  }
};

/**
 * Get the actual model ID for a tier
 */
export function getModelForTier(tier: ModelTier): string {
  return TIER_TO_MODEL[tier];
}

/**
 * Get the tier for a model ID
 */
export function getTierForModel(modelId: string): ModelTier | undefined {
  const model = MODELS[modelId];
  return model?.tier;
}

/**
 * Calculate cost for token usage
 */
export function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const model = MODELS[modelId] || MODELS['claude-sonnet-4-5-20250929'];
  const inputCost = (inputTokens / 1_000_000) * model.inputCost;
  const outputCost = (outputTokens / 1_000_000) * model.outputCost;
  return inputCost + outputCost;
}

/**
 * Estimate cost savings by using a different tier
 */
export function estimateSavings(
  currentTier: ModelTier,
  suggestedTier: ModelTier,
  estimatedTokens: number
): { currentCost: number; suggestedCost: number; savings: number; savingsPercent: number } {
  const currentModel = MODELS[TIER_TO_MODEL[currentTier]];
  const suggestedModel = MODELS[TIER_TO_MODEL[suggestedTier]];

  // Assume 80% input, 20% output ratio
  const inputTokens = estimatedTokens * 0.8;
  const outputTokens = estimatedTokens * 0.2;

  const currentCost = calculateCost(currentModel.id, inputTokens, outputTokens);
  const suggestedCost = calculateCost(suggestedModel.id, inputTokens, outputTokens);
  const savings = currentCost - suggestedCost;
  const savingsPercent = currentCost > 0 ? (savings / currentCost) * 100 : 0;

  return { currentCost, suggestedCost, savings, savingsPercent };
}
