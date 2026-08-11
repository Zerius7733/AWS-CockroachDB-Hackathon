import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BrainCircuit, BriefcaseBusiness, CheckCircle2, Database, ExternalLink, FileText,
  LoaderCircle, MapPin, Search, ShieldCheck, Sparkles, Trash2, UploadCloud,
} from 'lucide-react'
import './memory-agent.css'

const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1])
  reader.onerror = () => reject(new Error('Could not read the resume'))
  reader.readAsDataURL(file)
})

const request = async (url, options) => {
  const response = await fetch(url, options)
  if (response.status === 204) return null
  const isJson = response.headers.get('content-type')?.includes('application/json')
  const payload = isJson ? await response.json() : null
  if (!response.ok) throw new Error(payload?.error || 'The agent could not complete that request')
  if (!isJson) throw new Error('The Northstar API returned HTML instead of data. Restart npm run dev and refresh this page.')
  return payload
}

const CATEGORY_LABELS = {
  skill: 'Skill', experience: 'Experience', achievement: 'Achievement', education: 'Education',
  certification: 'Certification', preference: 'Preference', identity: 'Profile',
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'memory', label: 'Memory' },
  { id: 'search', label: 'Job search' },
]

function CareerHeader({ memories, status, uploading, onUpload }) {
  return <header className="career-header">
    <div>
      <h1>Career agent</h1>
      <p>Your experience, remembered and working for you.</p>
    </div>
    <div className="career-summary" aria-label="Career agent status">
      <span><FileText /><strong>{memories.length}</strong><small>résumé memories</small></span>
      <span className={status.cockroachConfigured ? 'connected' : ''}><Database /><i /><strong>CockroachDB</strong><small>{status.cockroachConfigured ? 'connected' : 'setup needed'}</small></span>
      <button className="button outline" onClick={onUpload} disabled={uploading}>
        {uploading ? <><LoaderCircle className="spin" />Building memory…</> : <><UploadCloud />{memories.length ? 'Replace résumé' : 'Upload résumé'}</>}
      </button>
    </div>
  </header>
}

function OverviewView({ memories, status, uploading, onUpload, onSearch }) {
  return <div className="career-overview">
    <section className="overview-intro">
      <div className="overview-icon"><BrainCircuit /></div>
      <div>
        <h2>{memories.length ? 'Your career memory is ready' : 'Start with your résumé'}</h2>
        <p>{memories.length
          ? `Northstar has ${memories.length} grounded facts ready to guide a live job search.`
          : 'Upload a PDF résumé and Northstar will turn your experience into searchable, user-controlled memory.'}</p>
      </div>
      <button className="button primary" onClick={memories.length ? onSearch : onUpload} disabled={uploading}>
        {memories.length ? <><Search />Find matching jobs</> : <><UploadCloud />Upload résumé</>}
      </button>
    </section>
    <div className="overview-flow" aria-label="How Northstar finds jobs">
      <article><span>1</span><div><strong>Remember</strong><p>Résumé facts are stored privately for your account.</p></div><CheckCircle2 /></article>
      <article><span>2</span><div><strong>Discover</strong><p>The agent searches current public job listings.</p></div><Sparkles /></article>
      <article><span>3</span><div><strong>Rank</strong><p>Every result is explained using your actual experience.</p></div><BriefcaseBusiness /></article>
    </div>
    <footer className="overview-trust"><ShieldCheck />{status.storage === 'cockroachdb' ? 'Career memory is backed by CockroachDB and isolated to your account.' : 'Local demo storage is active.'}</footer>
  </div>
}

function MemoryView({ grouped, memories, onRemove, onUpload }) {
  if (!memories.length) return <div className="career-empty">
    <BrainCircuit /><h2>No career memory yet</h2><p>Upload your résumé to create inspectable skills, achievements, and experience memories.</p>
    <button className="button primary" onClick={onUpload}><UploadCloud />Upload résumé</button>
  </div>

  return <div className="memory-view">
    <div className="view-heading"><div><h2>Memory library</h2><p>Review or remove facts before the agent uses them.</p></div><strong>{memories.length} memories</strong></div>
    <div className="memory-scroll">
      {Object.entries(grouped).map(([category, items]) => <section className="memory-section" key={category}>
        <header><span>{CATEGORY_LABELS[category] || category}</span><small>{items.length}</small></header>
        {items.map((item) => <article className="memory-row" key={item.id}>
          <div><strong>{item.title}</strong><p>{item.content}</p><footer><span>{Math.round(Number(item.confidence) * 100)}% confidence</span><span>{item.sourceName}</span></footer></div>
          <button className="icon-button danger" onClick={() => onRemove(item.id)} aria-label={`Delete ${item.title}`}><Trash2 /></button>
        </article>)}
      </section>)}
    </div>
  </div>
}

function JobRow({ job }) {
  return <article className="job-row">
    <div className={`job-score score-${job.matchLevel}`}><strong>{job.score}%</strong><small>{job.matchLevel} match</small></div>
    <div className="job-role"><strong>{job.title}</strong><span>{job.company}</span></div>
    <div className="job-details"><span><MapPin />{job.location}</span><span><BriefcaseBusiness />{job.workMode === 'unspecified' ? job.employmentType : `${job.workMode} · ${job.employmentType}`}</span></div>
    <div className="job-reason"><p>{job.reason}</p><div>{job.matchedSkills.slice(0, 3).map((skill) => <span key={skill}>{skill}</span>)}</div></div>
    <div className="job-source"><strong>{job.source}</strong><span>{job.postedAt}</span></div>
    <a className="button outline" href={job.url} target="_blank" rel="noreferrer">View job<ExternalLink /></a>
  </article>
}

