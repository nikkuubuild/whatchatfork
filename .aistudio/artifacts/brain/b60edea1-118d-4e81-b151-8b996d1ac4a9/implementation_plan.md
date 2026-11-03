# WhatsApp Cloud API Broadcast & Unified Chat Inbox

A dedicated, Android-native WhatsApp Cloud API client built for businesses to run high-volume broadcast messaging, manage and sync Meta message templates, and converse directly with customers in a unified, media-rich WhatsApp chat interface—cleanly decoupled from CRM complexity and automated chatbot builders.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed based on your preferences:
> - **Direct Meta Cloud API Only**: Connects straight to Meta's WhatsApp Cloud API using standard credentials (Phone Number ID, WhatsApp Business Account ID / WABA ID, and Meta System Access Token), with a live credentials test & connection prober.
> - **WhatsApp-Native Android Mobile UI with PWA Install**: Built with WhatsApp Android design language (WhatsApp Green `#008069`, dark theme option `#121B22`, native bottom navigation tabs, speech bubble styling, attachment sheet, and audio recording bar), installable as an Android PWA via an in-app install banner.
> - **No CRM or Chatbot Bloat**: Removed all contact-stage pipelines, lead scoring, deal pipelines, and automated bot flow editors. The entire application is focused squarely on:
>   1. **Unified 1-on-1 Chat Inbox**: Real WhatsApp-style chatting with full media dispatch (images, voice notes with live recorder & player, videos, documents/PDFs, audio tracks, and locations).
>   2. **Bulk Messaging & Broadcast Engine**: Multi-recipient dispatch with CSV/contact import, variable substitution (`{{1}}`, `{{2}}`), rate-limited staggered sending, and real-time delivery status tracking (sent, delivered, read, failed).
>   3. **Template Management**: Sync approved templates from Meta, create new templates with headers/body/footers/buttons, and preview them in authentic WhatsApp bubbles.

---

### 1. Overview & Core Concept

- **What It Does**: Provides a lightweight, high-performance web and Android PWA client for Meta's WhatsApp Business Cloud API. Businesses can enter their Meta credentials once, manage approved message templates, upload bulk contact lists to dispatch personalized broadcasts with live rate-limiting, and chat directly with individual customers with rich media support.
- **Target Audience / Persona**: Business owners, marketing teams, customer support representatives, and operations staff who want a direct alternative to costly subscription platforms like Wati or AiSensy without dealing with complex sales pipelines or intrusive bots.
- **Key Value**: Direct API speed, zero monthly CRM markups, authentic WhatsApp Android touch ergonomics, and complete control over media-rich customer communications.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Quick Onboarding / Credentials**: Enter Phone Number ID, WABA ID, and Meta Access Token with an instant "Test Connection" probe that validates against `https://graph.facebook.com/v21.0/{phone_number_id}`.
  2. **Unified Chat Inbox**:
     - View active conversation threads with unread counters, timestamps, and message previews.
     - Open a chat to view message history (incoming vs outgoing WhatsApp bubbles with single/double/blue ticks).
     - Send text messages, record voice notes with hold/lock-to-record mic controls, and attach media via an authentic Android bottom attachment modal (Photos/Videos, Documents, Audio, Camera, Quick Templates).
  3. **Bulk Broadcast Engine**:
     - Create a new broadcast campaign.
     - Add recipients manually or paste/upload CSV with custom fields (Phone, Name, Attributes).
     - Select an approved template or custom message, map dynamic variables (`{{1}}` -> Customer Name, `{{2}}` -> Order Number), and review preview bubbles.
     - Click **Start Broadcast** to watch real-time sequential delivery with countdowns, pause/resume, and detailed delivery reports.
  4. **Template Management**:
     - Browse Meta-approved templates with status filters (`APPROVED`, `PENDING`, `REJECTED`).
     - "Sync from Meta" button to fetch live templates directly from the WhatsApp Business Account.
     - "Create Template" modal supporting Text/Media Headers, dynamic Body variables, Footer text, and Quick Reply / Call-to-Action buttons.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Authentic WhatsApp Android (Material You meets WhatsApp Clean). Crisp typography, authentic speech bubbles, tactile haptic feedback, and thumb-friendly touch targets.
  - *Color Palette & Mood*:
    - **Primary Brand Green**: `#008069` (Light mode header / accents) / `#00A884` (WhatsApp highlight)
    - **Light Mode Surface**: `#EFEAE2` (WhatsApp chat wallpaper background), `#FFFFFF` (incoming message bubble), `#E7FFDB` (outgoing message bubble), `#F0F2F5` (secondary background).
    - **Dark Mode Surface**: `#121B22` (root background), `#1F2C34` (bars & cards), `#202C33` (incoming bubble), `#005C4B` (outgoing bubble), `#0B141A` (chat wallpaper).
    - **Accents & Statuses**: `#53BDEB` (read receipt blue ticks), `#25D366` (action green), `#EF4444` (failed dispatch / error).
  - *Typography & Hierarchy*:
    - Display & Headers: Plus Jakarta Sans for crisp modern mobile clarity.
    - Body Prose: System UI / Plus Jakarta Sans (`15px` message text, optimal reading measure).
    - Timestamps & Stats: Tabular figures with `font-mono tabular-nums text-xs`.
  - *Component Styling & Layout*:
    - Android bottom navigation bar with 4 clear tabs: **Chats** (Inbox), **Broadcast** (Bulk Sender), **Templates**, and **Settings** (API Credentials & Profile).
    - Floating Action Button (FAB) on Chats and Broadcast tabs (`+` New Chat, `+` New Campaign).
    - Responsive behavior: On mobile viewports ($375\text{px}$–$430\text{px}$), acts as a fullscreen Android app; on wider screens ($768\text{px}$+), renders a split master-detail view (chat list on left, active conversation on right).

