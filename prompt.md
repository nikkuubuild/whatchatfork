# Product Transformation: Single-Business WhatsApp Application to Multi-Tenant SaaS Platform

## 1. Project Objective

We want to transform the existing WhatsApp messaging application from a single-business solution into a fully-fledged, multi-tenant, subscription-based WhatsApp SaaS platform.

### Current Architecture
The existing application is primarily designed for a single business to:
- Connect its WhatsApp Business Account.
- Send and receive WhatsApp messages.
- Manage conversations and contacts.
- Manage message templates.
- Configure WhatsApp Cloud API credentials.
- Handle webhooks and messaging operations.

### New Product Vision

We want to turn this application into a SaaS platform where multiple businesses can independently register, subscribe to plans, connect their WhatsApp Business Accounts, and use the platform's messaging capabilities.

The platform should have:
- A public marketing website.
- Customer registration and authentication.
- Multi-tenant business workspaces.
- Subscription and billing management.
- Multiple WhatsApp onboarding methods.
- Centralized platform administration.
- Tenant-level configuration and access control.
- Usage tracking, quotas and subscription enforcement.
- Scalable WhatsApp messaging infrastructure.

Every customer must have an independent workspace, WhatsApp connection, contacts, conversations, templates, users, settings and usage records.

No customer should be able to access another customer's data.

---

## 2. WhatsApp Integration: Two Onboarding Methods

The platform must support TWO independent WhatsApp integration methods.

Both methods should be available to customers through their workspace settings, subject to the platform administrator's configuration and subscription policies.

### Method A: Bring Your Own Meta App (BYOA)

This method is intended for businesses that already have their own Meta Developer App and WhatsApp Cloud API configuration.

The customer connects WhatsApp using their own credentials.

#### Customer onboarding requirements

Provide a connection form containing:

- Meta App ID
- Meta App Secret
- Embedded Signup Configuration ID (config_id), where applicable
- WhatsApp Business Account ID (WABA ID), if required
- Phone Number ID
- Access Token or authorization credentials, depending on the supported authentication flow
- Webhook verification configuration, where applicable

Do not assume every field must be manually entered. Design the connection flow to validate credentials and retrieve available business assets wherever Meta's APIs permit.

#### Backend responsibilities

- Validate the supplied Meta credentials.
- Verify the app and associated WhatsApp permissions.
- Validate the access token.
- Retrieve authorized WABA and phone-number information.
- Establish the WhatsApp API connection.
- Configure webhook subscriptions where supported.
- Associate the connection with the authenticated tenant.
- Store credentials securely using encryption.
- Provide connection health and token status.
- Support credential updates, disconnection and reconnection.

Each tenant must have its own isolated Meta application credentials and WhatsApp connection.

The platform must never accidentally use another tenant's credentials when sending messages or processing webhooks.

### Method B: Platform-Owned Meta App — Embedded Signup

This is the preferred onboarding experience once our company has completed the necessary Meta Tech Provider/Partner setup and approvals.

Instead of requiring customers to create their own Meta Developer Apps, the platform will provide a centralized Embedded Signup experience using our shared Meta application.

#### Platform-level configuration

The Super Admin should be able to configure:

- Meta App ID
- Meta App Secret
- Embedded Signup Configuration ID
- Partner Solution ID (solutionID), if applicable to the approved integration arrangement
- Meta Business Portfolio ID
- Webhook configuration
- Graph API version
- Required permissions
- Supported onboarding features
- WhatsApp Coexistence availability
- Other provider-specific settings, where applicable

These credentials must be maintained centrally and must never be exposed to individual customers.

#### Customer onboarding journey

1. Customer registers on our SaaS website.
2. Customer verifies their account.
3. Customer selects a subscription plan.
4. Customer enters their workspace.
5. Customer navigates to WhatsApp Integrations.
6. Customer selects Connect WhatsApp.
7. Our application launches Meta Embedded Signup using the platform's shared Meta App ID and Configuration ID.
8. Customer authenticates through Meta.
9. Customer selects or creates their Business Portfolio.
10. Customer selects or creates their WhatsApp Business Account.
11. Customer selects or registers their phone number.
12. Customer completes the applicable verification and authorization process.
13. Meta returns the authorization result and business asset identifiers.
14. Our backend securely completes the OAuth exchange and required onboarding operations.
15. The WhatsApp connection is saved against the customer's tenant.
16. The customer is redirected to their WhatsApp dashboard.

#### Embedded Signup event handling

Implement proper handling of the Embedded Signup session events.

The frontend must capture the relevant business asset identifiers returned through the session event, including:

- WABA ID
- Phone Number ID
- Business Portfolio ID, where returned
- Other relevant asset identifiers supported by the selected signup flow

