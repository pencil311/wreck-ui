import 'dotenv/config';
import express from 'express';
import {GoogleGenAI} from '@google/genai';

const PORT = Number(process.env.COACH_PORT || 8787);
const MODEL = 'gemini-flash-latest';

const SYSTEM = [
  'You are the WRECK coach inside a fitness app.',
  'You are given a snapshot of this user\'s own logged data. Explain their plan using ONLY that snapshot.',
  'If the snapshot does not contain something, say you do not have it yet and name what they could log.',
  'Never invent numbers, sessions, foods or history that are not in the snapshot.',
  'Be concise: two or three short paragraphs at most, plain sentences, no markdown headings, no bullet characters other than a leading "- ".',
  'Speak plainly and without hype. A missed day is not a backlog.',
  'You are not a clinician. For pain, injury, illness, medication, disordered eating or anything medical,',
  'say briefly that it is outside what you can advise on and point them to a qualified professional.',
].join(' ');

const app = express();
app.use(express.json({limit: '64kb'}));

const apiKey = process.env.GEMINI_API_KEY;
// The key stays on this process. The browser only ever sends its snapshot here.
const ai = apiKey ? new GoogleGenAI({apiKey}) : null;

app.get('/api/coach/health', (_req, res) => {
  res.json({ok: true, model: MODEL, configured: Boolean(ai)});
});

app.post('/api/coach', async (req, res) => {
  const {message, history, snapshot} = req.body ?? {};

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({error: 'message required'});
  }
  // No key configured is an expected state, not a failure: the client falls
  // back to its own offline engine when this is not a 200.
  if (!ai) {
    return res.status(503).json({error: 'GEMINI_API_KEY not set'});
  }

  const turns = Array.isArray(history) ? history.slice(-10) : [];
  const contents = [
    ...turns
      .filter((t: any) => t && typeof t.text === 'string')
      .map((t: any) => ({
        role: t.role === 'user' ? 'user' : 'model',
        parts: [{text: String(t.text).slice(0, 2000)}],
      })),
    {
      role: 'user',
      parts: [
        {
          text:
            'Snapshot of my data as JSON:\n' +
            JSON.stringify(snapshot ?? {}).slice(0, 4000) +
            '\n\nMy question: ' +
            message.slice(0, 1000),
        },
      ],
    },
  ];

  try {
    const result = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {systemInstruction: SYSTEM, temperature: 0.4, maxOutputTokens: 600},
    });
    const reply = (result.text ?? '').trim();
    if (!reply) return res.status(502).json({error: 'empty reply'});
    res.json({reply});
  } catch (err) {
    console.error('[coach]', err instanceof Error ? err.message : err);
    res.status(502).json({error: 'upstream failed'});
  }
});

app.listen(PORT, () => {
  console.log(
    `[coach] listening on http://localhost:${PORT} (model ${MODEL}, key ${ai ? 'present' : 'missing'})`,
  );
});
