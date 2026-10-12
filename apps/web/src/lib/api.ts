import type {
  Lead,
  Campaign,
  ChatMessage,
  ChatSession,
  KnowledgeSource,
  DashboardStats,
  LeadStatus,
  CampaignStatus,
  Sequence,
} from './types';

// --- Chat ---

async function sendMessage(
  content: string,
  sessionId?: string,
  attachments?: File[]
): Promise<ChatMessage> {
  const formData = new FormData();
  formData.append('content', content);
  if (sessionId) formData.append('session_id', sessionId);
  if (attachments) {
    attachments.forEach((f) => formData.append('attachments', f));
  }
  const res = await fetch('/api/chat/message', { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Failed to send message: ${res.statusText}`);
  return res.json();
}

async function getMessages(sessionId: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/chat/messages?session_id=${sessionId}`);
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.statusText}`);
  return res.json();
}

async function getSessions(): Promise<ChatSession[]> {
  const res = await fetch('/api/chat/sessions');
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.statusText}`);
  return res.json();
}

async function createSession(title?: string): Promise<ChatSession> {
  const res = await fetch('/api/chat/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.statusText}`);
  return res.json();
}

// --- Leads ---

async function getLeads(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: LeadStatus;
  sort?: string;
  order?: 'asc' | 'desc';
}): Promise<{ data: Lead[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('page_size', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.sort) searchParams.set('sort', params.sort);
  if (params?.order) searchParams.set('order', params.order);

  const res = await fetch(`/api/leads?${searchParams}`);
  if (!res.ok) throw new Error(`Failed to fetch leads: ${res.statusText}`);
  return res.json();
}

async function getLead(id: string): Promise<Lead> {
  const res = await fetch(`/api/leads/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch lead: ${res.statusText}`);
  return res.json();
}

async function uploadLeadsCSV(file: File): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/leads/upload-csv', { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Failed to upload CSV: ${res.statusText}`);
  return res.json();
}

async function updateLeadStatus(id: string, status: LeadStatus): Promise<Lead> {
  const res = await fetch(`/api/leads/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update lead: ${res.statusText}`);
  return res.json();
}

async function deleteLead(id: string): Promise<void> {
  const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete lead: ${res.statusText}`);
}

// --- Campaigns ---

async function getCampaigns(): Promise<Campaign[]> {
  const res = await fetch('/api/campaigns');
  if (!res.ok) throw new Error(`Failed to fetch campaigns: ${res.statusText}`);
  return res.json();
}

async function getCampaign(id: string): Promise<Campaign> {
  const res = await fetch(`/api/campaigns/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch campaign: ${res.statusText}`);
  return res.json();
}

async function createCampaign(data: {
  name: string;
  description?: string;
  targetAudience?: string;
  sequence: Sequence;
}): Promise<Campaign> {
  const res = await fetch('/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create campaign: ${res.statusText}`);
  return res.json();
}

async function updateCampaignStatus(id: string, status: CampaignStatus): Promise<Campaign> {
  const res = await fetch(`/api/campaigns/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update campaign: ${res.statusText}`);
  return res.json();
}

async function deleteCampaign(id: string): Promise<void> {
  const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete campaign: ${res.statusText}`);
}

// --- Knowledge ---

async function getKnowledgeSources(): Promise<KnowledgeSource[]> {
  const res = await fetch('/api/knowledge');
  if (!res.ok) throw new Error(`Failed to fetch knowledge sources: ${res.statusText}`);
  return res.json();
}

async function uploadDocument(file: File, name?: string): Promise<KnowledgeSource> {
  const formData = new FormData();
  formData.append('file', file);
  if (name) formData.append('name', name);
  const res = await fetch('/api/knowledge/upload', { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Failed to upload document: ${res.statusText}`);
  return res.json();
}

async function addWebsite(url: string, name?: string): Promise<KnowledgeSource> {
  const res = await fetch('/api/knowledge/website', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, name }),
  });
  if (!res.ok) throw new Error(`Failed to add website: ${res.statusText}`);
  return res.json();
}

async function deleteKnowledgeSource(id: string): Promise<void> {
  const res = await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete source: ${res.statusText}`);
}

// --- Dashboard ---

async function getDashboardStats(): Promise<DashboardStats> {
  const res = await fetch('/api/dashboard/stats');
  if (!res.ok) throw new Error(`Failed to fetch dashboard stats: ${res.statusText}`);
  return res.json();
}

export const api = {
  // Chat
  sendMessage,
  getMessages,
  getSessions,
  createSession,
  // Leads
  getLeads,
  getLead,
  uploadLeadsCSV,
  updateLeadStatus,
  deleteLead,
  // Campaigns
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaignStatus,
  deleteCampaign,
  // Knowledge
  getKnowledgeSources,
  uploadDocument,
  addWebsite,
  deleteKnowledgeSource,
  // Dashboard
  getDashboardStats,
};