# SDD Section Guide

This reference provides detailed guidance for generating each section of the Solution Design Document.
Use this alongside the BRD content and the **application type / technology stack** to produce accurate, comprehensive SDD content.

This guide supports **all application types**: Agentic AI, GenAI, Web Applications, Mobile Apps, Microservices/APIs, Data Pipelines, Enterprise Platforms, Infrastructure/DevOps, and any other stack.

Each section specifies **which diagram(s) to embed** and where. See `diagram_guide.md` for rendering code.

---

## Section 1: Introduction

**Purpose:** Set the business context and explain the motivation for the solution.

**What to include:**
- Brief description of the business domain (e.g., "The IT Support Operating Model...", "The Finance Operations team...")
- The core pillars, workflows, or problem areas this solution addresses (typically 2–4)
- A statement of how these areas currently involve manual effort and the pain this creates
- A closing sentence on how the proposed solution addresses these gaps through AI

**Template structure:**
> "[Business domain description]. It is built on [N] core pillars/areas:
> - [Area 1]: [Description of what currently happens manually]
> - [Area 2]: [Description]
> Together, these [areas] enable [outcome] — while maintaining [quality/compliance standard]."

**Diagrams:** None in this section.

---

## Section 2: Project Scope

**Purpose:** Define what exactly is being built, automated, or enhanced, with sub-sections per functional area.

**Structure:**
- One `H2` sub-section per major functional area (2.1, 2.2, etc.)
- Each sub-section includes: what it covers, its objectives (as bullet list), and sub-sub-sections (H3) per workflow

**For Agentic AI:** Each scope area maps to one or more Crews.
**For GenAI:** Each scope area maps to a specific LLM-powered feature or pipeline.
**For Web / Mobile / API:** Each scope area maps to a feature module or user-facing capability.
**For Data Pipeline:** Each scope area maps to a pipeline stage or data domain.
**For Enterprise Platform:** Each scope area maps to a business process or customisation area.
**For Infrastructure / DevOps:** Each scope area maps to an environment, pipeline stage, or automation domain.

**Key items per scope area:**
- What triggers this workflow (scheduler, user action, API call, event, deployment trigger)
- What the system receives as input
- What decisions or actions it takes
- What downstream systems it updates

### 📊 Diagram: Workflow / Process Flow Diagram

**Place after the introductory paragraph of Section 2, before the sub-sections.**

**What to show:**
- The end-to-end process steps derived from the BRD use cases, in order
- Decision points (e.g., "Approved?", "Acknowledged?") as diamond shapes
- Start and end nodes
- Arrows showing flow direction

**How to build it:**
- Extract all major process steps from the BRD use cases in sequence
- Map each step to a box; map each decision to a diamond
- Use vertical or left-to-right layout depending on number of steps
- Colour code: process boxes = `#2E75B6`, decision diamonds = `#7030A0`, start/end = `#1F3864`
- See `diagram_guide.md` → "Workflow / Process Flow Diagram" for rendering code

**Caption:** `Figure 1: End-to-End Process Flow — [Project Name]`

---

## Section 3: System Overview

**Purpose:** Give a high-level picture of the entire solution.

**What to include:**
- The core technology: "The proposed solution is built on [technology stack] to [automate/enable/deliver]..."
- List of external integrations (e.g., ServiceNow, GitHub, AWS, PostgreSQL, internal APIs, third-party services)
- The three categories of benefit the system delivers (e.g., faster resolution, improved compliance, enhanced visibility)
- A statement on the overall capability: event-driven / user-driven / AI-driven / data-driven

**Tone:** Think of this as an executive summary for someone who won't read the technical details.

### 📊 Diagram 1: System Architecture Diagram

**Place after the introductory paragraph of Section 3.**

**What to show:**
- All major system components and their relationships
- Grouping: use dashed boundary boxes to group related components by layer or domain (e.g., "Frontend Layer", "Backend Layer", "AI Layer", "Data Layer", "Integration Layer", "User Layer")
- Connections between components with labelled arrows (e.g., "REST API", "SQL queries", "WebSocket", "Message Queue", "gRPC")
- User/actor entry points