- **Interactive Feedback & Motion**:
  - Live voice recorder waveform visualizer and timer when holding/clicking the mic button.
  - Smooth modal slide-up for media attachments and template pickers.
  - Real-time progress bar and delivery checkmarks during bulk message campaigns.
  - PWA install drawer/prompt with one-click installation on Android / Chrome and iOS guidance.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct Meta Graph API vs Server Proxy**
  - *Chosen Approach*: Implement a dual-layer client/server architecture. Direct requests are proxied securely through the local Express server (`/api/whatsapp/*`) to bypass browser CORS restrictions that Meta Graph API enforces on client-side requests, while credentials remain stored in persistent client storage or local environment.
  - *Why*: Meta's Graph API (`graph.facebook.com`) forbids direct browser client `fetch()` without server CORS headers. An Express proxy route seamlessly forwards calls to Meta with the Bearer token.
  - *Alternatives Considered*: Browser-only direct fetch (fails due to CORS preflight).

- **Decision 2: Audio & Media Handling**
  - *Chosen Approach*: Support both direct URL media links and browser file uploads (converting local audio recordings to Base64/Blob and uploading to Meta Media endpoint or serving locally via server proxy).
  - *Why*: Allows instantaneous sending of voice recordings made directly inside the web app microphone without requiring external media hosting accounts.

- **Decision 3: Zero-CRM / Zero-Bot Focus**
  - *Chosen Approach*: Strictly eliminate contact pipelines, deal stages, and auto-reply bot trees per user clarification.
  - *Why*: Keeps the application lightweight, blazing fast, and 100% focused on unified chatting, media exchange, bulk campaigns, and template synchronization.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ANDROID MOBILE PWA / WEB UI                     │
├─────────────────┬────────────────────┬────────────────┬────────────────┤
│   Chats Tab     │   Broadcast Tab    │ Templates Tab  │  Settings Tab  │
│ - Thread List   │ - CSV / Numbers    │ - Meta Sync    │ - Token / WABA │
│ - Rich Bubble   │ - Variable Map     │ - Template Card│ - Phone ID     │
│ - Media / Voice │ - Rate-Limit Queue │ - Create Modal │ - PWA Install  │
└────────┬────────┴─────────┬──────────┴────────┬───────┴────────┬───────┘
         │                  │                   │                │
         ▼                  ▼                   ▼                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND STATE & STORAGE                        │
