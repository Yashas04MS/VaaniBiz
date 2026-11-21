import agoraToken from 'agora-token';
import crypto from 'crypto';
import { db, recordHealth } from './db.ts';
import { createGeminiClient, getGeminiDiagnostics } from './geminiClient.ts';

const { RtcTokenBuilder, RtcRole } = agoraToken;

const MURF_STREAM_URL = 'https://global.api.murf.ai/v1/speech/stream';
const MURF_GEN2_URL = 'https://api.murf.ai/v1/speech/generate';

function getMurfKeys(): string[] {
  const keys = [process.env.MURF_API_KEY, process.env.MURF_API_KEY_ALT].filter(
    (k): k is string => Boolean(k && k.trim().length > 0)
  );
  return [...new Set(keys)];
}

function resolveLocale(languageHint?: string): string {
  const lang = (languageHint || '').toLowerCase();
  if (lang.includes('hi')) return 'hi-IN';
  if (lang.includes('kn')) return 'kn-IN';
  return 'en-IN';
}

export async function synthesizeSpeech(
  text: string,
  languageHint?: string
): Promise<{ audioBuffer: Buffer; mimeType: string; provider: string; latencyMs: number }> {
  const started = Date.now();
  const murfKeys = getMurfKeys();
  const voiceId = process.env.MURF_VOICE_ID || 'en-IN-anisha';
  const locale = resolveLocale(languageHint);
  let lastMurfError = '';

  // Clean up markdown symbols so TTS speaks smoothly
  const spokenText = text
    .replace(/[*_`#]/g, '')
    .replace(/₹\s*/g, 'rupees ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const apiKey of murfKeys) {
    // 1. Try Murf Falcon 2.1 Streaming Endpoint
    try {
      const res = await fetch(MURF_STREAM_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          text: spokenText,
          voiceId,
          model: 'falcon-2.1',
          format: 'MP3',
          sampleRate: 24000,
          locale,
        }),
      });

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuf);
        if (audioBuffer.length > 100) {
          const latencyMs = Date.now() - started;
          recordHealth('murf', 'healthy', `Murf Falcon (${voiceId}) • ${latencyMs}ms`, latencyMs);
          return { audioBuffer, mimeType: 'audio/mpeg', provider: 'murf-falcon', latencyMs };
        }
      } else {
        lastMurfError = `Murf Falcon HTTP ${res.status}: ${await res.text()}`;
      }
    } catch (err: any) {
      lastMurfError = err?.message || 'Murf Falcon request failed';
    }

    // 2. Try Murf Gen2 Generate Endpoint
    try {
      const res = await fetch(MURF_GEN2_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          text: spokenText,
          voiceId,
          format: 'MP3',
          modelVersion: 'GEN2',
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { audioFile?: string; encodedAudio?: string };
        if (data.encodedAudio) {
          const audioBuffer = Buffer.from(data.encodedAudio, 'base64');
          const latencyMs = Date.now() - started;
          recordHealth('murf', 'healthy', `Murf Gen2 (${voiceId}) • ${latencyMs}ms`, latencyMs);
          return { audioBuffer, mimeType: 'audio/mpeg', provider: 'murf-gen2', latencyMs };
        }
        if (data.audioFile) {
          const audioRes = await fetch(data.audioFile);
          if (audioRes.ok) {
            const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
            const latencyMs = Date.now() - started;
            recordHealth('murf', 'healthy', `Murf Gen2 (${voiceId}) • ${latencyMs}ms`, latencyMs);
            return { audioBuffer, mimeType: 'audio/mpeg', provider: 'murf-gen2', latencyMs };
          }
        }
      } else {
        lastMurfError = `Murf Gen2 HTTP ${res.status}: ${await res.text()}`;
      }
    } catch (err: any) {
      lastMurfError = err?.message || 'Murf Gen2 request failed';
    }
  }

  if (murfKeys.length > 0 && lastMurfError) {
    recordHealth('murf', 'degraded', lastMurfError.slice(0, 140), Date.now() - started);
  } else {
    recordHealth('murf', 'missing_key', 'MURF_API_KEY not set in Settings > Secrets', 0);
  }

  // 3. Fallback to Gemini 3.8 Flash Lite TTS if GEMINI_API_KEY is available
  const diag = getGeminiDiagnostics();
  if (diag.configured) {
    const ai = createGeminiClient();
    const ttsResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: spokenText,
              speechMetadata: {
                style: 'Warm, helpful Indian retail assistant',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
    const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const audioBuffer = Buffer.from(base64Audio, 'base64');
      const latencyMs = Date.now() - started;
      return { audioBuffer, mimeType: 'audio/wav', provider: 'gemini-tts-fallback', latencyMs };
    }
  }

  throw new Error(lastMurfError || 'No TTS provider configured. Add MURF_API_KEY in Settings > Secrets.');
}

export function mintAgoraRtcToken(channelName: string, uid: number): { token: string; appId: string } {
  const appId = process.env.AGORA_APP_ID || '';
  const appCert = process.env.AGORA_APP_CERTIFICATE || '';
  if (!appId || !appCert) {
    throw new Error('AGORA_APP_ID and AGORA_APP_CERTIFICATE are required in Settings > Secrets.');
  }
  const expireSeconds = 3600;
  const nowTs = Math.floor(Date.now() / 1000);
  const privilegeExpireTs = nowTs + expireSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCert,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    privilegeExpireTs,
    privilegeExpireTs
  );
  return { token, appId };
}

export async function startAgoraSession(params: {
  channel?: string;
  language?: string;
  baseUrl?: string;
}) {
  const started = Date.now();
  const channel = params.channel || `vaanibiz-ind104-${Date.now().toString(36)}`;
  const userUid = Math.floor(10000 + Math.random() * 80000);
  const agentUid = Number(process.env.AGORA_AGENT_UID || 990104);
  const sessionId = `sess-${crypto.randomUUID().slice(0, 12)}`;

  const { token: userToken, appId } = mintAgoraRtcToken(channel, userUid);
  const { token: agentToken } = mintAgoraRtcToken(channel, agentUid);

  db.prepare(`
    INSERT INTO agent_sessions (id, channel, language, started_at)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, channel, params.language || 'en', new Date().toISOString());

  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;
  const murfKey = process.env.MURF_API_KEY || process.env.MURF_API_KEY_ALT || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.APP_URL || params.baseUrl || '').replace(/\/$/, '');
  const sharedSecret = process.env.LLM_SHARED_SECRET || 'vaanibiz-local-secret';

  let agentId: string | null = null;
  let convoAiActive = false;
  let convoAiNote = 'Agora RTC channel live • Direct Gemini + Murf voice pipeline active';

  if (customerId && customerSecret && publicBase.startsWith('https://') && !publicBase.includes('MY_APP_URL')) {
    try {
      const basicAuth = Buffer.from(`${customerId}:${customerSecret}`).toString('base64');
      const joinUrl = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`;
      const payload = {
        name: `vaanibiz-${sessionId}`,
        properties: {
          channel,
          token: agentToken,
          agent_rtc_uid: String(agentUid),
          remote_rtc_uids: [String(userUid)],
          idle_timeout: 180,
          asr: {
            vendor: 'ares',
            language: params.language === 'hi' ? 'hi-IN' : params.language === 'kn' ? 'kn-IN' : 'en-IN',
          },
          llm: {
            vendor: 'custom',
            url: `${publicBase}/api/llm?session=${sessionId}`,
            api_key: sharedSecret,
            system_messages: [
              {
                role: 'system',
                content: 'You are Vaani, voice operations AI for Sri Lakshmi Kirana.',
              },
            ],
            greeting_message: 'Namaskara Suresh! VaaniBiz is live. Boliye, kya madad karoon?',
            params: {
              model: getGeminiDiagnostics().primaryModel,
            },
          },
          tts: murfKey
            ? {
                vendor: 'murf',
                api_key: murfKey,
                params: {
                  voiceId: process.env.MURF_VOICE_ID || 'en-IN-anisha',
                  style: 'Conversational',
                },
              }
            : undefined,
        },
      };

      const res = await fetch(joinUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      if (res.ok) {
        const parsed = JSON.parse(text) as { agent_id?: string };
        agentId = parsed.agent_id || null;
        convoAiActive = Boolean(agentId);
        convoAiNote = `Agora ConvoAI Agent ${agentId} joined channel #${channel}`;
        db.prepare('UPDATE agent_sessions SET agent_id = ? WHERE id = ?').run(agentId, sessionId);
      } else {
        convoAiNote = `Agora RTC connected (ConvoAI standby: ${res.status})`;
      }
    } catch (err: any) {
      convoAiNote = `Agora RTC connected (Direct voice turn active)`;
    }
  }

  const latencyMs = Date.now() - started;
  recordHealth('agora', 'healthy', convoAiNote, latencyMs);

  return {
    appId,
    channel,
    token: userToken,
    uid: userUid,
    agentUid,
    sessionId,
    agentId,
    convoAiActive,
    convoAiNote,
    latencyMs,
  };
}

export async function stopAgoraSession(sessionId: string) {
  const session = db.prepare('SELECT * FROM agent_sessions WHERE id = ?').get(sessionId) as any;
  if (!session) return { stopped: true };

  db.prepare('UPDATE agent_sessions SET ended_at = ? WHERE id = ?').run(new Date().toISOString(), sessionId);

  const appId = process.env.AGORA_APP_ID;
  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;

  if (session.agent_id && appId && customerId && customerSecret) {
    try {
      const basicAuth = Buffer.from(`${customerId}:${customerSecret}`).toString('base64');
      await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${session.agent_id}/leave`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
      });
    } catch {
      // Ignore leave cleanup failure
    }
  }

  return { stopped: true, sessionId };
}
