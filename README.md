# Ardyn SDR Agent

**Open-source AI sales development representative.** Multi-agent outbound sales automation built on LangGraph. Research, personalize, and engage leads across email, voice, and LinkedIn — with genuine AI-driven research, not template-fill.

Status: **v0.1.0** — Ready for development deployment.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Next.js Web App                    │
│  Chat-first UX · Dashboard · Leads · Campaigns · KB  │
└────────────────────────┬─────────────────────────────┘
                         │ REST + WebSocket
┌────────────────────────▼─────────────────────────────┐
│                 FastAPI Backend                       │
│  Routes · Services · Auth · Webhooks · pgvector      │
└────┬──────────────────────────────────┬──────────────┘
     │                                  │
     ▼                                  ▼
┌─────────────┐   ┌────────────────────────────────────┐
│  Agent Core │   │         Email Engine               │
│  LangGraph  │   │  Postal SMTP · BullMQ · Sequences  │
│  Supervisor │   │  Reply Classifier · Domain Rotator  │
│      │      │   └────────────────────────────────────┘
│      ▼      │
│  ┌───────┐  │   ┌────────────────────────────────────┐
│  │Resrchr│  │   │         Voice Widget               │
│  ├───────┤  │   │  Preact · LiveKit · Deepgram        │
│  │Positn │  │   │  Embeddable · 32KB gzipped          │
│  ├───────┤  │   └────────────────────────────────────┘
│  │Email  │  │
│  │Writer │  │   ┌────────────────────────────────────┐
│  ├───────┤  │   │        Data Layer                   │
│  │LinkedIn│  │   │  pgvector · Nango CRM · Airbyte    │
│  └───────┘  │   └────────────────────────────────────┘
└─────────────┘
```

### Supervisor → Agent Flow

```
SUPERVISOR AGENT
    │
    ├── Researcher Agent + web search
    │   → Company research, persona identification, trigger events
    │
    ├── Positioning Report Agent
    │   → Value prop → pain point mapping, objection handling
    │
    ├── Email Writer Agent
    │   → Personalized cold outreach (not templates — genuine research-driven)
    │
    └── LinkedIn Writer Agent
        → Multi-step sequence: connect → engage → pitch

All agents use an injected LLM interface. Default configuration targets open-weight models
(via Ollama / vLLM / Groq) but any LangChain-compatible provider works.
The system includes adapters for OpenAI, Anthropic, and open-weight backends.
```

---

## Quick Start

### Prerequisites
- Node.js 22+, Python 3.12+, Docker
- LLM backend — any of: Ollama (open-weight), vLLM, Groq, OpenAI, or Anthropic

### Development

```bash
# Clone
git clone git@github.com:KyleWilson04/ardyn-sdr-agent.git
cd ardyn-sdr-agent

# Environment
cp .env.example .env
# Fill in API keys

# Infrastructure
docker compose -f docker/docker-compose.yml up -d postgres redis

# Install dependencies
npm install          # root + workspaces
cd apps/api && pip install -r requirements.txt && cd ../..

# Run migrations
cd apps/api && alembic upgrade head && cd ../..

# Start development servers
npm run dev          # Turbo — runs all apps + packages
```

### Production (GCP)

```bash
cd infra/terraform
terraform init
terraform apply
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Agent Framework** | LangGraph (TypeScript) |
| **LLMs** | Configurable — any LangChain-compatible provider. Default: open-weight via Ollama. OpenAI/Anthropic adapters included. |
| **Backend** | FastAPI (Python 3.12), SQLAlchemy async, pgvector |
| **Frontend** | Next.js 14, React 18, Tailwind CSS |
| **Database** | PostgreSQL 16 + pgvector |
| **Queue** | Redis + BullMQ |
| **SMTP** | Postal (self-hosted) |
| **Voice** | Preact widget, LiveKit, Deepgram STT/TTS |
| **Observability** | LangFuse |
| **CRM Sync** | Nango.dev (Salesforce, HubSpot, Pipedrive) |
| **Infrastructure** | Docker Compose + Terraform (GCP Cloud Run, Cloud SQL, Memorystore) |

---

## Project Structure

