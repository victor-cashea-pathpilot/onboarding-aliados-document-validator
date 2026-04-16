export interface GeminiGenerateJsonInput {
  model: string;
  contents: Array<string | Record<string, unknown>>;
}

export interface GeminiFileExtractionInput {
  model: string;
  prompt: string;
  fileBytes: Uint8Array;
  mimeType: string;
}

export interface GeminiPayloadAnalysisInput {
  model: string;
  prompt: string;
  payload: Record<string, unknown>;
}

export interface GeminiClient {
  generateJson(input: GeminiGenerateJsonInput): Promise<Record<string, unknown>>;
  extractJson(input: GeminiFileExtractionInput): Promise<Record<string, unknown>>;
  analyzeJson(input: GeminiPayloadAnalysisInput): Promise<Record<string, unknown>>;
}
