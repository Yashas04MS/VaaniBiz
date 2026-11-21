import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai';

export function getCleanGeminiKey(): string {
  const raw = (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!raw || raw === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured. Add it in Settings > Secrets.');
  }
  return raw;
}

export function isVertexExpressKey(apiKey?: string): boolean {
  const key = apiKey || (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  return key.startsWith('AQ.');
}

export function sanitizeModelName(raw?: string): string {
  if (!raw) return '';
  let cleaned = raw.trim().replace(/^["']|["']$/g, '');
  if (!cleaned || cleaned.includes('MY_') || cleaned.includes('YOUR_')) return '';
  cleaned = cleaned.replace(/^publishers\/google\/models\//i, '');
  cleaned = cleaned.replace(/^models\//i, '');
  cleaned = cleaned.replace(/\s+/g, '');
  // Must look like an actual model identifier (e.g. gemini-*), never an API key (AQ., AIza...)
  if (/^(AQ\.|AIza|sk-|ap2_)/i.test(cleaned)) return '';
  if (!/^gemini-[a-z0-9._-]+$/i.test(cleaned)) return '';
  return cleaned;
}

export function getCandidateModels(purpose: 'chat' | 'transcribe'): string[] {
  const envModel = sanitizeModelName(process.env.GEMINI_MODEL);

  if (purpose === 'transcribe') {
    return [
      'gemini-3.1-flash-lite',
      'gemini-3.5-transcribe',
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
      'gemini-4-hydrogen',
    ];
  }

  const defaults = [
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-4-hydrogen',
    'gemini-3.1-pro-preview',
    'gemini-2.5-flash',
  ];

  const list = envModel ? [envModel, ...defaults] : defaults;
  return [...new Set(list)];
}

export function createGeminiClient(options?: { vertexai?: boolean }): GoogleGenAI {
  const apiKey = getCleanGeminiKey();
  const useVertex = options?.vertexai ?? false;

  if (useVertex) {
    return new GoogleGenAI({
      vertexai: true,
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function getGeminiDiagnostics() {
  const raw = (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  const configured = Boolean(raw && raw !== 'MY_GEMINI_API_KEY');
  const candidates = getCandidateModels('chat');
  return {
    configured,
    mode: isVertexExpressKey(raw) ? 'Gemini / Vertex Express Key' : 'Gemini Developer API',
    primaryModel: candidates[0] || 'gemini-3.1-flash-lite',
  };
}

function isRetryableModelError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    msg.includes('unexpected model name format') ||
    msg.includes('not_found') ||
    msg.includes('404') ||
    msg.includes('is not found') ||
    msg.includes('no longer available') ||
    msg.includes('not supported for generatecontent') ||
    msg.includes('invalid_argument')
  );
}

export async function generateWithModelFallback(params: {
  purpose: 'chat' | 'transcribe';
  contents: GenerateContentParameters['contents'];
  config?: Omit<NonNullable<GenerateContentParameters['config']>, 'thinkingConfig'>;
}): Promise<{ response: GenerateContentResponse; modelUsed: string; modeUsed: string }> {
  const apiKey = getCleanGeminiKey();
  const models = getCandidateModels(params.purpose);
  const clientModes = isVertexExpressKey(apiKey) ? [false, true] : [false, true];

  const attemptErrors: string[] = [];
  let lastError: unknown = null;

  for (const useVertex of clientModes) {
    const ai = createGeminiClient({ vertexai: useVertex });
    for (const model of models) {
      try {
        const supportsThinkingLevel =
          model.startsWith('gemini-4') || model.startsWith('gemini-3.1');

        const config: GenerateContentParameters['config'] = {
          ...(params.config || {}),
          ...(supportsThinkingLevel && params.purpose === 'chat'
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
        };

        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config,
        });

        return {
          response,
          modelUsed: model,
          modeUsed: useVertex ? 'vertex-express' : 'gemini-api',
        };
      } catch (err) {
        lastError = err;
        const errMsg = String((err as any)?.message || err || '');
        attemptErrors.push(`[${useVertex ? 'vertex' : 'gemini'}:${model}] ${errMsg.slice(0, 120)}`);
        if (isRetryableModelError(err)) {
          continue;
        }
        if (clientModes.length > 1) {
          break;
        }
        throw err;
      }
    }
  }

  console.error('All Gemini model attempts failed:', attemptErrors.join(' | '));
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError || 'Gemini request failed'));
}
