import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { sankey, sankeyJustify, sankeyLinkHorizontal } from 'd3-sankey'
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3, BriefcaseBusiness,
  CalendarDays, Check, ChevronDown, CirclePlus, Download, FileUp, Gauge,
  LayoutDashboard, Menu, MoreHorizontal, Pencil, Plus, Search, Sparkles, Bot,
  Target, Trash2, TrendingUp, Upload, UserRound, X, LogOut,
} from 'lucide-react'
import { request } from './api.js'
import MemoryAgent from './MemoryAgent.jsx'

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'applications', label: 'Applications', icon: BriefcaseBusiness },
  { id: 'pipeline', label: 'Pipeline', icon: Target },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'agent', label: 'Career agent', icon: Bot },
]
const STATUSES = ['Applied', 'Screening', 'Interview', 'Offer', 'Closed']
const STATUS_CLASS = Object.fromEntries(STATUSES.map((status) => [status, status.toLowerCase()]))

const api = {
  me() { return request('/api/auth/me', { expectedStatuses: [401] }) },
  login(credentials) {
    return request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) })
  },
  register(details) {
    return request('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) })
  },
  logout() { return request('/api/auth/logout', { method: 'POST' }) },
  list() { return request('/api/applications') },
  save(item) {
    return request(item.id ? `/api/applications/${item.id}` : '/api/applications', {
      method: item.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    })
  },
  remove(id) { return request(`/api/applications/${id}`, { method: 'DELETE' }) },
  importCsv(csv) {
    return request('/api/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }),
    })
  },
  getProfile() { return request('/api/profile') },
  saveProfile(profile) {
    return request('/api/profile', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile),
    })
  },
}

const formatDate = (date, short = false) => {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-SG', { month: 'short', day: 'numeric', ...(short ? {} : { year: 'numeric' }) }).format(new Date(`${date}T00:00:00`))
}

function Status({ value }) {
  return <span className={`status status-${STATUS_CLASS[value] || 'applied'}`}><span />{value}</span>
}

function CompanyMark({ company }) {
  const palette = ['#2456d8', '#ff5a36', '#6d4aff', '#079c70', '#d94267']
  const index = company.split('').reduce((total, char) => total + char.charCodeAt(0), 0) % palette.length
  return <span className="company-mark" style={{ '--mark': palette[index] }}>{company.slice(0, 1)}</span>
}

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'NS'

function AppShell({ page, setPage, children, onAdd, onImport, profile, onSaveProfile, user, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const fileRef = useRef(null)
  const navigate = (next) => { setPage(next); setMobileOpen(false); setProfileOpen(false) }
  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    if (file) await onImport(await file.text())
    event.target.value = ''
  }
  useEffect(() => {
    const closeMenus = (event) => {
      if (event.key === 'Escape') { setMobileOpen(false); setProfileOpen(false) }
    }
    window.addEventListener('keydown', closeMenus)
    return () => window.removeEventListener('keydown', closeMenus)
  }, [])
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Sparkles /></span><div><strong>Northstar</strong><small>Your search, in focus.</small></div></div>
        <nav aria-label="Main navigation">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button className={page === id ? 'active' : ''} onClick={() => navigate(id)} key={id}><Icon />{label}</button>
          ))}
        </nav>
        <div className="sidebar-tools">
          <p>Private CockroachDB workspace</p>
          <span>Your applications and agent memory are isolated to this account.</span>
          <div className="tool-actions">
            <button className="icon-button" onClick={() => fileRef.current?.click()} title="Import CSV"><Upload /></button>
            <a className="icon-button" href="/api/export" title="Export CSV"><Download /></a>
          </div>
          <input className="sr-only" ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} />
        </div>
        <div className="profile-wrap">
          {profileOpen ? <div className="profile-menu" role="menu">
            <button role="menuitem" onClick={() => { setProfileOpen(false); setProfileModalOpen(true) }}><UserRound /> Edit profile</button>
            <a role="menuitem" href="/api/export"><Download /> Export CSV</a>
            <button role="menuitem" onClick={onLogout}><LogOut /> Sign out</button>
          </div> : null}
          <button className="profile" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-haspopup="menu">
            <span>{initials(`${profile.firstName} ${profile.lastName}`)}</span><div><strong>{profile.firstName}</strong><small>{profile.role || 'Job search workspace'}</small></div><ChevronDown className={profileOpen ? 'rotated' : ''} />
          </button>
        </div>
      </aside>
      {mobileOpen ? <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} /> : null}
      <main>
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu /></button>
          <div className="mobile-brand">Northstar</div>
          <button className="button primary" onClick={onAdd}><Plus /> Add application</button>
        </header>
        {children}
      </main>
      {profileModalOpen ? <ProfileModal profile={profile} onClose={() => setProfileModalOpen(false)} onSave={onSaveProfile} /> : null}
    </div>
  )
}