**How to build it — adapt layers to the tech stack:**
- **Web App**: User → Frontend (React/Angular) → Backend API (Node/Django/Spring) → Database → External Services
- **Mobile App**: User → Mobile Client (iOS/Android) → API Gateway → Backend Services → Database
- **Microservices**: Client → API Gateway → [Service A, Service B, Service C] → Shared DB / Message Broker → External APIs
- **Data Pipeline**: Source Systems → Ingestion Layer → Processing/Transform Layer → Storage Layer → Consumption Layer
- **Agentic AI**: Users → Application → AI Platform (CrewAI/LangGraph) → Data Layer → External Integrations
- **GenAI**: Users → Application → LLM API → Vector Store → Knowledge Base → External APIs
- **Enterprise Platform**: Users → Platform UI → Custom Logic Layer → Integration Middleware → Backend Systems
- **Infrastructure**: Developers → CI/CD Pipeline → Container Registry → Cloud Platform (VPC/Subnets/Compute) → Monitoring

Use colour coding: primary components = `#1F3864`, application/service layer = `#2E75B6`, database/storage = `#ED7D31`, external systems = `#70AD47`, users/actors = `#C9A84C`

**Caption:** `Figure 2: System Architecture — [Project Name]`

### 📊 Diagram 2: Data Flow Diagram (DFD)

**Place after the System Architecture Diagram.**

**What to show:**
- All actors (users/roles) as external entities (rectangles)
- The system / processes as circles or rounded rectangles
- Data stores (databases) as open-ended rectangles
- Labelled arrows showing what data flows where (e.g., "PIP Form Data", "Employee Record", "Approval Decision", "Email Notification")

**How to build it:**
- Identify all actors from the BRD (e.g., Supervisor, ER SPOC, Employee)
- Identify all data inputs and outputs per actor
- Identify all data stores (tables from Section 5)
- Map the flows: Actor → System (input data), System → Actor (output/notification), System → Data Store (persistence), System → External System (integration call)
- See `diagram_guide.md` → "Data Flow Diagram" for rendering code

**Caption:** `Figure 3: Data Flow Diagram — [Project Name]`

---

## Section 4: Design Constraints

**Purpose:** Document assumptions, dependencies, and governing guidelines.

**Sub-section: Assumptions & Dependencies**
- Data quality assumption: "The system assumes that all required data inputs are accurately maintained across..."
- API/integration dependencies: list key APIs, tokens, credentials required
- Infrastructure dependencies: stable connectivity, scheduled job reliability
- Data dependencies: historical data availability for embeddings/RAG

**Sub-section: Goals & Guidelines**
Standard guidelines to always include:
- **Data Security**: Encryption of sensitive fields (e.g., AES-256-GCM), compliance with org standards
- **Reliability**: High availability, fault tolerance
- **Scalability**: Support for increasing volumes, extensible to additional use cases
- **Auditability**: Complete traceability through centralized logging and database persistence
- **Human Oversight**: Human-in-the-loop for complex or ambiguous scenarios

**Diagrams:** None in this section.

---

## Section 5: Database Design

**Purpose:** Document the data model for the solution.

**Format:** One table per logical domain:
| Table Name | Columns (Name + Type) | Description |
|---|---|---|

**Guidelines by application type:**
- **Agentic AI**: Tables store processed records (ticket data, agent decisions, audit logs) + knowledge base tables (with embeddings for vector search)
- **GenAI**: Tables store conversation history, feedback, retrieval cache, usage logs, embeddings
- **Web / Mobile App**: Tables store user accounts, sessions, domain entities (orders, products, bookings, etc.), audit logs
- **Microservices / API**: Each service owns its own schema; document the primary tables per service
- **Data Pipeline**: Tables store raw ingestion records, transformed/curated data, job run metadata, data quality logs
- **Enterprise Platform**: Document custom objects, junction tables, configuration tables, and integration staging tables
- **Infrastructure / DevOps**: Document state tables (Terraform state), pipeline run logs, deployment history, secret rotation logs

**Always include:**
- A `created_on` or `timestamp` column in every table
- Note sensitive fields (PII, credentials) as encrypted
- If BRD doesn't specify tables, create plausible ones based on the use case and tech stack

### 📊 Diagram: Entity-Relationship (ER) Diagram

**Place after all schema tables, at the end of Section 5.**
**Condition:** Include only if the BRD implies 3 or more data entities with relationships.

**What to show:**
- Each database table as a box with its name
- Primary key (PK) and foreign key (FK) fields listed inside each box
- Relationship lines between tables with cardinality labels (1, N, 1..N)

