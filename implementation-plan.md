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
- [ ] Implement edit user API endpoint
- [ ] Implement delete user API endpoint
- [ ] Add role-based access control (admin vs agent)

## Phase 4: Ticket CRUD

- [ ] Implement create ticket API endpoint
- [ ] Implement list tickets API endpoint (with filtering by status and category, sorting)
- [ ] Implement get ticket API endpoint
- [ ] Implement update ticket API endpoint (change status, assign agent)
- [ ] Create ticket list page with filtering and sorting
- [ ] Create ticket detail page

## Phase 5: AI Features

- [ ] Set up Claude API integration
- [ ] Implement auto-classification endpoint (categorize incoming tickets)
- [ ] Implement AI summary endpoint (generate ticket summary)
- [ ] Implement AI suggested reply endpoint
- [ ] Build knowledge base structure and seed with initial content
- [ ] Integrate AI features into ticket detail page UI

## Phase 6: Email Integration

- [ ] Set up email provider (SendGrid/Mailgun)
- [ ] Implement inbound email webhook to create tickets
- [ ] Implement outbound email sending when an agent replies
- [ ] Handle email threading (replies linked to existing tickets)

## Phase 7: Dashboard

- [ ] Create dashboard page with ticket overview stats (open, resolved, closed counts)
- [ ] Add tickets by category breakdown
- [ ] Add recent tickets list
- [ ] Add quick filters to navigate to filtered ticket list

## Phase 8: Polish & Deployment

- [ ] Add input validation and error handling across all endpoints
- [ ] Add loading states and error states on the frontend
- [ ] Write Dockerfile for server and client
- [ ] Set up Docker Compose for local development
- [ ] Write deployment configuration
