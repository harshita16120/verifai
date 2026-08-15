export interface LaymanAIResponse {
  summary: string;
  reasons: string[];
  provider: 'Google Gemini' | 'OpenRouter Llama' | 'Fallback Template';
}

export async function generateAiLaymanExplanation(
  score: number,
  category: string,
  reasons: string[],
  fileType: string
): Promise<LaymanAIResponse | null> {
  const googleKey = process.env.GOOGLE_AI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  const promptText = `You are a digital forensics expert explaining a deepfake verification result to a non-technical user.
File Type: ${fileType}
Trust Score: ${score}% (${category})
Detector Findings:
${reasons.map((r) => `- ${r}`).join('\n')}

Provide a concise, 2-sentence plain-English summary explaining why this file scored ${score}%, and list 3 key non-technical observation bullet points. Return as JSON with keys: "summary" (string) and "reasons" (array of 3 strings).`;

  // Option A: Google AI Studio (Gemini 1.5 Flash - Free Tier)
  if (googleKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${googleKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(5000),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (jsonText) {
          const parsed = JSON.parse(jsonText);
          return {
            summary: parsed.summary || parsed.description,
            reasons: parsed.reasons || reasons,
            provider: 'Google Gemini',
          };
        }
      }
    } catch {
      // Silently fall through to next provider or template fallback
    }
  }

  // Option B: OpenRouter Free Tier (Llama 3.1 8B Instruct Free)
  if (openRouterKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.1-8b-instruct:free',
          messages: [{ role: 'user', content: promptText }],
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          return {
            summary: parsed.summary,
            reasons: parsed.reasons || reasons,
            provider: 'OpenRouter Llama',
          };
        }
      }
    } catch {
      // Silently fall through
    }
  }

  return null;
}

export async function queryHuggingFaceSecondOpinion(buffer: ArrayBuffer): Promise<{ score: number; label: string } | null> {
  const hfKey = process.env.HUGGINGFACE_API_KEY;
  if (!hfKey) return null;

  try {
    const res = await fetch(
      'https://api-inference.huggingface.co/models/prithivMLmods/Deep-Fake-Detector-v2',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfKey}`,
          'Content-Type': 'application/octet-stream',
        },
        body: buffer,
        signal: AbortSignal.timeout(6000),
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const topResult = data[0];
        return {
          score: Math.round((topResult.score || 0) * 100),
          label: topResult.label || 'Unknown',
        };
      }
    }
  } catch {
    // Fail gracefully
  }

  return null;
}