**How to build it:**
- Use the tables defined in Section 5 as the entities
- Draw FK relationships as connecting lines
- Label each relationship (e.g., "pip_requests 1 — N pip_reviews")
- Use a grid layout to avoid overlapping lines
- See `diagram_guide.md` → "Entity-Relationship Diagram" for rendering code

**Caption:** `Figure 4: Entity-Relationship Diagram — [Project Name] Data Model`

---

## Section 6: Hardware and Software Detailed Design

**Purpose:** Document the technology stack, frameworks, and deployment platform for the solution.

**Always include a technology stack table** with columns: `Component | Technology / Platform | Notes`

**Adapt the stack rows to the actual technology described in the BRD:**

### Web Application
- Frontend: React / Angular / Vue / Next.js + CSS framework
- Backend: Node.js (Express) / Python (Django/FastAPI) / Java (Spring Boot) / C# (ASP.NET Core) / PHP (Laravel) / Ruby (Rails)
- Database: PostgreSQL / MySQL / MongoDB / Redis (cache)
- Authentication: OAuth 2.0 / JWT / Auth0 / Keycloak
- Hosting: AWS (EC2/ECS/Lambda) / Azure App Service / GCP Cloud Run / Vercel / Heroku

### Mobile Application
- Platform: iOS (Swift/SwiftUI) / Android (Kotlin/Jetpack Compose) / Cross-platform (React Native / Flutter)
- Backend API: REST / GraphQL
- Local Storage: SQLite / Realm / Core Data
- Push Notifications: FCM / APNs
- CI/CD: Fastlane / Bitrise / GitHub Actions

### Microservices / API
- Language: Python / Java / Go / Node.js / C# / Rust
- Framework: FastAPI / Spring Boot / Gin / Express / ASP.NET Core
- Communication: REST / gRPC / GraphQL / Message Queue (RabbitMQ / Kafka)
- Service Mesh: Istio / Linkerd (if applicable)
- Container: Docker + Kubernetes / AWS ECS

### Data Pipeline / ETL
- Orchestration: Apache Airflow / Prefect / Dagster / Azure Data Factory
- Processing: Apache Spark / dbt / Pandas / Flink / Beam
- Streaming: Apache Kafka / AWS Kinesis / Azure Event Hubs
- Storage: Data Warehouse (Snowflake / BigQuery / Redshift) + Data Lake (S3 / ADLS)
- Quality: Great Expectations / dbt tests / custom validators

### Agentic AI
- Framework: CrewAI Enterprise / LangGraph / AutoGen / Semantic Kernel
- Backend: Python
- Database: PostgreSQL
- LLM API: OpenAI / Azure OpenAI / Anthropic / Google Vertex AI
- Deployment: AWS ECS / Azure Container Apps

### GenAI
- LLM: GPT-4o / Claude / Gemini / Llama (specify provider and version)
- Embedding Model: text-embedding-3-large / ada-002 / etc.
- Vector Store: pgvector / Pinecone / Weaviate / ChromaDB / Qdrant
- Framework: LangChain / LlamaIndex / custom
- Backend: Python

### Enterprise Platform
- Platform: Salesforce / ServiceNow / SAP / SharePoint / Microsoft 365
- Customisation: Apex / Flow / ABAP / Power Automate / SPFx
- Integration: MuleSoft / Azure Integration Services / Dell Boomi / custom REST adapters
- Authentication: Platform-native SSO / Azure AD

### Infrastructure / DevOps
- IaC: Terraform / Pulumi / AWS CDK / Bicep
- Container Orchestration: Kubernetes (EKS / AKS / GKE) / Docker Swarm
- CI/CD: GitHub Actions / GitLab CI / Jenkins / Azure DevOps / CircleCI
- Monitoring: Prometheus + Grafana / Datadog / New Relic / CloudWatch
- Secret Management: HashiCorp Vault / AWS Secrets Manager / Azure Key Vault

### 📊 Diagram: Deployment Architecture Diagram

**Place after the technology stack table in Section 6.**
**Condition:** Include if the BRD mentions cloud, containers, or infrastructure deployment.

**What to show:**
- Cloud provider boundary (e.g., AWS, Azure)
- Compute layer: containers / VMs running the application and agents
- Data layer: managed database service
- Networking: load balancer, VPC/subnet boundaries
- External integrations outside the cloud boundary
- Security layer: secrets manager, IAM roles

