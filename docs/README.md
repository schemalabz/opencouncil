# Documentation

## System Understanding

Start here to build a mental model of how OpenCouncil works.

- **[infrastructure.md](./infrastructure.md)** — Deployment topology: which branch deploys where, how environments and databases connect, known limitations. Includes a visual diagram of the full system.
- **[task-architecture.md](./task-architecture.md)** — How the async task system works: the callback flow between this app and the opencouncil-tasks server, task lifecycle, handler registry pattern, and how to add new task types.
- **[pricing-system.md](./pricing-system.md)** — Centralized pricing configuration, calculation logic, and immutability guarantees.

## Local Development

How to get the app running on your machine.

- **[../README.md](../README.md)** — Quick start: prerequisites, Docker setup, manual setup
- **[nix-usage.md](./nix-usage.md)** — Nix/flakes dev environment with process-compose TUI, local DB modes (Nix, Docker, remote, external), mobile preview
- **[docker-usage.md](./docker-usage.md)** — Docker-based setup, multi-instance support, port allocation for worktrees
- **[environment-variables.md](./environment-variables.md)** — Complete reference for all environment variables, organized by category, with the `@t3-oss/env-nextjs` validation pattern
- **[database-seeding.md](./database-seeding.md)** — How seed data is generated and consumed, entity dependency ordering, test user setup

## Feature Guides

Deep dives into specific features — architecture, data flow, and implementation details.

- **[guides/meeting-lifecycle.md](./guides/meeting-lifecycle.md)** — The complete meeting pipeline from agenda PDF to searchable, summarized page. Processing stages, status tracking, and the task orchestration behind it.
- **[guides/editing-interface.md](./guides/editing-interface.md)** — Transcript editing mode: lifecycle, keyboard shortcuts, speaker management, timestamp adjustment
- **[guides/consultations.md](./guides/consultations.md)** — Public consultation feature: regulation viewer, comments, geo-editor, JSON schema
- **[guides/meeting-highlights.md](./guides/meeting-highlights.md)** — Video highlight generation: multi-page flow, video formats (16:9, 9:16), rendering
- **[guides/qr-campaigns.md](./guides/qr-campaigns.md)** — QR code redirect system with UTM tracking and analytics

## Operations & Infrastructure

Procedures for working with the deployed environments.

- **[guides/database-access.md](./guides/database-access.md)** — Database roles (readonly, readandwrite), copying production data with `scripts/copy_db.sh`, connecting locally to remote databases
- **[guides/preview-deployments.md](./guides/preview-deployments.md)** — Automated per-PR preview environments: GitHub Actions flow, NixOS droplet, port mapping, Caddy config
- **[guides/cachix-setup.md](./guides/cachix-setup.md)** — Nix binary cache configuration for preview deployment builds
- **[admin-alerts.md](./admin-alerts.md)** — Discord webhook setup for system event notifications
- **[google-calendar-setup.md](./google-calendar-setup.md)** — OAuth 2.0 setup for Google Calendar integration

## Design & Frontend

Visual identity and component library.

- **[style.md](./style.md)** — Brand identity, color system, party colors, animation patterns (Framer Motion), text styling conventions
- **[ui-components-guide.md](./ui-components-guide.md)** — UI primitives from `src/components/ui/`: Card, Table, Button, Input, Select, Dialog, Toast, Sidebar

## Meta

- **[guides/framework.md](./guides/framework.md)** — Template for writing feature documentation: defines the expected structure (concept, overview, sequence diagrams, business rules)
