import type { Application, ApplicationEvent, ApplicationInput, ApplicationStage, ApplicationStatus, Deadline } from './types';
import { requireCloud } from './supabase';
import { exportSnapshot } from './local-db';

function fail(error: { message: string } | null) { if (error) throw new Error(error.message); }
function clean(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([,value]) => value !== undefined));
}

export async function listApplications(includeArchived = false): Promise<Application[]> {
  const { client } = await requireCloud();
  const request = client.from('da_applications').select('*').order('updated_at', { ascending: false });
  const { data, error } = await (includeArchived ? request.neq('status', 'Active') : request.eq('status', 'Active'));
  fail(error);
  return (data ?? []) as Application[];
}
export async function getApplication(id: number): Promise<Application | null> {
  const { client } = await requireCloud();
  const { data, error } = await client.from('da_applications').select('*').eq('id', id).maybeSingle();
  fail(error);
  return data as Application | null;
}
export async function createApplication(input: ApplicationInput): Promise<number> {
  const { client, userId } = await requireCloud();
  const now = new Date().toISOString();
  const applied = !['Not yet applied','Preparing application'].includes(input.stage);
  const { data, error } = await client.from('da_applications').insert({
    owner_id:userId, company:input.company.trim(), programme:input.programme.trim(),
    location:input.location?.trim() || null, url:input.url?.trim() || null,
    priority:input.priority, stage:input.stage, status:'Active',
    date_added:now.slice(0,10), date_applied:applied ? now.slice(0,10) : null,
    application_deadline:input.application_deadline || null, notes:input.notes?.trim() || '',
  }).select('id').single();
  fail(error);
  return Number(data!.id);
}
export async function updateApplication(id:number,input:ApplicationInput):Promise<void> {
  const { client }=await requireCloud();
  const { error }=await client.from('da_applications').update({
    company:input.company.trim(), programme:input.programme.trim(),
    location:input.location?.trim() || null, url:input.url?.trim() || null,
    priority:input.priority, application_deadline:input.application_deadline || null,
    notes:input.notes?.trim() || '', updated_at:new Date().toISOString(),
  }).eq('id',id);
  fail(error);
}
export async function changeStage(id:number,toStage:ApplicationStage):Promise<void> {
  const previous=await getApplication(id);
  if(!previous || previous.stage===toStage)return;
  const { client }=await requireCloud();
  const now=new Date().toISOString();
  const pre=['Not yet applied','Preparing application'].includes(toStage);
  const { error }=await client.from('da_applications').update({
    stage:toStage,updated_at:now,
    date_applied:previous.date_applied || (pre ? null : now.slice(0,10)),
  }).eq('id',id);
  fail(error);
}
export async function setStatus(id:number,status:ApplicationStatus):Promise<void> {
  const { client }=await requireCloud();
  const { error }=await client.from('da_applications').update({status,updated_at:new Date().toISOString()}).eq('id',id);
  fail(error);
}
export async function restoreApplication(id:number):Promise<void> { await setStatus(id,'Active'); }
export async function listDeadlines(applicationId?:number):Promise<Deadline[]> {
  const { client }=await requireCloud();
  let request=client.from('da_deadlines').select('*').order('due_date',{ascending:true});
  if(applicationId!==undefined)request=request.eq('application_id',applicationId);
  const {data,error}=await request; fail(error);
  return (data ?? []) as Deadline[];
}
export async function addDeadline(applicationId:number,title:string,dueDate:string):Promise<void> {
  const { client,userId }=await requireCloud();
  const {error}=await client.from('da_deadlines').insert({owner_id:userId,application_id:applicationId,title:title.trim(),due_date:dueDate});
  fail(error);
}
export async function toggleDeadline(id:number,completed:boolean):Promise<void> {
  const {client}=await requireCloud();
  const {error}=await client.from('da_deadlines').update({completed:completed ? 1 : 0}).eq('id',id);
  fail(error);
}
export async function deleteDeadline(id:number):Promise<void> {
  const {client}=await requireCloud();
  const {error}=await client.from('da_deadlines').delete().eq('id',id);
  fail(error);
}
export async function listEvents(applicationId:number):Promise<ApplicationEvent[]> {
  const {client}=await requireCloud();
  const {data,error}=await client.from('da_application_events').select('*').eq('application_id',applicationId).order('created_at',{ascending:false});
  fail(error);
  return (data ?? []) as ApplicationEvent[];
}
export async function exportCloudSnapshot() {
  const {client}=await requireCloud();
  const [applications,deadlines,events]=await Promise.all([
    client.from('da_applications').select('*'),
    client.from('da_deadlines').select('*'),
    client.from('da_application_events').select('*'),
  ]);
  for(const r of [applications,deadlines,events])fail(r.error);
  return {version:2,exportedAt:new Date().toISOString(),applications:applications.data,deadlines:deadlines.data,events:events.data};
}
export { exportCloudSnapshot as exportSnapshot };

