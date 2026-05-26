const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

mongoose.connect(process.env.MONGO_URI).then(() => console.log('MongoDB connected'));

const MessageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'] },
  content: String,
  model: String,
  provider: String,
  timestamp: { type: Date, default: Date.now }
});

const ConversationSchema = new mongoose.Schema({
  title: { type: String, default: 'محادثة جديدة' },
  messages: [MessageSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Conversation = mongoose.model('Conversation', ConversationSchema);

const PROVIDERS = {
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: () => process.env.GROQ_API_KEY,
    models: [{ id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' }]
  },
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: () => process.env.GOOGLE_KEY,
    models: [
      { id: 'gemini-2.5-pro-preview-05-06', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' }
    ]
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: () => process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_2,
    models: [
      { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1' },
      { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3' },
      { id: 'google/gemini-2.5-pro-exp-03-25:free', label: 'Gemini 2.5 (OR)' },
      { id: 'meta-llama/llama-4-maverick:free', label: 'Llama 4 Maverick' },
      { id: 'mistralai/mistral-nemo:free', label: 'Mistral Nemo' },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free', label: 'Qwen Coder 32B' },
      { id: 'nousresearch/hermes-3-llama-3.1-405b:free', label: 'Hermes 3 405B' }
    ]
  }
};

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  "You are Ren, a smart personal AI assistant. Always respond in the same language the user writes in. Be clear, balanced, and direct — not too short, not too long. No unnecessary intros or filler phrases.";

app.get('/api/models', (req, res) => {
  const result = [];
  for (const [provider, cfg] of Object.entries(PROVIDERS)) {
    if (cfg.apiKey()) {
      cfg.models.forEach(m => result.push({ provider, id: m.id, label: m.label }));
    }
  }
  res.json(result);
});

app.get('/api/conversations', async (req, res) => {
  try {
    const convos = await Conversation.find({}, 'title updatedAt createdAt')
      .sort({ updatedAt: -1 }).limit(60);
    res.json(convos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/conversations', async (req, res) => {
  try {
    const c = await new Conversation().save();
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/conversations/:id', async (req, res) => {
  try {
    const c = await Conversation.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/conversations/:id', async (req, res) => {
  try {
    await Conversation.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/conversations/:id/title', async (req, res) => {
  try {
    const c = await Conversation.findByIdAndUpdate(req.params.id, { title: req.body.title }, { new: true });
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/chat', async (req, res) => {
  const { conversationId, message, model, provider } = req.body;
  if (!message || !model || !provider) return res.status(400).json({ error: 'Missing fields' });

  const cfg = PROVIDERS[provider];
  if (!cfg || !cfg.apiKey()) return res.status(400).json({ error: 'Invalid provider' });

  let convo;
  try {
    convo = await Conversation.findById(conversationId);
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
  } catch (e) { return res.status(500).json({ error: e.message }); }

  convo.messages.push({ role: 'user', content: message });

  const apiMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...convo.messages.slice(-24).map(m => ({ role: m.role, content: m.content }))
  ];

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cfg.apiKey()}`
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://qusix111-ren.hf.space';
    headers['X-Title'] = 'Ren AI';
  }

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const apiRes = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages: apiMessages, stream: true, max_tokens: 3000 })
    });

    if (!apiRes.ok) {
      const err = await apiRes.text();
      res.write(`data: ${JSON.stringify({ error: err })}\n\n`);
      res.end();
      return;
    }

    let fullContent = '';
    const reader = apiRes.body;
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of reader) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullContent += delta;
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        } catch {}
      }
    }

    convo.messages.push({ role: 'assistant', content: fullContent, model, provider });
    if (convo.messages.length === 2) {
      convo.title = message.slice(0, 45) + (message.length > 45 ? '…' : '');
    }
    convo.updatedAt = new Date();
    await convo.save();

    res.write(`data: ${JSON.stringify({ done: true, conversationId: convo._id, title: convo.title })}\n\n`);
    res.end();
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

app.use(express.static(path.join(__dirname, 'client/dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'client/dist/index.html')));

const PORT = process.env.PORT || 7860;
app.listen(PORT, '0.0.0.0', () => console.log(`Ren AI running on port ${PORT}`));
