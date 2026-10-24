// DA Tracker's active data source is Supabase. Original SQLite storage remains in
// local-db.ts and is only accessed via the explicit import flow.
export {
  listApplications, getApplication, createApplication, updateApplication,
  changeStage, setStatus, restoreApplication, addDeadline, listDeadlines,
  toggleDeadline, deleteDeadline, listEvents, exportSnapshot,
} from './cloud-db';
