import { create } from 'zustand';
import type {
  ChatMessage,
  ChatSession,
  Lead,
  Campaign,
  KnowledgeSource,
  DashboardStats,
} from './types';

// --- Chat Store ---

interface ChatState {
  messages: ChatMessage[];
  sessions: ChatSession[];
  activeSessionId: string | null;
  isStreaming: boolean;
  inputValue: string;

  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  setSessions: (sessions: ChatSession[]) => void;
  setActiveSession: (id: string | null) => void;
  setIsStreaming: (streaming: boolean) => void;
  setInputValue: (value: string) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessions: [],
  activeSessionId: null,
  isStreaming: false,
  inputValue: '',

  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set({ messages: [...get().messages, message] }),
  updateLastMessage: (content) =>
    set((state) => {
      const msgs = [...state.messages];
      if (msgs.length > 0) {
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
      }
      return { messages: msgs };
    }),
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setInputValue: (value) => set({ inputValue: value }),
  clearMessages: () => set({ messages: [] }),
}));

// --- Leads Store ---

interface LeadsState {
  leads: Lead[];
  totalLeads: number;
  isLoading: boolean;
  search: string;
  statusFilter: string | null;
  page: number;

  setLeads: (leads: Lead[], total: number) => void;
  addLead: (lead: Lead) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  removeLead: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setSearch: (search: string) => void;
  setStatusFilter: (status: string | null) => void;
  setPage: (page: number) => void;
}

export const useLeadsStore = create<LeadsState>((set) => ({
  leads: [],
  totalLeads: 0,
  isLoading: false,
  search: '',
  statusFilter: null,
  page: 1,

  setLeads: (leads, total) => set({ leads, totalLeads: total }),
  addLead: (lead) => set((s) => ({ leads: [...s.leads, lead] })),
  updateLead: (id, updates) =>
    set((s) => ({
      leads: s.leads.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    })),
  removeLead: (id) =>
    set((s) => ({ leads: s.leads.filter((l) => l.id !== id) })),
  setLoading: (loading) => set({ isLoading: loading }),
  setSearch: (search) => set({ search }),
  setStatusFilter: (status) => set({ statusFilter: status }),
  setPage: (page) => set({ page }),
}));

// --- Campaigns Store ---

interface CampaignsState {
  campaigns: Campaign[];
  isLoading: boolean;

  setCampaigns: (campaigns: Campaign[]) => void;
  addCampaign: (campaign: Campaign) => void;
  updateCampaign: (id: string, updates: Partial<Campaign>) => void;
  removeCampaign: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useCampaignsStore = create<CampaignsState>((set) => ({
  campaigns: [],
  isLoading: false,

  setCampaigns: (campaigns) => set({ campaigns }),
  addCampaign: (campaign) =>
    set((s) => ({ campaigns: [...s.campaigns, campaign] })),
  updateCampaign: (id, updates) =>
    set((s) => ({
      campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
  removeCampaign: (id) =>
    set((s) => ({ campaigns: s.campaigns.filter((c) => c.id !== id) })),
  setLoading: (loading) => set({ isLoading: loading }),
}));

// --- Knowledge Store ---

interface KnowledgeState {
  sources: KnowledgeSource[];
  isLoading: boolean;

  setSources: (sources: KnowledgeSource[]) => void;
  addSource: (source: KnowledgeSource) => void;
  updateKnowledgeSource: (id: string, updates: Partial<KnowledgeSource>) => void;
  removeSource: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useKnowledgeStore = create<KnowledgeState>((set) => ({
  sources: [],
  isLoading: false,

  setSources: (sources) => set({ sources }),
  addSource: (source) => set((s) => ({ sources: [...s.sources, source] })),
  updateKnowledgeSource: (id, updates) =>
    set((s) => ({
      sources: s.sources.map((src) =>
        src.id === id ? { ...src, ...updates } : src
      ),
    })),
  removeSource: (id) =>
    set((s) => ({ sources: s.sources.filter((src) => src.id !== id) })),
  setLoading: (loading) => set({ isLoading: loading }),
}));

// --- Dashboard Store ---

interface DashboardState {
  stats: DashboardStats | null;
  isLoading: boolean;

  setStats: (stats: DashboardStats) => void;
  setLoading: (loading: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  stats: null,
  isLoading: false,

  setStats: (stats) => set({ stats }),
  setLoading: (loading) => set({ isLoading: loading }),
}));

// --- UI Store ---

interface UIState {
  sidebarOpen: boolean;
  theme: 'dark' | 'light';

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  theme: 'dark',

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setTheme: (theme) => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
    set({ theme });
  },
}));