**How to build it:**
- Use nested rectangles to represent cloud regions, VPCs, and subnets
- Place compute components inside the cloud boundary
- Place external systems (HR System, Email, Document Management) outside
- Use dashed lines for network boundaries, solid lines for data/API connections
- See `diagram_guide.md` → "Deployment Architecture Diagram" for rendering code

**Caption:** `Figure 5: Deployment Architecture — [Project Name]`

---

## Section 7: Detailed System Design

**Purpose:** Deep-dive into how each use case is implemented.

**Structure:**
1. Opening paragraph noting that sequence diagrams are embedded below for each use case
2. **Swimlane Diagram** (overall, covering all actors across all use cases)
3. One H2 sub-section per use case: "[Use Case Name] — Sequence Flow"
   - Narrative description of the sequence
   - **Sequence Flow Diagram** for that specific use case

### 📊 Diagram 1: Swimlane Diagram (Overall)

**Place at the start of Section 7, before the per-use-case sub-sections.**
**Condition:** Include if the BRD has 2 or more distinct actor roles.

**What to show:**
- One horizontal lane per actor/role (e.g., Supervisor, ER SPOC, Employee, System/AI Platform)
- Process steps placed in the lane of the actor responsible for that step
- Arrows crossing lanes to show handoffs between actors
- Decision points in the System lane

**How to build it:**
- Extract all actors from the BRD
- Map each process step to its responsible actor
- Draw lanes as horizontal bands with actor labels on the left
- Place step boxes inside the correct lane; draw crossing arrows for handoffs
- See `diagram_guide.md` → "Swimlane Diagram" for rendering code

**Caption:** `Figure 6: Swimlane Diagram — [Project Name] Overall Workflow`

### 📊 Diagram 2: Sequence Flow Diagram (per use case)

**Place immediately after the narrative description of each use case sub-section.**

**What to show:**
- Participants (actors + system components) as vertical lifelines at the top
- Numbered messages/calls as horizontal arrows between lifelines
- Return messages as dashed arrows
- Decision/loop blocks as labelled rectangles spanning relevant lifelines

**How to build it:**
- Extract the flow steps from the BRD use case table (Flow, Alternate Flow, Exceptions)
- Map each step to a message between two participants
- Number messages sequentially
- See `diagram_guide.md` → "Sequence Flow Diagram" for rendering code

**Caption:** `Figure 7.[N]: Sequence Flow — [Use Case Name]`

---

## Section 8: Use Case Details

**Purpose:** Structured detail for each use case.

**Per use case, include:**

**Execution Model:**
| Property | Value |
|---|---|
| Trigger Type | Scheduler-based / Event-driven / API-triggered / User-initiated / Deployment-triggered |
| Execution Frequency | e.g., Every 20 minutes / Real-time / On-demand / On push to main |
| Input Source | e.g., User form, API request, Message queue, File upload, Database event |
| Downstream Systems | e.g., Database, Email, External API, Message queue, Dashboard |
| Process Type | Sequential / Parallel / Hierarchical / Streaming |

**Component Responsibilities** (adapt label to tech stack):
- **Agentic AI**: `[Agent Name]` — what this agent does, what tool(s) it uses, what data it reads/writes
- **GenAI**: Pipeline stages — Input processing → Retrieval → LLM call → Output formatting → Persistence
- **Web / Mobile**: `[Component / Service Name]` — what this module handles, what APIs it calls, what state it manages
- **Microservices**: `[Service Name]` — endpoints it exposes, services it calls, data it owns
- **Data Pipeline**: `[Job / Stage Name]` — input dataset, transformation logic, output dataset, SLA
- **Enterprise Platform**: `[Module / Automation Name]` — trigger, logic, affected records, downstream actions
- **Infrastructure**: `[Pipeline Stage / IaC Module]` — what it provisions/deploys, inputs, outputs, dependencies

**Diagrams:** None in this section (diagrams are in Section 7).

---

---

## Section 9: Type-Specific Design Section

**Purpose:** Deep-dive into the design details specific to the application type. Choose the correct variant below based on the tech stack identified in Step 0.

---

### Section 9A: Crew Details (Agentic AI)

**Format:** One table per Crew:
| Crew Name | Agent Name | Task Details | Tool |
|---|---|---|---|

