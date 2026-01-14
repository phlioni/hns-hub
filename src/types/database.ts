export type AppRole = 'admin' | 'member';

export type ProposalStatus =
  | 'new'
  | 'understanding'
  | 'construction'
  | 'cancelled'
  | 'delivered'
  | 'in_review'
  | 'awaiting_code'
  | 'awaiting_contract'
  | 'operational_start';

export type RequestPriority = 'low' | 'medium' | 'high';
export type RequestStatus = 'pending' | 'in_progress' | 'done';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Proposal {
  id: string;
  title: string;
  description: string | null;
  pre_analysis: string | null;
  pre_proposal: string | null;
  attachments: any[];
  links: { name: string; url: string }[];
  status: ProposalStatus;
  entry_date: string;
  deadline: string | null;
  delivery_date: string | null;
  project_code: string | null;
  last_justification: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Objective {
  id: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  partner_id: string | null;
  progress: number;
  deadline: string | null;
  created_at: string;
  updated_at: string;
  key_results?: KeyResult[];
}

export interface KeyResult {
  id: string;
  objective_id: string;
  title: string;
  description: string | null;
  progress: number;
  deadline: string | null;
  created_at: string;
  updated_at: string;
  initiatives?: Initiative[];
}

export interface Initiative {
  id: string;
  key_result_id: string;
  title: string;
  description: string | null;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Request {
  id: string;
  requester_name: string;
  description: string;
  assignee_id: string | null;
  priority: RequestPriority;
  status: RequestStatus;
  attachments: any[];
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  previous_status: string | null;
  new_status: string | null;
  metadata: Record<string, any>;
  created_at: string;
}