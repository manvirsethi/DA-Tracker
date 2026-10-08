import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Archive, ArrowLeft, ArrowRight, BriefcaseBusiness, Check, CircleAlert,
  Clock3, Download, ExternalLink, FileSpreadsheet, LayoutDashboard, Moon, Plus, RotateCcw,
  Search, Settings2, Sun, Trash2, X,
} from 'lucide-react';
import {
  addDeadline, changeStage, createApplication, deleteDeadline, exportSnapshot,
  listApplications, listDeadlines, listEvents, restoreApplication, setStatus, toggleDeadline,
  updateApplication,
} from './db';
import type { Application, ApplicationEvent, ApplicationInput, ApplicationStage, ApplicationStatus, Deadline, Priority } from './types';
import { PIPELINE_GROUPS, STAGES } from './types';

type View = 'dashboard' | 'applications' | 'archive';
type Theme = 'light' | 'dark';
const DAY = 86_400_000;

function stageLabel(stage: ApplicationStage) {
  if (stage === 'Not yet applied') return 'Not applied';
  if (stage === 'Application submitted') return 'Applied';
  return stage;
}

function parseDateOnly(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysUntil(value: string) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((parseDateOnly(value).getTime() - start.getTime()) / DAY);
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(parseDateOnly(value.slice(0, 10)));
}