- Tool names: PascalCase and descriptive (e.g., `FetchIncidentTicketTool`, `UpdateRITMStatusTool`)
- If an agent uses no external tool: write "Not Applicable"
- Every agent in Section 8 must appear here

**Diagram:** Agent Interaction Diagram — see `diagram_guide.md`
**Caption:** `Figure 8: Agent Interaction Diagram — [Project Name] Crew Architecture`

---

### Section 9B: AI Model & Prompt Design (GenAI)

1. **Model Selection** — LLM, provider, version, rationale
2. **Prompt Engineering Strategy** — system prompt, few-shot, chain-of-thought, output parsing
3. **RAG Architecture** (if applicable) — embedding model, vector store, chunking, retrieval strategy
4. **Context Management** — token budget, conversation history strategy
5. **API Integration** — endpoint/SDK, rate limiting, retry, fallback model

**Diagram:** RAG Pipeline Diagram (if RAG is used) — see `diagram_guide.md`

---

### Section 9C: Component & Module Design (Web Application)

1. **Frontend Architecture**
   - Component tree / page hierarchy
   - State management approach (Redux, Zustand, Context API, NgRx, Pinia, etc.)
   - Routing structure (public vs. protected routes)
   - Key UI components and their responsibilities

2. **Backend Architecture**
   - Service/controller breakdown (list each service/controller, its responsibility, and the endpoints it owns)
   - Middleware chain (auth, validation, logging, error handling)
   - Background jobs / scheduled tasks

3. **API Contract Summary**
   | Endpoint | Method | Request Body | Response | Auth Required |
   |---|---|---|---|---|

4. **Integration Points**
   - Third-party APIs and SDKs used
   - Webhook handlers (inbound/outbound)

---

### Section 9D: Screen & Module Design (Mobile Application)

1. **Screen Inventory**
   | Screen Name | Purpose | Navigation Entry Points | Key Actions |
   |---|---|---|---|

2. **Navigation Flow** — describe the navigation graph (tab bar, stack navigator, drawer, deep links)

3. **Platform-Specific Modules**
   - iOS: Swift/SwiftUI modules, Core Data, Keychain, APNs
   - Android: Kotlin/Compose modules, Room, DataStore, FCM
   - Cross-platform: shared vs. platform-specific code split

4. **Offline Strategy** — what data is cached locally, sync strategy, conflict resolution

5. **Push Notification Design** — notification types, payload structure, handling logic

---

### Section 9E: Service & API Design (Microservices / API)

1. **Service Catalogue**
   | Service Name | Responsibility | Technology | Port / Base Path | Owns DB Schema |
   |---|---|---|---|---|

2. **API Endpoint Definitions** (per service)
   | Endpoint | Method | Request Schema | Response Schema | Auth | Rate Limit |
   |---|---|---|---|---|---|

3. **Inter-Service Communication**
   - Synchronous: REST / gRPC calls — list caller → callee relationships
   - Asynchronous: Message queue topics/queues — list producer → consumer relationships

4. **Service Mesh / Gateway** — API gateway routing rules, load balancing, circuit breaker config

---

### Section 9F: Pipeline & Job Design (Data Pipeline / ETL)

1. **Job / Stage Definitions**
   | Job Name | Trigger | Input Dataset | Transformation Logic | Output Dataset | SLA / Max Runtime |
   |---|---|---|---|---|---|

2. **Data Quality Checks** — validation rules applied at each stage, failure handling

3. **Scheduling Strategy** — cron expressions, dependency graph between jobs, retry policy

4. **Error Handling & Alerting** — dead-letter queues, failure notifications, manual reprocessing steps

5. **Data Lineage Summary** — source → transform → destination mapping for key data entities

---

### Section 9G: Customisation & Extension Design (Enterprise Platform)

1. **Custom Objects / Fields**
   | Object / Field Name | Type | Purpose | Validation Rules |
   |---|---|---|---|

2. **Workflow / Automation Rules**
   | Automation Name | Trigger | Conditions | Actions | Downstream Impact |
   |---|---|---|---|---|

3. **Integration Adapters**
   - Inbound: external systems pushing data into the platform
   - Outbound: platform pushing data to external systems
   - Middleware: MuleSoft flows / Azure Logic Apps / custom REST adapters