function Sankey({ applications }) {
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((status) => [status, applications.filter((item) => item.status === status).length])), [applications])
  const total = applications.length
  const activeFlow = counts.Screening + counts.Interview + counts.Offer
  const graph = useMemo(() => {
    if (!total) return { nodes: [], links: [] }
    const interviewFlow = counts.Interview + counts.Offer
    const nodes = [
      { id: 'applications', label: 'Applications', color: '#315fd3' },
      { id: 'awaiting', label: 'Awaiting reply', color: '#7d9fe8' },
      { id: 'screening', label: 'Screening', color: '#e1a11f' },
      { id: 'screening-now', label: 'In screening', color: '#e1a11f' },
      { id: 'interview', label: 'Interview', color: '#7658e5' },
      { id: 'interview-now', label: 'In interview', color: '#7658e5' },
      { id: 'offer', label: 'Offer', color: '#0b9a70' },
      { id: 'closed', label: 'Closed', color: '#ea4a4a' },
    ]
    const links = [
      { source: 'applications', target: 'awaiting', value: counts.Applied, color: '#9bb6ed' },
      { source: 'applications', target: 'screening', value: activeFlow, color: '#5d82dd' },
      { source: 'applications', target: 'closed', value: counts.Closed, color: '#ef8d83' },
      { source: 'screening', target: 'screening-now', value: counts.Screening, color: '#e8b84f' },
      { source: 'screening', target: 'interview', value: interviewFlow, color: '#8270da' },
      { source: 'interview', target: 'interview-now', value: counts.Interview, color: '#8976e3' },
      { source: 'interview', target: 'offer', value: counts.Offer, color: '#42ad8b' },
    ].filter((link) => link.value > 0)
    return sankey()
      .nodeId((node) => node.id)
      .nodeAlign(sankeyJustify)
      .nodeWidth(16)
      .nodePadding(28)
      .extent([[58, 38], [1042, 302]])({ nodes: nodes.map((node) => ({ ...node })), links: links.map((link) => ({ ...link })) })
  }, [activeFlow, counts, total])
  const linkPath = sankeyLinkHorizontal()
  return (
    <div className="sankey-wrap" aria-label="Application flow diagram">
      <svg viewBox="0 0 1100 340" role="img" aria-label={`${total} applications flowing through awaiting reply, screening, interview, offer and closed stages`}>
        <g className="sankey-links">
          {graph.links.map((link, index) => <path key={`${link.source.id}-${link.target.id}-${index}`} d={linkPath(link)} stroke={link.color} strokeWidth={Math.max(1, link.width)}><title>{link.source.label} → {link.target.label}: {link.value}</title></path>)}
        </g>
        <g className="sankey-nodes">
          {graph.nodes.map((node) => <g key={node.id}>
            <rect x={node.x0} y={node.y0} width={node.x1 - node.x0} height={Math.max(4, node.y1 - node.y0)} rx="4" fill={node.color}><title>{node.label}: {node.value}</title></rect>
            <text x={node.x0 < 550 ? node.x1 + 10 : node.x0 - 10} y={(node.y0 + node.y1) / 2 - 3} textAnchor={node.x0 < 550 ? 'start' : 'end'}>{node.label}</text>
            <text className="node-value" x={node.x0 < 550 ? node.x1 + 10 : node.x0 - 10} y={(node.y0 + node.y1) / 2 + 15} textAnchor={node.x0 < 550 ? 'start' : 'end'}>{node.value}</text>
          </g>)}
        </g>
      </svg>
      <div className="flow-legend"><span><i className="legend-blue"/>In progress {activeFlow}</span><span><i className="legend-orange"/>Offers {counts.Offer}</span><span><i className="legend-red"/>Closed {counts.Closed}</span><span className="flow-note">Ribbon width represents application count</span></div>
    </div>
  )
}

