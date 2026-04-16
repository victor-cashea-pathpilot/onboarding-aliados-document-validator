import {
  GoogleGenAI,
  createPartFromBase64,
  createUserContent,
} from '@google/genai';
import { getInfrastructureSettings } from '../config/settings';
import { createLogger, formatUnknownError } from '../logging/logger';
import type {
  GeminiClient,
  GeminiFileExtractionInput,
  GeminiGenerateJsonInput,
  GeminiPayloadAnalysisInput,
} from './gemini-client';

const logger = createLogger('VertexGeminiClient');

function parseJsonResponse(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  return JSON.parse(cleaned) as Record<string, unknown>;
}

function normalizeContentPart(part: unknown): unknown {
  if (typeof part === 'string') {
    return part;
  }

  if (
    typeof part === 'object' &&
    part !== null &&
    ('inlineData' in part || 'fileData' in part || 'text' in part)
  ) {
    return part;
  }

  return JSON.stringify(part, null, 2);
}

export class VertexGeminiClient implements GeminiClient {
  private readonly client: GoogleGenAI;

  constructor(client?: GoogleGenAI) {
    const settings = getInfrastructureSettings();
    this.client =
      client ??
      new GoogleGenAI({
        vertexai: true,
        project: settings.gcpProjectId,
        location: settings.geminiLocation,
      });
  }

  async generateJson(input: GeminiGenerateJsonInput): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    logger.info('llm.request.started', {
      event: 'llm.request.started',
      model: input.model,
      contentParts: input.contents.length,
    });

    try {
      const response = await this.client.models.generateContent({
        model: input.model,
        contents: createUserContent(
          input.contents.map(normalizeContentPart) as Parameters<typeof createUserContent>[0],
        ),
        config: {
          responseMimeType: 'application/json',
          temperature: 0,
        },
      });

      logger.info('llm.request.completed', {
        event: 'llm.request.completed',
        model: input.model,
        durationMs: Date.now() - startedAt,
      });

      return parseJsonResponse(response.text ?? '{}');
    } catch (error) {
      logger.error('llm.request.failed', {
        event: 'llm.request.failed',
        model: input.model,
        durationMs: Date.now() - startedAt,
        error: formatUnknownError(error),
      });
      throw error;
    }
  }

  async extractJson(input: GeminiFileExtractionInput): Promise<Record<string, unknown>> {
    const filePart = createPartFromBase64(
      Buffer.from(input.fileBytes).toString('base64'),
      input.mimeType,
    );

    return this.generateJson({
      model: input.model,
      contents: [input.prompt, filePart],
    });
  }

  async analyzeJson(input: GeminiPayloadAnalysisInput): Promise<Record<string, unknown>> {
    return this.generateJson({
      model: input.model,
      contents: [input.prompt, JSON.stringify(input.payload, null, 2)],
    });
  }
}
