import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, BrainCircuit, CheckCircle2, Database, FileSearch, FileText, LoaderCircle, ShieldCheck, Sparkles, Trash2, UploadCloud } from 'lucide-react'
import './memory-agent.css'

const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1])
  reader.onerror = () => reject(new Error('Could not read the resume'))
  reader.readAsDataURL(file)
})

const request = async (url, options) => {
  const response = await fetch(url, options)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || 'The agent could not complete that request')
  }
  return response.status === 204 ? null : response.json()
}

const CATEGORY_LABELS = {
  skill: 'Skill', experience: 'Experience', achievement: 'Achievement', education: 'Education',
  certification: 'Certification', preference: 'Preference', identity: 'Profile',
}

function SetupStatus({ status }) {
  const items = [
    { label: 'OpenAI agent', ready: status.openaiConfigured, detail: status.openaiConfigured ? 'ready' : 'setup needed' },
    { label: 'CockroachDB memory', ready: status.cockroachConfigured, detail: status.cockroachConfigured ? 'ready' : 'setup needed' },
    { label: 'Cloud MCP', external: true, detail: 'Codex-side' },
  ]
  return <div className="agent-status" aria-label="Agent connection status">
    {items.map((item) => <span className={item.ready ? 'ready' : item.external ? 'external' : ''} key={item.label}><i />{item.label}<small>{item.detail}</small></span>)}
  </div>
}

function MatchResult({ result }) {
  const verdict = result.verdict.replaceAll('_', ' ')
  return <section className="match-result" aria-live="polite">
    <div className="match-score"><strong>{result.score}</strong><span>/100</span><small>{verdict}</small></div>
    <div className="match-summary"><span className="eyebrow">Agent recommendation</span><h3>{result.summary}</h3><p>{result.tailoredPitch}</p></div>
    <div className="match-columns">
      <div><h4><CheckCircle2 />Evidence-backed strengths</h4><ul>{result.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div>
      <div><h4><FileSearch />Gaps to address</h4><ul>{result.gaps.map((item) => <li key={item}>{item}</li>)}</ul></div>
    </div>
    {result.evidence.length ? <div className="evidence-list"><h4>Memory used for this decision</h4>{result.evidence.map((item) => <div key={`${item.requirement}-${item.memory}`}><strong>{item.requirement}</strong><span>{item.memory}</span></div>)}</div> : null}
  </section>
}

export default function MemoryAgent({ onError, onNotify }) {
  const fileRef = useRef(null)
  const [status, setStatus] = useState({ openaiConfigured: false, cockroachConfigured: false, storage: 'local-demo' })
  const [memories, setMemories] = useState([])
  const [uploading, setUploading] = useState(false)
  const [matching, setMatching] = useState(false)
  const [jobDescription, setJobDescription] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    Promise.all([request('/api/agent/status'), request('/api/memory')])
      .then(([nextStatus, nextMemories]) => { setStatus(nextStatus); setMemories(nextMemories) })
      .catch((error) => onError(error.message))
  }, [onError])

  const grouped = useMemo(() => memories.reduce((result, item) => {
    result[item.category] = [...(result[item.category] || []), item]
    return result
  }, {}), [memories])

  const uploadResume = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf') return onError('Please choose a PDF resume')
    if (file.size > 7_500_000) return onError('Resume must be smaller than 7.5 MB')
    setUploading(true)
    setResult(null)
    try {
      const payload = await request('/api/memory/resume', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, base64: await readAsBase64(file) }),
      })
      setMemories(payload.memories)
      setStatus((current) => ({ ...current, storage: payload.storage }))
      onNotify(`${payload.memories.length} career memories saved`)
    } catch (error) { onError(error.message) }
    finally { setUploading(false) }
  }

  const removeMemory = async (id) => {
    try {
      await request(`/api/memory/${id}`, { method: 'DELETE' })
      setMemories((current) => current.filter((item) => item.id !== id))
      onNotify('Memory deleted')
    } catch (error) { onError(error.message) }
  }

  const runMatch = async (event) => {
    event.preventDefault()
    setMatching(true)
    setResult(null)
    try {
      setResult(await request('/api/agent/match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobDescription }),
      }))
    } catch (error) { onError(error.message) }
    finally { setMatching(false) }
  }

  return <section className="page memory-page">
    <div className="memory-heading">
      <div><span className="page-kicker">Persistent career context</span><h1>Your application agent</h1><p>Turn your resume into memory, then use that evidence to evaluate every opportunity.</p></div>
      <SetupStatus status={status} />
    </div>

    <div className="agent-hero">
      <div className="agent-hero-copy"><span><BrainCircuit />Career memory</span><h2>An agent that remembers what you have actually done.</h2><p>Northstar extracts grounded facts from your resume. You can inspect or remove every memory before it is used.</p><div className="trust-row"><span><ShieldCheck />User controlled</span><span><Database />{status.storage === 'cockroachdb' ? 'CockroachDB backed' : 'Local demo mode'}</span></div></div>
      <div className="resume-drop">
        <FileText />
        <strong>{memories.length ? `${memories.length} memories available` : 'Add your resume'}</strong>
        <p>PDF, up to 7.5 MB. The original file is sent only to the server-side extraction endpoint.</p>
        <button className="button primary" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <><LoaderCircle className="spin" />Building memory…</> : <><UploadCloud />{memories.length ? 'Replace resume' : 'Upload resume'}</>}</button>
        <input className="sr-only" ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={uploadResume} />
      </div>
    </div>

    <div className="memory-workspace">
      <section className="panel memory-library">
        <div className="panel-heading"><div><h2>Memory library</h2><p>Facts retrieved by the agent when evaluating roles.</p></div><span className="memory-count">{memories.length}</span></div>
        {memories.length ? <div className="memory-groups">{Object.entries(grouped).map(([category, items]) => <section key={category}><header><span>{CATEGORY_LABELS[category] || category}</span><small>{items.length}</small></header>{items.map((item) => <article className="memory-card" key={item.id}><div><strong>{item.title}</strong><p>{item.content}</p><footer><span>{Math.round(Number(item.confidence) * 100)}% confidence</span><span>{item.sourceName}</span></footer></div><button className="icon-button danger" onClick={() => removeMemory(item.id)} title="Delete memory"><Trash2 /></button></article>)}</section>)}</div> : <div className="memory-empty"><BrainCircuit /><h3>No career memory yet</h3><p>Upload a resume to create inspectable skills, achievements, and experience memories.</p></div>}
      </section>

      <section className="panel job-matcher">
        <div className="panel-heading"><div><h2>Evaluate a job</h2><p>The agent retrieves relevant memory before scoring the role.</p></div><Bot /></div>
        <form onSubmit={runMatch}>
          <label htmlFor="job-description">Job description</label>
          <textarea id="job-description" value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Paste the full job description here…" />
          <div><small>{jobDescription.length.toLocaleString()} characters</small><button className="button primary" disabled={matching || jobDescription.trim().length < 80 || !memories.length}>{matching ? <><LoaderCircle className="spin" />Retrieving memory…</> : <><Sparkles />Run memory match</>}</button></div>
        </form>
      </section>
    </div>
    {result ? <MatchResult result={result} /> : null}
  </section>
}
