export type Priority = 'High' | 'Medium' | 'Normal';

export type ApplicationStage = string;

export type ApplicationStatus = 'Active' | 'Rejected' | 'Withdrawn' | 'Closed' | 'Archived';

export interface Application {
  id: number;
  company: string;
  programme: string;
  location: string | null;
  url: string | null;
  priority: Priority;
  stage: ApplicationStage;
  status: ApplicationStatus;
  date_added: string;
  date_applied: string | null;
  application_deadline: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Deadline {
  id: number;
  application_id: number;
  title: string;
  due_date: string;
  completed: number;
  created_at: string;
}

export interface ApplicationEvent {
  id: number;
  application_id: number;
  type: string;
  from_stage: ApplicationStage | null;
  to_stage: ApplicationStage | null;
  note: string | null;
  created_at: string;
}

export interface ApplicationInput {
  company: string;
  programme: string;
  location?: string;
  url?: string;
  priority: Priority;
  stage: ApplicationStage;
  application_deadline?: string;
  notes?: string;
}

export const STAGES: ApplicationStage[] = [
  'Not yet applied',
  'Preparing application',
  'Application submitted',
  'Online assessment',
  'Awaiting next stage',
  'Video interview',
  'Telephone interview',
  'Assessment centre',
  'Final interview',
  'Offer',
  'Accepted',
];

export const PIPELINE_GROUPS = [
  { label: 'To apply', stages: ['Not yet applied', 'Preparing application'] as ApplicationStage[] },
  { label: 'Applied', stages: ['Application submitted'] as ApplicationStage[] },
  { label: 'Assessment', stages: ['Online assessment'] as ApplicationStage[] },
  { label: 'Waiting', stages: ['Awaiting next stage'] as ApplicationStage[] },
  { label: 'Interview', stages: ['Video interview', 'Telephone interview', 'Assessment centre', 'Final interview'] as ApplicationStage[] },
  { label: 'Offer', stages: ['Offer', 'Accepted'] as ApplicationStage[] },
];