function stableSourceId() {
  const key='da-tracker-original-device-id';
  let value=localStorage.getItem(key);
  if(!value){value=crypto.randomUUID();localStorage.setItem(key,value);}
  return value;
}

export async function inspectLocalImport():Promise<{applications:number;deadlines:number;events:number}> {
  const snapshot=await exportSnapshot();
  return {applications:snapshot.applications.length,deadlines:snapshot.deadlines.length,events:snapshot.events.length};
}

/** Explicit user-invoked import. Repeating it uses the same source ID and legacy IDs,
 * so data already imported is not duplicated. Cloud changes are never overwritten. */
export async function importLocalData():Promise<{applications:number;deadlines:number;events:number}> {
  const snapshot=await exportSnapshot();
  const {client,userId}=await requireCloud();
  const source=stableSourceId();
  const result={applications:0,deadlines:0,events:0};
  for(const application of snapshot.applications) {
    const { data:existing,error:lookupError }=await client.from('da_applications')
      .select('id').eq('source_device',source).eq('legacy_id',application.id).maybeSingle();
    fail(lookupError);
    let cloudId=existing?.id as number | undefined;
    if(!cloudId) {
      const payload=clean({
        owner_id:userId,source_device:source,legacy_id:application.id,
        company:application.company,programme:application.programme,location:application.location,
        url:application.url,priority:application.priority,stage:application.stage,
        status:application.status,date_added:application.date_added,
        date_applied:application.date_applied,application_deadline:application.application_deadline,
        notes:application.notes,created_at:application.created_at,updated_at:application.updated_at,
      });
      const {data,error}=await client.from('da_applications').insert(payload).select('id').single();
      fail(error);
      cloudId=Number(data!.id);
      result.applications++;
    }
    for(const deadline of snapshot.deadlines.filter(d=>d.application_id===application.id)){
      const {data,error:lookupError}=await client.from('da_deadlines').select('id')
        .eq('source_device',source).eq('legacy_id',deadline.id).maybeSingle();
      fail(lookupError);
      if(data)continue;
      const {error}=await client.from('da_deadlines').insert({
        owner_id:userId,application_id:cloudId,source_device:source,legacy_id:deadline.id,
        title:deadline.title,due_date:deadline.due_date,completed:deadline.completed,
        created_at:deadline.created_at,
      });
      fail(error);
      result.deadlines++;
    }
    for(const event of snapshot.events.filter(e=>e.application_id===application.id)){
      const {data,error:lookupError}=await client.from('da_application_events').select('id')
        .eq('source_device',source).eq('legacy_id',event.id).maybeSingle();
      fail(lookupError);
      if(data)continue;
      const {error}=await client.from('da_application_events').insert({
        owner_id:userId,application_id:cloudId,source_device:source,legacy_id:event.id,
        type:event.type,from_stage:event.from_stage,to_stage:event.to_stage,
        note:event.note,created_at:event.created_at,
      });
      fail(error);
      result.events++;
    }
  }
  return result;
}