function Metric({ icon: Icon, value, label, note, accent }) {
  return <div className="metric"><span className={`metric-icon ${accent}`}><Icon /></span><div><strong>{value}</strong><span>{label}</span><small>{note}</small></div></div>
}

function PageHeading({ title, copy, kicker, action }) {
  return <div className="page-heading"><div>{kicker ? <span className="page-kicker">{kicker}</span> : null}<h1>{title}</h1><p>{copy}</p></div>{action}</div>
}

function Overview({ applications, setPage, onEdit, profile }) {
  const [range, setRange] = useState('All time')
  const [rangeOpen, setRangeOpen] = useState(false)
  const [rowMenu, setRowMenu] = useState('')
  const interviews = applications.filter((item) => item.status === 'Interview').length
  const offers = applications.filter((item) => item.status === 'Offer').length
  const responses = applications.filter((item) => !['Applied', 'Closed'].includes(item.status)).length
  const active = applications.filter((item) => item.status !== 'Closed').length
  const firstName = profile.firstName || 'there'
  const headlineCopy = interviews || offers
    ? `${firstName}, ${interviews} interview${interviews === 1 ? '' : 's'} and ${offers} offer${offers === 1 ? '' : 's'} are in motion.`
    : `${firstName}, ${active} active application${active === 1 ? '' : 's'} are on the board.`
  const upcoming = [...applications].filter((item) => item.nextDate && item.status !== 'Closed').sort((a, b) => a.nextDate.localeCompare(b.nextDate)).slice(0, 5)
  const flowApplications = useMemo(() => {
    if (range === 'All time') return applications
    const days = range === 'Last 30 days' ? 30 : 90
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return applications.filter((item) => new Date(`${item.appliedDate}T00:00:00`) >= cutoff)
  }, [applications, range])
  return <section className="page overview-page">
    <PageHeading title="The search is taking shape." copy={headlineCopy} />
    <div className="metrics-grid">
      <Metric icon={BriefcaseBusiness} value={active} label="active" note="Across all roles" accent="blue" />
      <Metric icon={CalendarDays} value={interviews} label="interviews" note="In progress" accent="purple" />
      <Metric icon={Sparkles} value={offers} label="offer" note="On the table" accent="coral" />
      <Metric icon={TrendingUp} value={`${Math.round((responses / Math.max(1, applications.length)) * 100)}%`} label="response" note={`${responses} replies · ${applications.length} applied`} accent="green" />
    </div>
    <section className="panel flow-panel">
      <div className="panel-heading"><div><h2>Application flow</h2><p>Where your opportunities are moving—and where they stop.</p></div><div className="range-control"><button className="button subtle" onClick={() => setRangeOpen((open) => !open)} aria-expanded={rangeOpen}>{range} <ChevronDown /></button>{rangeOpen ? <div className="range-menu" role="menu">{['All time', 'Last 30 days', 'Last 90 days'].map((option) => <button role="menuitem" className={option === range ? 'selected' : ''} key={option} onClick={() => { setRange(option); setRangeOpen(false) }}>{option}{option === range ? <Check /> : null}</button>)}</div> : null}</div></div>
      <Sankey applications={flowApplications} />
    </section>
    <div className="overview-lower">
      <section className="panel recent-panel">
        <div className="panel-heading"><h2>Recent applications</h2><button className="text-button" onClick={() => setPage('applications')}>View all <ArrowRight /></button></div>
        <div className="compact-list">
          {applications.slice(0, 5).map((item) => <div className="compact-row" key={item.id}><CompanyMark company={item.company}/><div className="compact-primary"><strong>{item.company}</strong><span>{item.role}</span></div><Status value={item.status}/><time>{formatDate(item.appliedDate, true)}</time><div className="compact-menu-wrap"><button className="row-menu-button" onClick={() => setRowMenu((open) => open === item.id ? '' : item.id)} aria-label={`Actions for ${item.company}`} aria-expanded={rowMenu === item.id}><MoreHorizontal /></button>{rowMenu === item.id ? <div className="compact-menu" role="menu"><button role="menuitem" onClick={() => { onEdit(item); setRowMenu('') }}><Pencil /> Edit application</button><button role="menuitem" onClick={() => { setRowMenu(''); setPage('pipeline') }}><Target /> View in pipeline</button></div> : null}</div></div>)}
        </div>
      </section>
      <section className="panel actions-panel">
        <div className="panel-heading"><h2>Upcoming actions</h2><button className="text-button" onClick={() => setPage('pipeline')}>Pipeline <ArrowRight /></button></div>
        <div className="action-list">
          {upcoming.map((item) => <div className="action-row" key={item.id}><span className="action-icon"><CalendarDays /></span><div><strong>{item.nextStep || 'Follow up'}</strong><span>{item.company} · {item.role}</span></div><time>{formatDate(item.nextDate, true)}</time></div>)}
        </div>
      </section>
    </div>
  </section>
}