The OAuth login callback and Embedded Signup session event must be handled independently and correlated securely.

Do not assume that the authorization code and business asset identifiers are returned through the same mechanism.

The frontend should send the necessary authorization data to the backend using a secure, authenticated onboarding session.

#### Backend completion

The backend must:

- Validate the onboarding session and its association with the logged-in tenant.
- Exchange the authorization code using the platform's App ID and App Secret.
- Obtain the appropriate customer authorization token.
- Validate the returned WABA and Phone Number IDs.
- Retrieve authorized phone-number information.
- Register the phone number where required.
- Subscribe the platform application to the customer's WABA.
- Configure webhook subscriptions and callback overrides where supported.
- Retrieve relevant business and phone-number metadata.
- Synchronize WhatsApp message templates.
- Store the resulting connection against the correct tenant.
- Record onboarding status and errors.
- Provide a clear success or failure response.

The resulting relationship should resemble:

| Tenant | Meta App | Authorization | WABA | Phone |
|---|---|---|---|---|
| Business A | Platform App | Business A Token | WABA A | Number A |
| Business B | Platform App | Business B Token | WABA B | Number B |
| Business C | Platform App | Business C Token | WABA C | Number C |

The platform uses one shared Meta application, but every business has its own authorized WhatsApp assets and connection records.

---

## 3. WhatsApp Coexistence Support

WhatsApp Coexistence must be treated as a separate onboarding capability, not merely another configuration field.

The objective is to allow eligible businesses to connect their existing WhatsApp Business App number to the WhatsApp Business Platform while retaining the supported Business App functionality.

### Requirements

- Support Meta's eligible Coexistence onboarding flow.
- Identify whether the customer is eligible for Coexistence.
- Display the appropriate signup experience.
- Handle relevant Embedded Signup session events.
- Capture and process the identifiers and information returned by Meta.
- Complete any required business and phone-number setup.
- Handle applicable history synchronization and webhook events.
- Support the coexistence-specific messaging requirements.
- Display the connection type in the customer dashboard.
- Provide appropriate setup instructions and error messages.

The implementation must follow Meta's currently supported Coexistence APIs, permissions, eligibility rules and onboarding requirements.

Do not assume that standard Cloud API registration and Coexistence onboarding are interchangeable.

The architecture must support these connection types independently:

1. Standard WhatsApp Cloud API.
2. WhatsApp Business App Coexistence.

---

## 4. Subscription-Based SaaS Business Model

The platform will operate on a subscription-based model.

Customers must subscribe to a plan to access the platform's paid features.

### Subscription management

Implement:

- Free trial, if enabled.
- Monthly subscriptions.
- Annual subscriptions.
- Plan upgrades.
- Plan downgrades.
- Subscription renewals.
- Cancellation.
- Expiry management.
- Grace periods.
- Payment failure handling.
- Invoice generation.
- Payment history.
- Subscription status tracking.

The payment integration should be configurable and support suitable payment providers for our target markets.

### Subscription plans

The Super Admin must be able to create and manage subscription plans without requiring code changes.

Each plan should support configurable limits and features, such as:

| Feature | Example configuration |
|---|---|
| WhatsApp Accounts | 1, 3, 10 or unlimited |
| Team Members | 2, 5, 20 or unlimited |
| Monthly Messages | Configurable quota |
| Contacts | Configurable limit |
| Campaigns | Enabled/Disabled |
| Bulk Messaging | Enabled/Disabled |
| Automation | Enabled/Disabled |
| Chatbot | Enabled/Disabled |
| API Access | Enabled/Disabled |
| Webhook Access | Enabled/Disabled |
| Analytics | Basic/Advanced |
| WhatsApp Coexistence | Enabled/Disabled |
| Multiple Workspaces | Enabled/Disabled |
| Support | Standard/Priority |

These are examples, not fixed commercial commitments. All limits must be configurable.

### Usage-based billing

The architecture should also support usage-based billing in addition to fixed subscription fees.

Track:

- Messages sent.
- Messages received.
- Meta conversation or messaging charges where applicable.
- Campaign usage.
- API calls.
- Automation executions.
- Active WhatsApp phone numbers.
- Storage consumption.

Keep Meta's actual WhatsApp billing separate from our SaaS subscription billing.

Do not treat Meta's WhatsApp charges as equivalent to our platform subscription charges.

---

## 5. Public Website and Customer Acquisition

The application must include a professional SaaS marketing website.

### Public website pages

- Home
- Features
- Solutions
- Pricing
- WhatsApp Integration
- WhatsApp Coexistence
- Documentation
- About Us
- Contact Us
- Login
- Register

### Homepage positioning

Position the product as a WhatsApp Business Communication and Automation SaaS platform.

Highlight:

