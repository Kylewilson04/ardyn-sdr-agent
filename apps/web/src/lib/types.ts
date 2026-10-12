// --- Chat & Messages ---

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  leadId?: string;
  campaignId?: string;
  action?: 'email_sent' | 'reply_received' | 'sequence_started' | 'lead_enriched';
  status?: 'success' | 'error' | 'pending';
  artifacts?: Artifact[];
}

export interface Artifact {
  type: 'email' | 'report' | 'lead_card' | 'chart';
  title: string;
  data: Record<string, unknown>;
}

// --- Leads ---

export interface Lead {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  title?: string;
  company: string;
  industry?: string;
  companySize?: string;
  linkedinUrl?: string;
  website?: string;
  status: LeadStatus;
  score: number;
  source?: string;
  tags: string[];
  enrichedData?: Record<string, unknown>;
  lastContactedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type LeadStatus =
  | 'new'
  | 'researching'
  | 'contacted'
  | 'replied'
  | 'interested'
  | 'not_interested'
  | 'bounced'
  | 'unsubscribed';

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  researching: 'Researching',
  contacted: 'Contacted',
  replied: 'Replied',
  interested: 'Interested',
  not_interested: 'Not Interested',
  bounced: 'Bounced',
  unsubscribed: 'Unsubscribed',
};

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'bg-blue-500/20 text-blue-400',
  researching: 'bg-purple-500/20 text-purple-400',
  contacted: 'bg-amber-500/20 text-amber-400',
  replied: 'bg-cyan-500/20 text-cyan-400',
  interested: 'bg-green-500/20 text-green-400',
  not_interested: 'bg-red-500/20 text-red-400',
  bounced: 'bg-red-500/20 text-red-400',
  unsubscribed: 'bg-gray-500/20 text-gray-400',
};

// --- Campaigns ---

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  targetAudience?: string;
  sequence: Sequence;
  stats: CampaignStats;
  leads: string[];
  createdAt: string;
  updatedAt: string;
}

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
};

export interface Sequence {
  steps: SequenceStep[];
}

export interface SequenceStep {
  id: string;
  order: number;
  type: 'email' | 'linkedin' | 'call' | 'wait';
  delayDays: number;
  config: SequenceStepConfig;
}

export interface SequenceStepConfig {
  subject?: string;
  template?: string;
  variablize?: boolean;
  aiPersonalize?: boolean;
  linkedinMessage?: string;
  callScript?: string;
}

export interface CampaignStats {
  leadsCount: number;
  contacted: number;
  replied: number;
  interested: number;
  bounced: number;
  unsubscribed: number;
}

// --- Knowledge Base ---

export interface KnowledgeSource {
  id: string;
  type: 'document' | 'website' | 'text' | 'api';
  name: string;
  description?: string;
  url?: string;
  fileName?: string;
  fileSize?: number;
  status: 'processing' | 'ready' | 'error';
  chunks: number;
  createdAt: string;
}

// --- Dashboard ---

export interface DashboardStats {
  totalLeads: number;
  activeCampaigns: number;
  emailsSent: number;
  replyRate: number;
  interestedRate: number;
  pipelineValue: number;
  leadsByStatus: Array<{ status: LeadStatus; count: number }>;
  dailyActivity: Array<{ date: string; emails: number; replies: number }>;
  topPerformingCampaigns: Array<{ name: string; replyRate: number; interested: number }>;
}

// --- API ---

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface CSVUploadResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// --- Chat-specific ---

export interface ChatSession {
  id: string;
  title: string;
  lastMessage?: string;
  updatedAt: string;
  messageCount: number;
}