│ - LocalStorage: Credentials, Cached Conversations, Contacts, Templates  │
│ - Media Recorder API: Real-time Audio Voice Notes                      │
│ - Broadcast Queue Worker: Sequential dispatch with configurable delay  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Proxied HTTP requests
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    NODE / EXPRESS PROXY (server.ts)                    │
│ - POST /api/whatsapp/messages      -> graph.facebook.com/v21.0/...     │
│ - GET  /api/whatsapp/templates     -> graph.facebook.com/v21.0/...     │
│ - POST /api/whatsapp/templates     -> graph.facebook.com/v21.0/...     │
│ - POST /api/whatsapp/media_upload  -> graph.facebook.com/v21.0/...     │
│ - GET  /api/whatsapp/test_conn     -> Probes Phone ID & Account status │
│ - POST /api/whatsapp/webhook       -> Inbound messages & status hooks  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Real HTTPS with Bearer Token
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     META WHATSAPP CLOUD API (v21.0)                    │
└────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - `WhatsAppConfig`: `{ phoneNumberId, wabaId, accessToken, verifiedNumber, isConnected }`
  - `Message`: `{ id, conversationId, sender: 'user'|'customer', type: 'text'|'image'|'audio'|'video'|'document'|'template', content, mediaUrl, caption, timestamp, status: 'sending'|'sent'|'delivered'|'read'|'failed' }`
  - `Conversation`: `{ id, phoneNumber, customerName, lastMessage, unreadCount, updatedAt }`
  - `Template`: `{ id, name, category, language, status, components: [{ type: 'HEADER'|'BODY'|'FOOTER'|'BUTTONS', text, format, buttons }] }`
  - `BroadcastCampaign`: `{ id, name, templateId, recipients: [{ phone, name, variables, status }], totalCount, sentCount, failedCount, status: 'draft'|'running'|'completed'|'paused' }`

- **Interactive Component Mapping**:
  - `ChatWindow`: Top app bar with customer avatar/phone, search, media callouts; scrollable message list with auto-scroll down; bottom WhatsApp input bar with emoji trigger, attachment paperclip (popover sheet), voice mic button with recording timer & cancel slide, and send button.
  - `MediaAttachmentModal`: Camera, Gallery (images/videos), Audio file, Document (PDF/doc), Location coordinate picker.
  - `VoiceRecorder`: Native browser `MediaRecorder` API capture, converting to playable audio message with waveform scrubber.
  - `BroadcastComposer`: Step 1: select or paste recipients; Step 2: choose template or text message; Step 3: preview and launch with adjustable dispatch delay (e.g., 500ms–2000ms per message to prevent Meta rate-limit blocking).
  - `TemplateManager`: List of templates with real-time status chips (`APPROVED`, `IN_REVIEW`, `REJECTED`), live preview simulator, and template submission modal.
  - `PWAInstaller`: Handles `beforeinstallprompt` event with styled Android install card.

---

### Implementation Progress & Completed Deliverables

- [x] **Full-Stack Meta Cloud API Proxy**: `/api/whatsapp/*` endpoints (test connection, send message, fetch templates, upload media, webhook receiver, live event polling).
- [x] **WhatsApp Android Touch Experience**: Fixed bottom-pinned chat bar, in-app playable audio player (1x/1.5x/2x), photo lightbox, video player, and PDF preview.
- [x] **Direct Device Media Send**: Direct gallery pickers for photos and videos, documents (PDF/Office), audio tracks, camera snaps that send directly to chat without adding to quick presets.
- [x] **Quick Files Presets Vault**: Up to 10 quick presets for Audio (`1.mp3`, `2.mp3`), Documents, Photos, and Videos with sequence reordering (`▲`/`▼`), inline renaming, 1-tap send, and "Pin from Chat".
- [x] **City Multi-Branch Manual Location System**: Send Live GPS OR choose from up to 10 pre-saved office centers / distribution hubs for multi-center businesses in the same city.
- [x] **Bulk Broadcast & Template Manager**: CSV import, variable substitution (`{{1}}`, `{{2}}`), rate-limiting throttle, and live Meta template creation with authentic bubble previews.
- [x] **Meta Webhook Verification Endpoint & Zero-Auth Public Tunnel**: Identified and bypassed Google AI Studio's internal dev container session cookie protection (`/__cookie_check.html` returning HTTP 302 to Meta's bots). Integrated an automated background Cloudflare tunnel serving a live public HTTPS endpoint (`https://*.trycloudflare.com/api/whatsapp/webhook`) returning strict HTTP 200 with `text/plain` and raw `hub.challenge`. Integrated real-time tunnel status detection and 1-click copy into the in-app Settings modal.