function Applications({ applications, onEdit, onDelete }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const deferredSearch = useDeferredValue(search)
  const filtered = useMemo(() => applications.filter((item) => {
    const matchesStatus = status === 'All' || item.status === status
    const haystack = `${item.company} ${item.role} ${item.location}`.toLowerCase()
    return matchesStatus && haystack.includes(deferredSearch.toLowerCase())
  }), [applications, deferredSearch, status])
  return <section className="page applications-page">
    <PageHeading kicker={`${applications.length} tracked`} title="Applications" copy="Every opportunity, with the context you need." action={<a className="button outline" href="/api/export"><Download /> Export CSV</a>} />
    <div className="filters">
      <label className="search-field"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, role, or location" /></label>
      <div className="status-tabs">{['All', ...STATUSES].map((item) => <button key={item} onClick={() => setStatus(item)} className={status === item ? 'active' : ''}>{item}</button>)}</div>
    </div>
    <div className="table-panel">
      <div className="application-table table-head"><span>Company & role</span><span>Status</span><span>Applied</span><span>Next step</span><span>Type</span><span /></div>
      <div className="table-body">
        {filtered.map((item) => <article className="application-table table-row" key={item.id}>
          <div className="company-cell"><CompanyMark company={item.company}/><div><strong>{item.company}</strong><span>{item.role} · {item.location}</span></div></div>
          <Status value={item.status}/><time>{formatDate(item.appliedDate)}</time><div className="next-cell"><strong>{item.nextStep || 'No next step'}</strong><span>{formatDate(item.nextDate)}</span></div><span>{item.type}</span>
          <div className="row-actions"><button className="icon-button" onClick={() => onEdit(item)} title="Edit"><Pencil /></button><button className="icon-button danger" onClick={() => onDelete(item)} title="Delete"><Trash2 /></button></div>
        </article>)}
        {!filtered.length ? <div className="empty-state"><Search /><h3>No applications found</h3><p>Try a different search or status.</p></div> : null}
      </div>
      <footer className="table-footer"><span>Showing {filtered.length} of {applications.length} applications</span><span>Saved automatically to CSV</span></footer>
    </div>
  </section>
}

function Pipeline({ applications, onEdit }) {
  return <section className="page pipeline-page">
    <PageHeading kicker="Live view" title="Pipeline" copy="See momentum at a glance. Select any application to update it." />
    <div className="pipeline-summary"><span><strong>{applications.filter((item) => item.status !== 'Closed').length}</strong> active opportunities</span><span><strong>{applications.filter((item) => item.status === 'Interview').length}</strong> in interviews</span><span><strong>{applications.filter((item) => item.status === 'Offer').length}</strong> offers</span></div>
    <div className="board">
      {STATUSES.map((status) => {
        const items = applications.filter((item) => item.status === status)
        return <section className={`board-column column-${STATUS_CLASS[status]}`} key={status}>
          <header><span>{status}</span><strong>{items.length}</strong></header>
          <div className="board-stack">
            {items.map((item) => <button className="pipeline-card" key={item.id} onClick={() => onEdit(item)}>
              <div><CompanyMark company={item.company}/><MoreHorizontal /></div><strong>{item.company}</strong><span>{item.role}</span>
              <footer><small>{item.type}</small><time>{formatDate(item.nextDate || item.appliedDate, true)}</time></footer>
            </button>)}
            {!items.length ? <div className="column-empty">Nothing here yet</div> : null}
          </div>
        </section>
      })}
    </div>
  </section>
}