```
ardyn-sdr-agent/
├── apps/
│   ├── api/                  # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py       # App factory, CORS, middleware
│   │   │   ├── config.py     # Pydantic Settings
│   │   │   ├── database.py   # Async SQLAlchemy + pgvector
│   │   │   ├── models/       # SQLAlchemy ORM models
│   │   │   ├── schemas/      # Pydantic request/response schemas
│   │   │   ├── services/     # Agent, email, vector, CRM services
│   │   │   └── routes/       # REST endpoints
│   │   ├── alembic/          # Database migrations
│   │   └── Dockerfile
│   └── web/                  # Next.js frontend
│       └── src/
│           ├── app/          # Pages (chat, dashboard, leads, campaigns, KB)
│           ├── components/   # Chat, leads, campaigns, sidebar
│           └── lib/          # API client, store, types, utils
├── packages/
│   ├── agent-core/           # LangGraph multi-agent
│   │   └── src/
│   │       ├── graph.ts      # StateGraph definition + supervisor routing
│   │       ├── state.ts      # TypeScript Zod schemas
│   │       ├── agents/       # 4 specialized sub-agents
│   │       ├── tools/        # Web search provider
│   │       └── __tests__/    # 7 test files
│   ├── email-engine/         # Postal SMTP + sequence engine
│   │   └── src/
│   │       ├── smtp-client.ts
│   │       ├── sequence-engine.ts
│   │       └── types.ts
│   ├── voice-widget/         # Preact embeddable voice widget
│   │   └── src/
│   │       ├── widget.tsx     # Entry: mount/unmount, auto-attach
│   │       ├── types.ts       # Zod-validated config
│   │       ├── pipeline/      # LiveKit + Deepgram + pipecat
│   │       ├── hooks/         # Voice agent state machine, audio capture
│   │       └── components/    # Button, panel, visualizer, typing indicator
│   └── data-pipeline/        # Data connectors
├── docker/
│   ├── docker-compose.yml    # Full stack: PG, Redis, Postal, RabbitMQ, LangFuse
│   └── postgres/init.sql     # Extensions + tuning
├── infra/
│   └── terraform/main.tf     # GCP: Cloud Run, Cloud SQL, Memorystore
├── .env.example
├── package.json
└── turbo.json
```

---

## API Endpoints

### Leads
- `GET /api/leads` — List, filter, search
- `POST /api/leads` — Create
- `POST /api/leads/upload` — CSV bulk import
- `GET /api/leads/search` — Semantic + hybrid search
- `PATCH /api/leads/{id}/status` — Update status

### Campaigns
- `GET /api/campaigns` — List
- `POST /api/campaigns` — Create with sequences
- `POST /api/campaigns/{id}/run` — Execute campaign
- `POST /api/campaigns/{id}/pause` — Pause
- `POST /api/campaigns/{id}/resume` — Resume

### Agents
- `POST /api/agents/research` — Research a company/person
- `POST /api/agents/generate-email` — Generate personalized email
- `POST /api/agents/classify-reply` — Classify inbound reply
- `GET /api/agents/health` — Agent health check

### Knowledge Base
- `GET /api/knowledge` — List documents
- `POST /api/knowledge/upload` — Upload document
- `POST /api/knowledge/url` — Import URL
- `GET /api/knowledge/search` — Semantic search

### Webhooks
- `POST /api/webhooks/postal/inbound` — Postal inbound email
- `POST /api/webhooks/postal/bounce` — Bounce handling
- `POST /api/webhooks/crm/sync` — CRM data sync

---

## Voice Widget

Embed with a single line:

```html
<div data-ardyn-voice-widget
     data-api-key="sk_xxx"
     data-company-name="Ardyn"
     data-theme="light"></div>
<script src="https://cdn.example.com/ardyn-voice-widget.iife.js"></script>
```

Or programmatically:

```ts
import { mount } from '@ardyn-sdr/voice-widget';
mount('#container', { apiKey: 'sk_xxx', companyName: 'Ardyn' });
```

Features: mic input, real-time transcription, AI speech, interrupt capability, text fallback, dark/light themes, 32KB gzipped.

---

## License

MIT — See [LICENSE](LICENSE).

---

Built by [Ardyn Intelligence](https://ardyn.ai).