4. **Permission Sets & Profiles** — role-to-permission mapping for custom objects and features

5. **Configuration Decisions** — platform settings, feature flags, environment-specific config

---

### Section 9H: Infrastructure & Automation Design (Infrastructure / DevOps)

1. **IaC Module Breakdown**
   | Module Name | Provider | Resources Provisioned | Inputs | Outputs |
   |---|---|---|---|---|

2. **CI/CD Pipeline Stage Definitions**
   | Stage | Trigger | Steps | Artefacts Produced | Gate / Approval |
   |---|---|---|---|---|

3. **Environment Topology**
   | Environment | Purpose | Cloud Account / Subscription | Key Differences from Prod |
   |---|---|---|---|

4. **Secret Management** — where secrets are stored, rotation policy, injection method (env vars, mounted volumes, SDK)

5. **Monitoring & Alerting Design** — metrics collected, alert thresholds, on-call runbook references

---

## Section 10: Functional Requirements

**Purpose:** Numbered list of verifiable functional requirements.

**Format:**
| FR # | Requirement |
|---|---|
| FR-001 | The system shall... |

**Guidelines:**
- Write in "the system shall..." format
- Cover: data handling, business logic, user interactions, integrations, notifications, error handling, security
- Derive from the scope section — each scope bullet should map to 1–3 functional requirements
- Include at least one requirement per use case
- **Agentic AI**: include requirements about crew execution, agent coordination, tool invocation, SLA enforcement
- **GenAI**: include requirements about prompt quality, response accuracy thresholds, latency, RAG retrieval
- **Web / Mobile**: include requirements about UI behaviour, form validation, navigation, offline support
- **Microservices / API**: include requirements about endpoint contracts, error codes, rate limits, versioning
- **Data Pipeline**: include requirements about data quality thresholds, job SLAs, retry behaviour, lineage
- **Enterprise Platform**: include requirements about automation triggers, field validation, permission enforcement
- **Infrastructure**: include requirements about provisioning idempotency, rollback capability, secret rotation

**Diagrams:** None in this section.

---

## Section 11: Implementation Steps Strategy

**Purpose:** High-level roadmap for implementing the solution.

**Structure — adapt phase names and content to the tech stack:**

1. **Phase 1 – Environment & Infrastructure Setup**: Provision cloud resources, configure CI/CD, set up databases, install frameworks, configure credentials and secrets
2. **Phase 2 – Core Development**: Implement the primary application logic — agents/crews, frontend components, backend services, pipeline jobs, IaC modules, or platform customisations
3. **Phase 3 – Integration**: Connect to downstream systems, external APIs, message queues, third-party services
4. **Phase 4 – Testing**: Unit tests, integration tests, end-to-end tests, UAT, performance/load testing, security scanning
5. **Phase 5 – Deployment**: Deploy to staging, conduct smoke tests, deploy to production, configure monitoring and alerting
6. **Phase 6 – Monitoring & Optimisation**: Set up dashboards, configure alerts, review logs post-go-live, gather user feedback, plan next iteration

Adapt phase names and content based on what the BRD specifies as the delivery approach.

**Diagrams:** None in this section.

---

## Section 12: System Security and Integrity Controls

**Purpose:** Document security measures protecting the solution.

**Standard content to always include:**
- **Data Encryption at Rest**: AES-256-GCM for sensitive fields in database (description, PII); 32-byte symmetric key; unique 12-byte nonce per encryption; base64-encoded environment variable
- **Data Encryption in Transit**: TLS 1.2+ for all API communications
- **Access Control**: Role-based access; API keys and tokens stored in environment variables (never hardcoded); least-privilege principle
- **Audit Logging**: All agent actions logged with timestamps, actor (agent name), action taken, outcome; stored in centralized database
- **Human-in-the-Loop Controls**: Edge cases flagged for human review; human override capability for automated decisions
- **Data Retention**: Processed records retained per org policy; PII minimization applied
- **Compliance**: Solution adheres to organizational data governance standards

Add any domain-specific security requirements from the BRD.

**Diagrams:** None in this section.

---

## Standard Disclaimer (use verbatim)

> "ACTION REQUIRED: Notice to all users. This document is produced by generative AI and results may not be accurate or contain errors. You are required to independently review, verify and modify (as necessary) any output before proceeding. In no circumstances should results be relied on, used, or shared without manual review and validation."