function Insights({ applications }) {
  const monthly = useMemo(() => {
    const map = new Map()
    applications.forEach((item) => { const key = item.appliedDate?.slice(0, 7); if (key) map.set(key, (map.get(key) || 0) + 1) })
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6)
  }, [applications])
  const maxMonthly = Math.max(1, ...monthly.map(([, count]) => count))
  const sources = useMemo(() => {
    const map = new Map()
    applications.forEach((item) => map.set(item.source || 'Other', (map.get(item.source || 'Other') || 0) + 1))
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [applications])
  const response = applications.filter((item) => ['Screening', 'Interview', 'Offer'].includes(item.status)).length
  const offer = applications.filter((item) => item.status === 'Offer').length
  return <section className="page insights-page">
    <PageHeading kicker="Your patterns" title="Insights" copy="A quieter look at what is working in your search." />
    <div className="insight-hero">
      <div><span>Response rate</span><strong>{Math.round(response / Math.max(1, applications.length) * 100)}%</strong><p>{response} of {applications.length} applications moved beyond the initial stage.</p></div>
      <div className="ring" style={{ '--progress': `${response / Math.max(1, applications.length) * 360}deg` }}><span>{response}</span><small>responses</small></div>
      <div className="insight-note"><Sparkles /><div><strong>Your strongest signal</strong><p>{offer ? 'You have an offer in hand. Keep the rest of the pipeline warm while you decide.' : 'Referrals are creating the warmest path into conversations.'}</p></div></div>
    </div>
    <div className="insights-grid">
      <section className="panel chart-panel"><div className="panel-heading"><div><h2>Application pace</h2><p>Applications submitted each month</p></div><Gauge /></div>
        <div className="bar-chart">{monthly.map(([month, count]) => <div className="bar-item" key={month}><span className="bar-value">{count}</span><div className="bar" style={{ height: `${Math.max(18, count / maxMonthly * 100)}%` }} /><small>{new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(`${month}-02`))}</small></div>)}</div>
      </section>
      <section className="panel sources-panel"><div className="panel-heading"><div><h2>Where roles come from</h2><p>Source mix across your search</p></div><ArrowUpRight /></div>
        <div className="source-list">{sources.map(([source, count], index) => <div key={source}><span><i style={{ '--source': ['#ff5a36','#376edb','#7558e8','#13a57a','#e2a21b'][index % 5] }} />{source}</span><div className="source-track"><b style={{ width: `${count / applications.length * 100}%` }} /></div><strong>{count}</strong></div>)}</div>
      </section>
    </div>
  </section>
}

function ProfileModal({ profile, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ ...profile }))
  const [saving, setSaving] = useState(false)
  const displayName = [form.firstName, form.lastName].filter(Boolean).join(' ')
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    const saved = await onSave(form)
    setSaving(false)
    if (saved) onClose()
  }
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
      <header><div><span>Workspace identity</span><h2 id="profile-modal-title">Profile & account</h2></div><button className="icon-button" onClick={onClose} aria-label="Close profile form"><X /></button></header>
      <form onSubmit={submit}>
        <div className="profile-editor-heading"><span>{initials(displayName)}</span><div><strong>{displayName || 'Your name'}</strong><small>These details appear only in your Northstar workspace.</small></div></div>
        <div className="form-grid">
          <label>First name<input required value={form.firstName} onChange={update('firstName')} autoComplete="given-name" /></label>
          <label>Last name<input required value={form.lastName} onChange={update('lastName')} autoComplete="family-name" /></label>
          <label>Email address<input required type="email" value={form.email} onChange={update('email')} autoComplete="email" /></label>
          <label>Current role<input value={form.role} onChange={update('role')} placeholder="e.g. Final-year student" /></label>
          <label>Location<input value={form.location} onChange={update('location')} autoComplete="country-name" /></label>
        </div>
        <footer><button type="button" className="button subtle" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : <><Check /> Save profile</>}</button></footer>
      </form>
    </section>
  </div>
}