- Centralized WhatsApp inbox.
- Multiple WhatsApp numbers.
- Team collaboration.
- Automated messaging.
- Campaign management.
- Chatbots and workflows.
- Contact management.
- Analytics and reporting.
- Official WhatsApp Cloud API integration.
- Easy Meta Embedded Signup.
- WhatsApp Business App Coexistence, where eligible.

Include clear calls to action:

- Start Free Trial.
- View Pricing.
- Connect WhatsApp.
- Login to Dashboard.

The website must clearly explain the difference between connecting through a customer's own Meta App and connecting through our platform's shared Meta App.

---

## 6. Multi-Tenant Architecture

This is one of the most critical architectural changes.

The application must become a true multi-tenant SaaS system.

### Tenant model

Each registered business should have:

- Unique tenant ID.
- Business profile.
- Workspace.
- Subscription.
- Users and roles.
- WhatsApp integrations.
- Contacts.
- Conversations.
- Message history.
- Templates.
- Campaigns.
- Automations.
- API configurations.
- Usage records.
- Billing records.

### Data isolation

Implement strict tenant-level data isolation across the entire application.

Every tenant-owned record must be associated with the appropriate tenant ID.

Enforce tenant scoping at the backend service and database layers, not merely through frontend visibility restrictions.

Ensure:

- No cross-tenant data access.
- No cross-tenant message delivery.
- No cross-tenant webhook processing.
- No cross-tenant credential access.
- No cross-tenant analytics leakage.
- No cross-tenant API access.

Use secure role-based access control.

### User roles

Support:

- Super Admin
- Tenant Owner
- Tenant Admin
- Manager
- Agent
- Custom roles, if feasible

A tenant owner should be able to invite team members and manage workspace permissions according to their subscription.

---

## 7. Super Admin Panel

Create a centralized administration panel for operating the SaaS business.

### Platform administration

- View all registered businesses.
- View active and inactive tenants.
- Manage tenant accounts.
- Activate, suspend or deactivate tenants.
- View subscriptions.
- Create and edit plans.
- Manage pricing.
- Configure trials.
- Manage invoices and payments.
- Monitor platform usage.
- Manage Meta integration credentials.
- Configure Embedded Signup.
- Configure Partner Solution ID, where applicable.
- Enable or disable Coexistence.
- Configure platform webhooks.
- Monitor WhatsApp API connections.
- View integration failures.
- Manage platform-level announcements.
- View audit logs.

The Super Admin must have a separate permission scope from tenant administrators.

---

## 8. Tenant Dashboard

Each customer should receive an independent dashboard.

### Dashboard sections

1. Overview
2. Inbox
3. Contacts
4. WhatsApp Accounts
5. Campaigns
6. Templates
7. Automation
8. Chatbots
9. Team Members
10. Analytics
11. API & Webhooks
12. Subscription & Billing
13. Settings

### WhatsApp connection management

The customer should be able to:

- View connected WhatsApp numbers.
- See which onboarding method was used.
- View WABA ID and Phone Number ID.
- View connection health.
- See whether Coexistence is enabled.
- Reconnect an expired or disconnected integration.
- Add another WhatsApp account, subject to plan limits.
- Disconnect a WhatsApp account.
- View integration errors.

Sensitive credentials must never be displayed in plaintext.

---

## 9. Webhook and Messaging Architecture

Since multiple businesses will connect through the same platform, webhook processing must be redesigned for multi-tenancy.

### Requirements

- Centralized webhook infrastructure.
- Verify Meta webhook subscriptions.
- Identify the relevant WABA or Phone Number ID from incoming events.
- Resolve the correct tenant and WhatsApp connection.
- Process inbound messages against the correct tenant.
- Process delivery, read and failure status updates.
- Handle template and account-related events where applicable.
- Support retries and idempotency.
- Maintain webhook event logs.
- Handle duplicate events safely.
- Support asynchronous processing through queues.
- Prevent one tenant's webhook events from being processed in another tenant's context.

The webhook architecture must support both BYOA and platform-owned Meta App connections.

---

## 10. Security and Compliance

Security must be treated as a foundational requirement.

Implement:

- Encrypted storage of Meta App Secrets and access tokens.
- Secure OAuth state validation.
- Tenant-level authorization.
- CSRF protection.
- Rate limiting.
- API authentication.
- Secure webhook verification.
- Audit logging.
- Role-based access control.
- Input validation.
- Secure session handling.
- Protection against credential leakage.
- Subscription entitlement enforcement.
- Secure disconnection and token revocation workflows where supported.

Never expose the platform's Meta App Secret, customer access tokens or other sensitive credentials to the frontend.

---

## 11. Technical and Integration Requirements

Before implementing the transformation, inspect the existing repository and identify the current architecture.

Pay particular attention to the existing WhatsApp integration:

