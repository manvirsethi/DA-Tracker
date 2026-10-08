import Database from '@tauri-apps/plugin-sql';
import type { Application, ApplicationEvent, ApplicationInput, ApplicationStage, ApplicationStatus, Deadline } from './types';

let dbPromise: Promise<Database> | null = null;

async function initialiseDatabase(db: Database) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      programme TEXT NOT NULL,
      location TEXT,
      url TEXT,
      priority TEXT NOT NULL DEFAULT 'Normal',
      stage TEXT NOT NULL DEFAULT 'Not yet applied',
      status TEXT NOT NULL DEFAULT 'Active',
      date_added TEXT NOT NULL,
      date_applied TEXT,
      application_deadline TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS application_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      from_stage TEXT,
      to_stage TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS deadlines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_deadlines_due_date ON deadlines(due_date)');
}

export async function getDb() {
  if (!dbPromise) {
    dbPromise = Database.load('sqlite:da-tracker.db').then(async (db) => {
      await initialiseDatabase(db);
      return db;
    });
  }
  return dbPromise;
}

export async function listApplications(includeArchived = false): Promise<Application[]> {
  const db = await getDb();
  const where = includeArchived ? "status != 'Active'" : "status = 'Active'";
  return db.select<Application[]>(`SELECT * FROM applications WHERE ${where} ORDER BY updated_at DESC`);
}

export async function getApplication(id: number): Promise<Application | null> {
  const db = await getDb();
  const rows = await db.select<Application[]>('SELECT * FROM applications WHERE id = $1 LIMIT 1', [id]);
  return rows[0] ?? null;
}

export async function createApplication(input: ApplicationInput): Promise<number> {
  const db = await getDb();
  const now = new Date().toISOString();
  const dateAdded = now.slice(0, 10);
  const dateApplied = input.stage === 'Not yet applied' || input.stage === 'Preparing application'
    ? null
    : dateAdded;
  const result = await db.execute(
    `INSERT INTO applications
      (company, programme, location, url, priority, stage, status, date_added, date_applied, application_deadline, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'Active', $7, $8, $9, $10, $11, $11)`,
    [
      input.company.trim(),
      input.programme.trim(),
      input.location?.trim() || null,
      input.url?.trim() || null,
      input.priority,
      input.stage,
      dateAdded,
      dateApplied,
      input.application_deadline || null,
      input.notes?.trim() || '',
      now,
    ],
  );
  const id = Number(result.lastInsertId);
  await addEvent(id, 'created', null, input.stage, 'Application added');
  return id;
}

export async function updateApplication(id: number, input: ApplicationInput) {
  const db = await getDb();
  await db.execute(
    `UPDATE applications SET company=$1, programme=$2, location=$3, url=$4, priority=$5,
      application_deadline=$6, notes=$7, updated_at=$8 WHERE id=$9`,
    [
      input.company.trim(), input.programme.trim(), input.location?.trim() || null,
      input.url?.trim() || null, input.priority, input.application_deadline || null,
      input.notes?.trim() || '', new Date().toISOString(), id,
    ],
  );
}

export async function changeStage(id: number, toStage: ApplicationStage) {
  const current = await getApplication(id);
  if (!current || current.stage === toStage) return;
  const db = await getDb();
  const now = new Date().toISOString();
  const isPreApplication = toStage === 'Not yet applied' || toStage === 'Preparing application';
  const appliedDate = current.date_applied || (!isPreApplication ? now.slice(0, 10) : null);
  await db.execute('UPDATE applications SET stage=$1, date_applied=$2, updated_at=$3 WHERE id=$4', [toStage, appliedDate, now, id]);
  await addEvent(id, 'stage_changed', current.stage, toStage, null);
}

export async function setStatus(id: number, status: ApplicationStatus) {
  const db = await getDb();
  const current = await getApplication(id);
  if (!current) return;
  await db.execute('UPDATE applications SET status=$1, updated_at=$2 WHERE id=$3', [status, new Date().toISOString(), id]);
  await addEvent(id, 'status_changed', current.stage, current.stage, `Marked ${status.toLowerCase()}`);
}

export async function restoreApplication(id: number) {
  const db = await getDb();
  await db.execute("UPDATE applications SET status='Active', updated_at=$1 WHERE id=$2", [new Date().toISOString(), id]);
  const current = await getApplication(id);
  await addEvent(id, 'restored', current?.stage ?? null, current?.stage ?? null, 'Restored to active applications');
}

export async function addDeadline(applicationId: number, title: string, dueDate: string) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute('INSERT INTO deadlines (application_id, title, due_date, completed, created_at) VALUES ($1,$2,$3,0,$4)', [applicationId, title.trim(), dueDate, now]);
  await addEvent(applicationId, 'deadline_added', null, null, `${title.trim()} due ${dueDate}`);
}

export async function listDeadlines(applicationId?: number): Promise<Deadline[]> {
  const db = await getDb();
  if (applicationId) {
    return db.select<Deadline[]>('SELECT * FROM deadlines WHERE application_id=$1 ORDER BY due_date ASC', [applicationId]);
  }
  return db.select<Deadline[]>('SELECT * FROM deadlines ORDER BY due_date ASC');
}

export async function toggleDeadline(id: number, completed: boolean) {
  const db = await getDb();
  await db.execute('UPDATE deadlines SET completed=$1 WHERE id=$2', [completed ? 1 : 0, id]);
}

export async function deleteDeadline(id: number) {
  const db = await getDb();
  await db.execute('DELETE FROM deadlines WHERE id=$1', [id]);
}

export async function listEvents(applicationId: number): Promise<ApplicationEvent[]> {
  const db = await getDb();
  return db.select<ApplicationEvent[]>('SELECT * FROM application_events WHERE application_id=$1 ORDER BY created_at DESC', [applicationId]);
}

async function addEvent(applicationId: number, type: string, fromStage: ApplicationStage | null, toStage: ApplicationStage | null, note: string | null) {
  const db = await getDb();
  await db.execute(
    'INSERT INTO application_events (application_id, type, from_stage, to_stage, note, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [applicationId, type, fromStage, toStage, note, new Date().toISOString()],
  );
}

export async function exportSnapshot() {
  const db = await getDb();
  const applications = await db.select<Application[]>('SELECT * FROM applications ORDER BY id ASC');
  const deadlines = await db.select<Deadline[]>('SELECT * FROM deadlines ORDER BY id ASC');
  const events = await db.select<ApplicationEvent[]>('SELECT * FROM application_events ORDER BY id ASC');
  return { version: 1, exportedAt: new Date().toISOString(), applications, deadlines, events };
}