function JobSearchView({ memories, location, setLocation, workMode, setWorkMode, searching, result, cacheMinutes, onSearch, onUpload }) {
  if (!memories.length) return <div className="career-empty">
    <Search /><h2>Add memory before searching</h2><p>The agent needs résumé evidence before it can find and explain suitable jobs.</p>
    <button className="button primary" onClick={onUpload}><UploadCloud />Upload résumé</button>
  </div>

  return <div className="job-search-view">
    <form className="job-search-form" onSubmit={onSearch}>
      <label><span>Location</span><div><MapPin /><input value={location} onChange={(event) => setLocation(event.target.value)} maxLength="120" placeholder="e.g., Singapore or Remote" /></div></label>
      <label><span>Work mode</span><select value={workMode} onChange={(event) => setWorkMode(event.target.value)}><option value="any">Any</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="on-site">On-site</option></select></label>
      <div className="search-submit"><button className="button primary" disabled={searching}>{searching ? <><LoaderCircle className="spin" />Searching the web…</> : <><Search />Find matching jobs</>}</button><small>Same search is reused for {cacheMinutes || 60} min</small></div>
    </form>
    <div className="job-results" aria-live="polite">
      {result ? <>
        <div className="results-heading"><div><h2>{result.jobs.length} matching jobs</h2><p>{result.searchSummary}</p></div><div className="result-timing"><time>{new Date(result.searchedAt).toLocaleString()}</time>{result.cache ? <span className={result.cache.hit ? 'cache-hit' : ''}>{result.cache.hit ? 'Cached result' : 'Fresh search'} · refreshes after {new Date(result.cache.freshUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> : null}</div></div>
        {result.jobs.length ? <div className="job-list">
          <div className="job-list-head"><span>Match</span><span>Role</span><span>Details</span><span>Why this matches</span><span>Source</span><span /></div>
          {result.jobs.map((job) => <JobRow job={job} key={`${job.company}-${job.title}-${job.url}`} />)}
        </div> : <div className="career-empty compact"><Search /><h2>No verified jobs found</h2><p>Try a broader location or choose any work mode.</p></div>}
      </> : <div className="search-empty"><Search /><div><h2>Search live openings using your memory</h2><p>Northstar searches public employer sites and job boards, then ranks listings against what you have actually done.</p></div></div>}
    </div>
    <footer className="search-disclaimer"><ShieldCheck />Results come from the public web. Verify details and apply on the employer’s official site.</footer>
  </div>
}

export default function MemoryAgent({ onError, onNotify }) {
  const fileRef = useRef(null)
  const [activeTab, setActiveTab] = useState('search')
  const [status, setStatus] = useState({ openaiConfigured: false, cockroachConfigured: false, storage: 'local-demo', jobSearchCacheMinutes: 60 })
  const [memories, setMemories] = useState([])
  const [uploading, setUploading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [location, setLocation] = useState('')
  const [workMode, setWorkMode] = useState('any')
  const [result, setResult] = useState(null)

  useEffect(() => {
    Promise.all([request('/api/agent/status'), request('/api/memory'), request('/api/profile')])
      .then(([nextStatus, nextMemories, profile]) => {
        setStatus(nextStatus)
        setMemories(nextMemories)
        setLocation(profile.location || '')
      })
      .catch((error) => onError(error.message))
  }, [onError])

  const grouped = useMemo(() => memories.reduce((groups, item) => {
    groups[item.category] = [...(groups[item.category] || []), item]
    return groups
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
      setActiveTab('memory')
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

  const runSearch = async (event) => {
    event.preventDefault()
    setSearching(true)
    setResult(null)
    try {
      setResult(await request('/api/agent/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location, workMode }),
      }))
    } catch (error) { onError(error.message) }
    finally { setSearching(false) }
  }

  return <section className="page memory-page">
    <input className="sr-only" ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={uploadResume} />
    <CareerHeader memories={memories} status={status} uploading={uploading} onUpload={() => fileRef.current?.click()} />
    <section className="career-workspace">
      <div className="career-tabs" role="tablist" aria-label="Career agent views">
        {TABS.map((tab) => <button role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? 'active' : ''} key={tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </div>
      <div className="career-view" role="tabpanel">
        {activeTab === 'overview' ? <OverviewView memories={memories} status={status} uploading={uploading} onUpload={() => fileRef.current?.click()} onSearch={() => setActiveTab('search')} /> : null}
        {activeTab === 'memory' ? <MemoryView grouped={grouped} memories={memories} onRemove={removeMemory} onUpload={() => fileRef.current?.click()} /> : null}
        {activeTab === 'search' ? <JobSearchView memories={memories} location={location} setLocation={setLocation} workMode={workMode} setWorkMode={setWorkMode} searching={searching} result={result} cacheMinutes={status.jobSearchCacheMinutes} onSearch={runSearch} onUpload={() => fileRef.current?.click()} /> : null}
      </div>
    </section>
  </section>
}