function ApplicationModal({ item, onClose, onSave }) {
  const empty = { company: '', role: '', type: 'Full-time', location: 'Singapore', status: 'Applied', appliedDate: new Date().toISOString().slice(0, 10), nextStep: '', nextDate: '', source: '', salary: '', url: '', notes: '' }
  const [form, setForm] = useState(() => item ? { ...item } : empty)
  const [saving, setSaving] = useState(false)
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  const submit = async (event) => { event.preventDefault(); setSaving(true); await onSave(form); setSaving(false) }
  return <div className="modal-layer" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="application-modal-title">
      <header><div><span>{item ? 'Update record' : 'New opportunity'}</span><h2 id="application-modal-title">{item ? 'Edit application' : 'Add application'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close application form"><X /></button></header>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label>Company<input required value={form.company} onChange={update('company')} placeholder="e.g. Northwind" /></label>
          <label>Role<input required value={form.role} onChange={update('role')} placeholder="e.g. Product Intern" /></label>
          <label>Status<select value={form.status} onChange={update('status')}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Role type<select value={form.type} onChange={update('type')}><option>Full-time</option><option>Internship</option><option>Contract</option><option>Part-time</option></select></label>
          <label>Location<input value={form.location} onChange={update('location')} /></label>
          <label>Applied date<input required type="date" value={form.appliedDate} onChange={update('appliedDate')} /></label>
          <label>Next step<input value={form.nextStep} onChange={update('nextStep')} placeholder="e.g. Recruiter call" /></label>
          <label>Next date<input type="date" value={form.nextDate} onChange={update('nextDate')} /></label>
          <label>Source<input value={form.source} onChange={update('source')} placeholder="Referral, LinkedIn…" /></label>
          <label>Salary<input value={form.salary} onChange={update('salary')} placeholder="Optional" /></label>
          <label className="span-2">Job link<input type="url" value={form.url} onChange={update('url')} placeholder="https://" /></label>
          <label className="span-2">Notes<textarea value={form.notes} onChange={update('notes')} placeholder="Interview notes, reminders, people to contact…" /></label>
        </div>
        <footer><button type="button" className="button subtle" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : <><Check /> Save application</>}</button></footer>
      </form>
    </section>
  </div>
}

function Toast({ message }) { return message ? <div className="toast"><Check />{message}</div> : null }

function SignIn({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    try {
      const user = await (mode === 'login' ? api.login(form) : api.register(form))
      await onAuthenticated(user)
    } catch (error) { setMessage(error.message) }
    finally { setSubmitting(false) }
  }
  return <main className="sign-in-page">
    <section className="sign-in-card">
      <span className="brand-mark"><Sparkles /></span>
      <p className="page-kicker">Private career workspace</p>
      <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      <p>{mode === 'login' ? 'Sign in to access your private Northstar workspace.' : 'Your applications and AI memories stay isolated to your account.'}</p>
      <form className="auth-form" onSubmit={submit}>
        {mode === 'register' ? <div className="auth-name-row">
          <label>First name<input required autoComplete="given-name" value={form.firstName} onChange={update('firstName')} /></label>
          <label>Last name<input required autoComplete="family-name" value={form.lastName} onChange={update('lastName')} /></label>
        </div> : null}
        <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={update('email')} /></label>
        <label>Password<input required type="password" minLength={mode === 'register' ? 12 : undefined} maxLength="128" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={update('password')} /></label>
        {mode === 'register' ? <small>Use at least 12 characters.</small> : null}
        {message ? <div className="auth-error" role="alert">{message}</div> : null}
        <button className="button primary" disabled={submitting}>{submitting ? 'Please wait…' : <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight /></>}</button>
      </form>
      <button className="auth-switch" onClick={() => { setMode((current) => current === 'login' ? 'register' : 'login'); setMessage('') }}>
        {mode === 'login' ? 'New to Northstar? Create an account' : 'Already have an account? Sign in'}
      </button>
    </section>
  </main>
}