- WhatsApp onboarding settings.
- Embedded Signup frontend.
- OAuth callback.
- WhatsAppConnectApiService.
- Token exchange.
- WABA subscription.
- Phone number registration.
- Webhook implementation.
- Message sending and receiving.
- Template synchronization.
- Existing vendor/business models.
- Authentication and authorization.
- Database structure.

Preserve existing working functionality wherever possible.

Do not unnecessarily rewrite stable messaging functionality.

Instead, refactor the existing single-business/vendor architecture into a tenant-aware SaaS architecture.

### Meta integration considerations

Keep the following concepts separate in the implementation:

| Component | Purpose |
|---|---|
| Meta App ID | Identifies the application |
| Meta App Secret | Authenticates backend OAuth operations |
| Configuration ID | Identifies Embedded Signup configuration |
| Partner Solution ID | Identifies an accepted partner solution, where applicable |
| Business Portfolio ID | Identifies a Meta business portfolio |
| WABA ID | Identifies the customer's WhatsApp Business Account |
| Phone Number ID | Identifies the customer's WhatsApp API phone number |
| Access Token | Authorizes API operations on granted assets |

Do not assume that a Partner Solution ID is mandatory for every direct Tech Provider integration.

Implement provider-specific onboarding only where the actual Meta/provider arrangement requires it.

The application must support a direct Meta Cloud API integration and leave room for future Solution Partner integrations without coupling the core messaging engine to a single provider.

---

## 12. Implementation Strategy

Work in controlled phases.

### Phase 1: Existing System Audit
- Inspect the repository.
- Document the existing architecture.
- Identify single-business assumptions.
- Map the WhatsApp integration lifecycle.
- Identify database dependencies.
- Identify potential breaking changes.

### Phase 2: SaaS Foundation
- Introduce tenant architecture.
- Implement tenant-aware authentication.
- Create workspace management.
- Implement tenant-level permissions.
- Add audit logging.
- Establish strict data isolation.

### Phase 3: WhatsApp Integration Refactoring
- Refactor BYOA integration.
- Implement centralized Meta configuration.
- Implement shared-app Embedded Signup.
- Handle OAuth and session events.
- Implement tenant-specific asset mapping.
- Implement Coexistence onboarding.
- Update webhook routing.

### Phase 4: Subscription and Billing
- Implement subscription plans.
- Implement billing infrastructure.
- Add payment integration.
- Implement usage tracking.
- Enforce subscription limits.

### Phase 5: SaaS User Experience
- Build public marketing website.
- Build registration and onboarding.
- Build customer dashboard.
- Build Super Admin dashboard.
- Build integration settings.

### Phase 6: Testing and Production Readiness
- Test tenant isolation.
- Test both onboarding methods.
- Test multiple WABAs and phone numbers.
- Test Coexistence eligibility and onboarding.
- Test webhook routing.
- Test subscription enforcement.
- Test security.
- Test failure recovery.
- Prepare production deployment.

---

## 13. Important Development Instructions

Follow these rules throughout implementation:

1. Do not assume the existing application is already multi-tenant.
2. Do not break the existing WhatsApp messaging functionality.
3. Do not mix platform-level Meta credentials with customer-owned credentials.
4. Do not expose sensitive credentials.
5. Do not hardcode subscription plans or limits.
6. Do not assume all customers use the same onboarding method.
7. Do not assume every customer is eligible for Coexistence.
8. Do not assume Partner Solution ID alone completes provider onboarding.
9. Do not mix Meta messaging charges with SaaS subscription revenue.
10. Do not implement frontend-only tenant isolation.
11. Do not claim an integration is functional without testing the complete flow.
12. Do not invent Meta API capabilities or unsupported parameters.
13. Verify current Meta documentation before implementing Embedded Signup, Coexistence and partner-specific functionality.
14. Preserve backward compatibility wherever practical.
15. Implement one task at a time and document architectural decisions.

## 14. Expected Final Product

The final product should operate as a commercial WhatsApp SaaS platform.

A business should be able to:

1. Visit our website.
2. Register an account.
3. Choose a subscription plan.
4. Create its workspace.
5. Connect WhatsApp using either its own Meta App credentials or our platform's Embedded Signup.
6. Complete standard WhatsApp onboarding or eligible Coexistence onboarding.
7. Manage conversations.
8. Send and receive messages.
9. Manage contacts and templates.
10. Create campaigns and automations.
11. Invite team members.
12. Monitor usage and analytics.
13. Manage its subscription and payments.

Meanwhile, our company should be able to manage all customers, subscriptions, integrations and platform operations through a centralized Super Admin panel.

**The architectural objective is to build a scalable, secure, multi-tenant WhatsApp SaaS platform rather than simply adding a subscription system to the existing single-business application.**