function deadlineLabel(value: string) {
  const days = daysUntil(value);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days}d`;
}

function priorityRank(priority: Priority) {
  return priority === 'High' ? 0 : priority === 'Medium' ? 1 : 2;
}

function useAppData() {
  const [active, setActive] = useState<Application[]>([]);
  const [archived, setArchived] = useState<Application[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [a, ar, d] = await Promise.all([listApplications(false), listApplications(true), listDeadlines()]);
      setActive(a);
      setArchived(ar);
      setDeadlines(d);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  return { active, archived, deadlines, loading, error, refresh };
}

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('All');
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('da-tracker-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const { active, archived, deadlines, loading, error, refresh } = useAppData();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('da-tracker-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.metaKey) return;
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); setEditId(null); setShowForm(true); }
      if (event.key === '1') { event.preventDefault(); setSelectedId(null); setView('dashboard'); }
      if (event.key === '2') { event.preventDefault(); setSelectedId(null); setView('applications'); }
      if (event.key === '3') { event.preventDefault(); setSelectedId(null); setView('archive'); }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('#global-search')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const selected = useMemo(
    () => [...active, ...archived].find((item) => item.id === selectedId) ?? null,
    [active, archived, selectedId],
  );

  const filteredActive = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active.filter((a) => {
      const matchesQ = !q || [a.company, a.programme, a.location ?? '', a.notes].some((v) => v.toLowerCase().includes(q));
      const matchesStage = stageFilter === 'All' || a.stage === stageFilter;
      return matchesQ && matchesStage;
    });
  }, [active, query, stageFilter]);

  const filteredArchive = useMemo(() => {
    const q = query.trim().toLowerCase();
    return archived.filter((a) => !q || [a.company, a.programme, a.location ?? '', a.notes].some((v) => v.toLowerCase().includes(q)));
  }, [archived, query]);

  async function handleExport(kind: 'json' | 'csv') {
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === 'json') {
      const path = await save({ defaultPath: `DA-Tracker-Backup-${stamp}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (!path) return;
      const snapshot = await exportSnapshot();
      await invoke('write_export_file', { path, contents: JSON.stringify(snapshot, null, 2) });
    } else {
      const path = await save({ defaultPath: `DA-Tracker-Applications-${stamp}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (!path) return;
      const rows = [...active, ...archived];
      const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const csv = [
        ['Company','Programme','Location','Priority','Stage','Status','Date added','Date applied','Application deadline','URL','Notes'],
        ...rows.map((a) => [a.company,a.programme,a.location,a.priority,a.stage,a.status,a.date_added,a.date_applied,a.application_deadline,a.url,a.notes]),
      ].map((row) => row.map(escape).join(',')).join('\n');
      await invoke('write_export_file', { path, contents: csv });
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">DA</div><div><strong>DA Tracker</strong><span>Degree apprenticeships</span></div></div>
        <nav>
          <NavButton active={view === 'dashboard' && !selected} icon={<LayoutDashboard size={18}/>} label="Dashboard" shortcut="⌘1" onClick={() => { setSelectedId(null); setView('dashboard'); }} />
          <NavButton active={view === 'applications' && !selected} icon={<BriefcaseBusiness size={18}/>} label="Applications" shortcut="⌘2" onClick={() => { setSelectedId(null); setView('applications'); }} />
          <NavButton active={view === 'archive' && !selected} icon={<Archive size={18}/>} label="Archive" shortcut="⌘3" onClick={() => { setSelectedId(null); setView('archive'); }} />
        </nav>
        <div className="sidebar-bottom">
          <button
            className="menu-button theme-toggle"
            onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button className="menu-button" onClick={() => void handleExport('json')}><Download size={16}/> Export backup</button>
          <button className="menu-button" onClick={() => void handleExport('csv')}><FileSpreadsheet size={16}/> Export CSV</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="search-box"><Search size={17}/><input id="global-search" placeholder="Search applications…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <button className="primary-button" onClick={() => { setEditId(null); setShowForm(true); }}><Plus size={17}/> Add application <kbd>⌘N</kbd></button>
        </header>

        <section className="content">
          {loading && <EmptyState title="Loading DA Tracker…" body="Opening your local database." />}
          {error && <ErrorState error={error} />}
          {!loading && !error && selected && <ApplicationDetail application={selected} onBack={() => setSelectedId(null)} onRefresh={refresh} onEdit={() => { setEditId(selected.id); setShowForm(true); }} />}
          {!loading && !error && !selected && view === 'dashboard' && <Dashboard applications={active} deadlines={deadlines} onOpen={setSelectedId} />}
          {!loading && !error && !selected && view === 'applications' && <ApplicationsView applications={filteredActive} stageFilter={stageFilter} setStageFilter={setStageFilter} onOpen={setSelectedId} />}
          {!loading && !error && !selected && view === 'archive' && <ArchiveView applications={filteredArchive} onOpen={setSelectedId} onRestore={async (id) => { await restoreApplication(id); await refresh(); }} />}
        </section>
      </main>

      {showForm && <ApplicationForm application={editId ? [...active, ...archived].find((a) => a.id === editId) ?? null : null} onClose={() => setShowForm(false)} onSaved={async (id) => { setShowForm(false); await refresh(); setSelectedId(id); }} />}
    </div>
  );
}

function NavButton({ active, icon, label, shortcut, onClick }: { active: boolean; icon: React.ReactNode; label: string; shortcut: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span><kbd>{shortcut}</kbd></button>;
}

function Dashboard({ applications, deadlines, onOpen }: { applications: Application[]; deadlines: Deadline[]; onOpen: (id: number) => void }) {
  const activeDeadlineMap = new Map(applications.map((a) => [a.id, a]));
  const upcoming = deadlines
    .filter((d) => !d.completed && activeDeadlineMap.has(d.application_id))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const deadlineItems = upcoming.map((d) => ({ deadline: d, application: activeDeadlineMap.get(d.application_id)! }));
  const applicationDeadlines = applications
    .filter((a) => a.application_deadline)
    .map((a) => ({ application: a, title: 'Application deadline', due_date: a.application_deadline! }));
  const attention = [...deadlineItems.map(({ deadline, application }) => ({ application, title: deadline.title, due_date: deadline.due_date })), ...applicationDeadlines]
    .filter((item) => daysUntil(item.due_date) <= (item.application.stage === 'Not yet applied' ? 7 : 3))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 6);
  const inProgress = applications.filter((a) => !['Not yet applied', 'Accepted'].includes(a.stage)).length;
  const offers = applications.filter((a) => ['Offer', 'Accepted'].includes(a.stage)).length;

  return <>
    <PageHeading eyebrow="Overview" title="Dashboard" description="What needs your attention across your applications." />
    <div className="stats-grid">
      <StatCard icon={<CircleAlert size={20}/>} label="Needs action" value={attention.length} />
      <StatCard icon={<Clock3 size={20}/>} label="In progress" value={inProgress} />
      <StatCard icon={<Check size={20}/>} label="Offers" value={offers} />
    </div>
    <div className="dashboard-grid">
      <Panel title="Needs attention" subtitle="Deadlines and applications that are getting close">
        {attention.length === 0 ? <MiniEmpty text="Nothing urgent right now." /> : attention.map((item, index) => (
          <button className="attention-row" key={`${item.application.id}-${item.title}-${index}`} onClick={() => onOpen(item.application.id)}>
            <div><strong>{item.application.company}</strong><span>{item.title}</span></div>
            <div className={`due-chip ${daysUntil(item.due_date) < 0 ? 'danger' : daysUntil(item.due_date) <= 1 ? 'warning' : ''}`}>{deadlineLabel(item.due_date)}</div>
          </button>
        ))}
      </Panel>
      <Panel title="Upcoming deadlines" subtitle="Your next scheduled actions">
        {deadlineItems.length === 0 ? <MiniEmpty text="No extra deadlines added yet." /> : deadlineItems.slice(0, 6).map(({ deadline, application }) => (
          <button className="deadline-row" key={deadline.id} onClick={() => onOpen(application.id)}><div className="date-tile"><strong>{parseDateOnly(deadline.due_date).getDate()}</strong><span>{parseDateOnly(deadline.due_date).toLocaleString('en-GB', { month: 'short' })}</span></div><div><strong>{deadline.title}</strong><span>{application.company} · {application.programme}</span></div></button>
        ))}
      </Panel>
    </div>
    <Panel title="Pipeline" subtitle={`${applications.length} active application${applications.length === 1 ? '' : 's'}`}>
      <div className="pipeline-summary">{PIPELINE_GROUPS.map((group) => <div key={group.label}><span>{group.label}</span><strong>{applications.filter((a) => group.stages.includes(a.stage)).length}</strong></div>)}</div>
    </Panel>
  </>;
}

function ApplicationsView({ applications, stageFilter, setStageFilter, onOpen }: { applications: Application[]; stageFilter: string; setStageFilter: (v: string) => void; onOpen: (id: number) => void }) {
  return <>
    <div className="heading-row"><PageHeading eyebrow="Active" title="Applications" description="Track each apprenticeship from interest through to outcome." /><select className="stage-filter" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}><option>All</option>{STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}</select></div>
    {applications.length === 0 ? <EmptyState title="No applications here" body="Add an apprenticeship when your ChatGPT watcher finds one you want to pursue." /> : <div className="board">
      {PIPELINE_GROUPS.map((group) => {
        const items = applications.filter((a) => group.stages.includes(a.stage)).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
        return <section className="board-column" key={group.label}><div className="column-header"><span>{group.label}</span><strong>{items.length}</strong></div><div className="column-list">{items.map((a) => <ApplicationCard key={a.id} application={a} onClick={() => onOpen(a.id)} />)}{items.length === 0 && <div className="column-empty">No applications</div>}</div></section>;
      })}
    </div>}
  </>;
}

function ArchiveView({ applications, onOpen, onRestore }: { applications: Application[]; onOpen: (id: number) => void; onRestore: (id: number) => void }) {
  return <>
    <PageHeading eyebrow="History" title="Archive" description="Rejected, withdrawn, closed and completed applications stay here for reference." />
    {applications.length === 0 ? <EmptyState title="Archive is empty" body="Completed or closed applications will appear here." /> : <div className="archive-list">{applications.map((a) => <div className="archive-row" key={a.id}><button className="archive-main" onClick={() => onOpen(a.id)}><div><strong>{a.company}</strong><span>{a.programme} · {stageLabel(a.stage)}</span></div><StatusBadge status={a.status}/></button><button className="icon-button" title="Restore" onClick={() => void onRestore(a.id)}><RotateCcw size={17}/></button></div>)}</div>}
  </>;
}

function ApplicationCard({ application, onClick }: { application: Application; onClick: () => void }) {
  return <button className="application-card" onClick={onClick}><div className="card-top"><PriorityDot priority={application.priority}/><span>{application.priority}</span></div><strong>{application.company}</strong><p>{application.programme}</p><div className="card-meta"><span>{stageLabel(application.stage)}</span>{application.application_deadline && <span className={daysUntil(application.application_deadline) <= 3 ? 'urgent-text' : ''}>{deadlineLabel(application.application_deadline)}</span>}</div></button>;
}

function ApplicationDetail({ application, onBack, onRefresh, onEdit }: { application: Application; onBack: () => void; onRefresh: () => Promise<void>; onEdit: () => void }) {
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [showStage, setShowStage] = useState(false);
  const [showDeadline, setShowDeadline] = useState(false);

  const refreshDetail = useCallback(async () => {
    const [e, d] = await Promise.all([listEvents(application.id), listDeadlines(application.id)]);
    setEvents(e); setDeadlines(d);
  }, [application.id]);
  useEffect(() => { void refreshDetail(); }, [refreshDetail]);

  async function move(stage: ApplicationStage) {
    await changeStage(application.id, stage); setShowStage(false); await onRefresh(); await refreshDetail();
  }
  async function archive(status: ApplicationStatus) {
    await setStatus(application.id, status); await onRefresh(); onBack();
  }

  return <>
    <button className="back-button" onClick={onBack}><ArrowLeft size={17}/> Back</button>
    <div className="detail-heading"><div><div className="eyebrow">Application</div><h1>{application.company}</h1><p>{application.programme}{application.location ? ` · ${application.location}` : ''}</p></div><div className="detail-actions"><PriorityBadge priority={application.priority}/><button className="secondary-button" onClick={onEdit}><Settings2 size={16}/> Edit</button></div></div>

    <div className="stage-panel"><div><span>Application status</span><strong>{stageLabel(application.stage)}</strong></div>{application.status === 'Active' && <button className="primary-button" onClick={() => setShowStage(true)}>Change stage <ArrowRight size={16}/></button>}<StatusBadge status={application.status}/></div>

    <div className="detail-grid">
      <Panel title="Next steps" subtitle="Deadlines for this application" action={application.status === 'Active' ? <button className="text-button" onClick={() => setShowDeadline(true)}><Plus size={15}/> Add deadline</button> : undefined}>
        {deadlines.length === 0 ? <MiniEmpty text="No additional deadlines." /> : deadlines.map((d) => <div className={`task-row ${d.completed ? 'done' : ''}`} key={d.id}><button className="check-button" onClick={async () => { await toggleDeadline(d.id, !d.completed); await refreshDetail(); await onRefresh(); }}>{d.completed ? <Check size={14}/> : null}</button><div><strong>{d.title}</strong><span>{formatDate(d.due_date)} · {deadlineLabel(d.due_date)}</span></div><button className="icon-button danger-hover" onClick={async () => { await deleteDeadline(d.id); await refreshDetail(); await onRefresh(); }}><Trash2 size={15}/></button></div>)}
      </Panel>
      <Panel title="Application details" subtitle="Core information">
        <DetailRow label="Application deadline" value={formatDate(application.application_deadline)} />
        <DetailRow label="Date added" value={formatDate(application.date_added)} />
        <DetailRow label="Date applied" value={formatDate(application.date_applied)} />
        {application.url && <button className="link-row" onClick={() => void openUrl(application.url!)}><span>Open application page</span><ExternalLink size={15}/></button>}
      </Panel>
    </div>

    <div className="detail-grid lower">
      <Panel title="Notes" subtitle="Anything useful for this application"><div className={`notes-box ${application.notes ? '' : 'muted'}`}>{application.notes || 'No notes yet.'}</div></Panel>
      <Panel title="Timeline" subtitle="Recorded automatically">
        <div className="timeline">{events.map((event) => <div className="timeline-item" key={event.id}><div className="timeline-dot"/><div><strong>{event.note || (event.type === 'stage_changed' ? `${event.from_stage ? stageLabel(event.from_stage) : ''} → ${event.to_stage ? stageLabel(event.to_stage) : ''}` : event.type.replaceAll('_', ' '))}</strong><span>{new Date(event.created_at).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span></div></div>)}</div>
      </Panel>
    </div>

    {application.status === 'Active' && <div className="terminal-actions"><span>Application outcome</span><div><button onClick={() => void archive('Rejected')}>Mark rejected</button><button onClick={() => void archive('Withdrawn')}>Withdraw</button><button onClick={() => void archive('Closed')}>Vacancy closed</button>{application.stage === 'Accepted' && <button onClick={() => void archive('Archived')}>Archive accepted</button>}</div></div>}

    {showStage && <StageModal current={application.stage} onClose={() => setShowStage(false)} onChoose={(s) => void move(s)} />}
    {showDeadline && <DeadlineModal onClose={() => setShowDeadline(false)} onSave={async (title, due) => { await addDeadline(application.id, title, due); setShowDeadline(false); await refreshDetail(); await onRefresh(); }} />}
  </>;
}

function ApplicationForm({ application, onClose, onSaved }: { application: Application | null; onClose: () => void; onSaved: (id: number) => void }) {
  const [form, setForm] = useState<ApplicationInput>({ company: application?.company ?? '', programme: application?.programme ?? '', location: application?.location ?? '', url: application?.url ?? '', priority: application?.priority ?? 'Normal', stage: application?.stage ?? 'Not yet applied', application_deadline: application?.application_deadline ?? '', notes: application?.notes ?? '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company.trim() || !form.programme.trim()) { setError('Company and programme are required.'); return; }
    if (form.url?.trim()) { try { new URL(form.url); } catch { setError('Enter a valid application URL.'); return; } }
    setSaving(true);
    try {
      if (application) {
        await updateApplication(application.id, form);
        if (form.stage !== application.stage) await changeStage(application.id, form.stage);
        onSaved(application.id);
      } else {
        const id = await createApplication(form);
        onSaved(id);
      }
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSaving(false); }
  }

  return <div className="modal-backdrop"><form className="modal large" onSubmit={submit}><div className="modal-header"><div><span className="eyebrow">{application ? 'Edit' : 'New'}</span><h2>{application ? 'Edit application' : 'Add application'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18}/></button></div>
    <div className="form-grid">
      <label>Company *<input autoFocus value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}/></label>
      <label>Programme *<input value={form.programme} onChange={(e) => setForm({ ...form, programme: e.target.value })}/></label>
      <label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}/></label>
      <label>Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}><option>High</option><option>Medium</option><option>Normal</option></select></label>
      <label>Application status<select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as ApplicationStage })}>{STAGES.map((stage) => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}</select></label>
      <label>Application deadline<input type="date" value={form.application_deadline} onChange={(e) => setForm({ ...form, application_deadline: e.target.value })}/></label>
      <label className="full">Application URL<input placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}/></label>
      <label className="full">Notes<textarea rows={5} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></label>
    </div>
    {error && <div className="form-error">{error}</div>}
    <div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : application ? 'Save changes' : 'Add application'}</button></div>
  </form></div>;
}

function StageModal({ current, onClose, onChoose }: { current: ApplicationStage; onClose: () => void; onChoose: (s: ApplicationStage) => void }) {
  return <div className="modal-backdrop"><div className="modal"><div className="modal-header"><div><span className="eyebrow">Current: {stageLabel(current)}</span><h2>Change status</h2></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div><div className="stage-list">{STAGES.map((stage) => <button key={stage} className={stage === current ? 'current' : ''} disabled={stage === current} onClick={() => onChoose(stage)}><span>{stageLabel(stage)}</span>{stage === current ? <Check size={16}/> : <ArrowRight size={16}/>}</button>)}</div></div></div>;
}

function DeadlineModal({ onClose, onSave }: { onClose: () => void; onSave: (title: string, due: string) => void }) {
  const [title, setTitle] = useState(''); const [due, setDue] = useState('');
  return <div className="modal-backdrop"><form className="modal small" onSubmit={(e) => { e.preventDefault(); if (title.trim() && due) onSave(title, due); }}><div className="modal-header"><div><span className="eyebrow">Application</span><h2>Add deadline</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18}/></button></div><label>What is due?<input autoFocus placeholder="Online assessment" value={title} onChange={(e) => setTitle(e.target.value)}/></label><label>Due date<input type="date" value={due} onChange={(e) => setDue(e.target.value)}/></label><div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!title.trim() || !due}>Add deadline</button></div></form></div>;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div className="page-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>; }
function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <div className="stat-card"><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>; }
function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) { return <section className="panel"><div className="panel-header"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>; }
function MiniEmpty({ text }: { text: string }) { return <div className="mini-empty">{text}</div>; }
function EmptyState({ title, body }: { title: string; body: string }) { return <div className="empty-state"><div className="empty-icon"><BriefcaseBusiness size={22}/></div><h2>{title}</h2><p>{body}</p></div>; }
function ErrorState({ error }: { error: string }) { return <div className="empty-state error"><div className="empty-icon"><CircleAlert size={22}/></div><h2>Could not open DA Tracker</h2><p>{error}</p><small>Make sure the app is running through Tauri, not directly in a browser.</small></div>; }
function DetailRow({ label, value }: { label: string; value: string }) { return <div className="detail-row"><span>{label}</span><strong>{value}</strong></div>; }
function PriorityDot({ priority }: { priority: Priority }) { return <span className={`priority-dot ${priority.toLowerCase()}`} />; }
function PriorityBadge({ priority }: { priority: Priority }) { return <span className={`badge priority ${priority.toLowerCase()}`}><PriorityDot priority={priority}/>{priority}</span>; }
function StatusBadge({ status }: { status: ApplicationStatus }) { return <span className={`badge status ${status.toLowerCase()}`}>{status}</span>; }
