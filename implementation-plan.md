# Implementation Plan

## Phase 1: Project Setup

- [x] Initialize monorepo structure (`/client`, `/server`)
- [x] Set up Express server with TypeScript
- [x] Set up React app with TypeScript
- [ ] Set up PostgreSQL database

## Phase 2: Authentication

- [x] Create login page
- [x] Implement login API endpoint
- [x] Implement session-based authentication middleware
- [x] Implement logout API endpoint
- [x] Add route protection on the frontend (redirect to login if unauthenticated)

## Phase 3: User Management

- [ ] Create user management page (admin only)
- [x] Implement create agent API endpoint
- [x] Implement list users API endpoint
- [x] Implement edit user API endpoint
- [x] Implement delete user API endpoint
- [ ] Add role-based access control (admin vs agent)

## Phase 4: Ticket CRUD

- [x] Implement create ticket API endpoint
- [x] Implement list tickets API endpoint (with filtering by status and category, sorting)
- [x] Implement get ticket API endpoint
- [x] Implement update ticket API endpoint (change status, assign agent)
- [x] Create ticket list page with filtering and sorting
- [x] Create ticket detail page

## Phase 5: AI Features

- [ ] Set up Claude API integration
- [x] Implement auto-classification endpoint (categorize incoming tickets)
- [x] Implement AI summary endpoint (generate ticket summary)
- [ ] Implement AI suggested reply endpoint
- [x] Build knowledge base structure and seed with initial content
- [x] Auto-resolve new tickets from the knowledge base (NEW → PROCESSING → RESOLVED or OPEN; PROCESSING hidden from the list)
- [ ] Integrate AI features into ticket detail page UI

## Phase 6: Email Integration

- [x] Set up email provider (AgentMail)
- [x] Implement inbound email webhook to create tickets
- [x] Implement outbound email sending when an agent replies
- [x] Handle email threading (replies linked to existing tickets)

## Phase 7: Dashboard

- [x] Create dashboard page with ticket overview stats (total, open, resolved by AI, AI %, average resolution time)
- [x] Add tickets-per-day bar chart (last 30 days)
- [ ] Add tickets by category breakdown
- [ ] Add recent tickets list
- [ ] Add quick filters to navigate to filtered ticket list

## Phase 8: Polish & Deployment

- [ ] Add input validation and error handling across all endpoints
- [ ] Add loading states and error states on the frontend
- [ ] Write Dockerfile for server and client
- [ ] Set up Docker Compose for local development
- [ ] Write deployment configuration
