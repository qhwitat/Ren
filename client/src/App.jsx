import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const API = (path, opts) => fetch(path, opts).then(r => r.json())

function isArabic(text) {
  return /[\u0600-\u06FF]/.test(text?.slice(0, 50) || '')
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button className={`action-btn ${copied ? 'copied' : ''}`} onClick={copy}>
      {copied ? (
        <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg> تم</>
      ) : (
        <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> نسخ</>
      )}
    </button>
  )
}

function Message({ msg, onRegenerate }) {
  const arabic = isArabic(msg.content)
  const isUser = msg.role === 'user'
  return (
    <div className={`msg-wrap ${msg.role}`}>
      <div className={`bubble ${msg.role} ${arabic ? 'rtl-text' : 'ltr-text'}`}>
        {msg.streaming ? (
          <>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            <span className="streaming-cursor" />
          </>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: isUser ? 'row-reverse' : 'row' }}>
        <span className="msg-meta">{formatTime(msg.timestamp || new Date())}</span>
        <div className="msg-actions">
          <CopyBtn text={msg.content} />
          {!isUser && !msg.streaming && onRegenerate && (
            <button className="action-btn" onClick={onRegenerate}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-3.36"/></svg>
              إعادة
            </button>
          )}
          {!isUser && msg.model && (
            <span className="msg-meta" style={{ opacity: 0.6 }}>{msg.model?.split('/').pop()?.replace(':free', '')}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function ModelSelector({ models, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const grouped = models.reduce((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = []
    acc[m.provider].push(m)
    return acc
  }, {})

  const providerNames = { groq: 'Groq', gemini: 'Gemini', openrouter: 'OpenRouter' }
  const current = models.find(m => m.id === selected?.id && m.provider === selected?.provider)

  return (
    <div className="model-sel" ref={ref}>
      <button className="model-btn" onClick={() => setOpen(!open)}>
        <span className="model-dot" />
        <span className="model-label">{current?.label || 'اختر نموذج'}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6,9 12,15 18,9"/></svg>
      </button>
      {open && (
        <div className="model-dropdown">
          {Object.entries(grouped).map(([provider, ms]) => (
            <div key={provider}>
              <div className="model-group-label">{providerNames[provider] || provider}</div>
              {ms.map(m => (
                <div
                  key={m.id}
                  className={`model-option ${selected?.id === m.id && selected?.provider === m.provider ? 'selected' : ''}`}
                  onClick={() => { onChange(m); setOpen(false) }}
                >
                  {m.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [convos, setConvos] = useState([])
  const [currentId, setCurrentId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [models, setModels] = useState([])
  const [selected, setSelected] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentTitle, setCurrentTitle] = useState('')
  const [webSearch, setWebSearch] = useState(false)
  const bottomRef = useRef()
  const textareaRef = useRef()

  useEffect(() => {
    API('/api/models').then(ms => {
      setModels(ms)
      if (ms.length) setSelected(ms.find(m => m.provider === 'openrouter') || ms[0])
    })
    API('/api/conversations').then(setConvos)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  const loadConvo = useCallback(async (id) => {
    setCurrentId(id)
    setSidebarOpen(false)
    const c = await API(`/api/conversations/${id}`)
    setMessages(c.messages || [])
    setCurrentTitle(c.title || '')
  }, [])

  const newConvo = async () => {
    const c = await API('/api/conversations', { method: 'POST' })
    setConvos(prev => [c, ...prev])
    setCurrentId(c._id)
    setMessages([])
    setCurrentTitle('محادثة جديدة')
    setSidebarOpen(false)
  }

  const deleteConvo = async (e, id) => {
    e.stopPropagation()
    await API(`/api/conversations/${id}`, { method: 'DELETE' })
    setConvos(prev => prev.filter(c => c._id !== id))
    if (currentId === id) { setCurrentId(null); setMessages([]); setCurrentTitle('') }
  }

  const send = async (overrideMsg) => {
    const msg = (overrideMsg ?? input).trim()
    if (!msg || loading || !selected) return
    if (!currentId) { await newConvo(); return }

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)

    const userMsg = { role: 'user', content: msg, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])

    const streamMsg = { role: 'assistant', content: '', streaming: true, timestamp: new Date(), model: selected.id }
    setMessages(prev => [...prev, streamMsg])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: currentId, message: msg, model: selected.id, provider: selected.provider })
      })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const d = JSON.parse(line.slice(6))
            if (d.delta) {
              full += d.delta
              setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: full } : m))
            }
            if (d.done) {
              setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, streaming: false } : m))
              if (d.title) {
                setCurrentTitle(d.title)
                setConvos(prev => prev.map(c => c._id === currentId ? { ...c, title: d.title } : c))
              }
            }
          } catch {}
        }
      }
    } catch (e) {
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: 'حدث خطأ: ' + e.message, streaming: false } : m))
    }

    setLoading(false)
  }

  const regenerate = async () => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUser) return
    setMessages(prev => prev.slice(0, -1))
    await send(lastUser.content)
  }

  const onKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const ensureConvoThenSend = async () => {
    if (!currentId) {
      const c = await API('/api/conversations', { method: 'POST' })
      setConvos(prev => [c, ...prev])
      setCurrentId(c._id)
      setMessages([])
      setCurrentTitle('محادثة جديدة')
      setTimeout(() => send(), 100)
    } else {
      send()
    }
  }

  return (
    <div className="app">
      <div className={`overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-dot" />
          <span className="logo-text">Ren AI</span>
        </div>
        <button className="new-btn" onClick={newConvo}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          محادثة جديدة
        </button>
        <div className="convos">
          {convos.map(c => (
            <div key={c._id} className={`convo-item ${c._id === currentId ? 'active' : ''}`} onClick={() => loadConvo(c._id)}>
              <span className="convo-title">{c.title || 'محادثة جديدة'}</span>
              <button className="del-btn" onClick={e => deleteConvo(e, c._id)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6M14,11v6"/></svg>
              </button>
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="avatar">QX</div>
          <div className="user-info">
            <div className="user-name">qxp</div>
            <div className="user-sub">استخدام شخصي</div>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <ModelSelector models={models} selected={selected} onChange={setSelected} />
          <span className="convo-name">{currentTitle}</span>
          <div className="topbar-actions">
            <button className={`icon-btn ${webSearch ? 'active' : ''}`} title="بحث ويب" onClick={() => setWebSearch(!webSearch)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            {currentId && (
              <button className="icon-btn" title="مسح المحادثة" onClick={() => { setMessages([]); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/></svg>
              </button>
            )}
          </div>
        </div>

        <div className="messages">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-dot">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cc2222" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              </div>
              <h2>Ren AI</h2>
              <p>ابدأ محادثة جديدة</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <Message
              key={i}
              msg={msg}
              onRegenerate={i === messages.length - 1 && msg.role === 'assistant' ? regenerate : null}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="input-area">
          <div className="input-wrap">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={e => { setInput(e.target.value); autoResize() }}
              onKeyDown={onKey}
              placeholder="اكتب رسالتك..."
              disabled={loading}
            />
            <div className="input-btns">
              <button className="attach-btn" title="رفع ملف">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </button>
              <button className="send-btn" onClick={ensureConvoThenSend} disabled={loading || !input.trim()}>
                {loading ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:'spin 1s linear infinite'}}><circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