export default function App() {
  const [page, setPage] = useState(() => window.location.hash.slice(1) || 'overview')
  const [applications, setApplications] = useState([])
  const [profile, setProfile] = useState({ firstName: 'Alex', lastName: 'Johnson', email: 'alex.johnson@example.com', role: 'Job seeker', location: 'Singapore' })
  const [editing, setEditing] = useState(undefined)
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [authenticationRequired, setAuthenticationRequired] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const notify = useCallback((message) => { setToast(message); window.setTimeout(() => setToast(''), 2400) }, [])

  const loadWorkspace = useCallback(async (identity) => {
    const [nextApplications, nextProfile] = await Promise.all([api.list(), api.getProfile()])
    setUser(identity)
    setApplications(nextApplications)
    setProfile(nextProfile)
    setAuthenticationRequired(false)
  }, [])

  useEffect(() => {
    api.me()
      .then(loadWorkspace)
      .catch((e) => { if (e.status === 401) setAuthenticationRequired(true); else setError(e.message) })
      .finally(() => setLoading(false))
  }, [loadWorkspace])
  useEffect(() => { window.location.hash = page }, [page])
  useEffect(() => {
    const syncPageFromHash = () => {
      const nextPage = window.location.hash.slice(1)
      if (NAV.some((item) => item.id === nextPage)) setPage(nextPage)
    }
    window.addEventListener('hashchange', syncPageFromHash)
    return () => window.removeEventListener('hashchange', syncPageFromHash)
  }, [])

  const openAdd = () => { setEditing(undefined); setModalOpen(true) }
  const openEdit = (item) => { setEditing(item); setModalOpen(true) }
  const save = async (item) => {
    try {
      const saved = await api.save(item)
      setApplications((current) => item.id ? current.map((entry) => entry.id === saved.id ? saved : entry) : [saved, ...current])
      setModalOpen(false); notify(item.id ? 'Application updated' : 'Application added')
    } catch (e) { setError(e.message) }
  }
  const remove = async (item) => {
    if (!window.confirm(`Delete the application for ${item.role} at ${item.company}?`)) return
    try { await api.remove(item.id); setApplications((current) => current.filter((entry) => entry.id !== item.id)); notify('Application deleted') }
    catch (e) { setError(e.message) }
  }
  const importCsv = async (csv) => {
    try { const imported = await api.importCsv(csv); setApplications(imported); notify(`${imported.length} applications imported`) }
    catch (e) { setError(e.message) }
  }
  const saveProfile = async (details) => {
    try {
      const saved = await api.saveProfile(details)
      setProfile(saved)
      notify('Profile updated')
      return true
    } catch (e) { setError(e.message); return false }
  }
  const signOut = async () => {
    try {
      await api.logout()
      setUser(null)
      setApplications([])
      setAuthenticationRequired(true)
    } catch (e) { setError(e.message) }
  }

  const pages = {
    overview: <Overview applications={applications} setPage={setPage} onEdit={openEdit} profile={profile} />,
    applications: <Applications applications={applications} onEdit={openEdit} onDelete={remove} />,
    pipeline: <Pipeline applications={applications} onEdit={openEdit} />,
    insights: <Insights applications={applications} />,
    agent: <MemoryAgent onError={setError} onNotify={notify} />,
  }
  if (!loading && authenticationRequired) return <SignIn onAuthenticated={loadWorkspace} />
  return <AppShell page={page} setPage={setPage} onAdd={openAdd} onImport={importCsv} profile={profile} onSaveProfile={saveProfile} user={user} onLogout={signOut}>
    {loading ? <div className="loading"><span /><p>Finding your north star…</p></div> : pages[page] || pages.overview}
    {modalOpen ? <ApplicationModal item={editing} onClose={() => setModalOpen(false)} onSave={save} /> : null}
    {error ? <div className="error-banner"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X /></button></div> : null}
    <Toast message={toast} />
  </AppShell>
}
