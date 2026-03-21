# Architecture Decision Records

<!--
  Log decisions here so they survive between AI sessions.
  An AI agent has no memory of yesterday. This file IS its memory.

  Format: Date | Decision | Context | Consequences
-->

## ADR-001: Use JSON-LD Deterministic Service Template

**Date:** 2026-03-20

**Decision:** Adopt the JSON-LD Deterministic Service Template as the base architecture.

**Context:** We need a service that produces deterministic, reproducible transformations on structured data. The template provides a pure kernel with spec tests, layered boundaries (kernel/composition/adapters), and zero runtime dependencies.

**Consequences:**
- All transformation logic lives in `src/kernel/transform.ts` as pure functions
- Kernel MUST NOT perform I/O, reference time, randomness, or environment state
- Infrastructure (HTTP, persistence, scheduling) lives in `src/adapters/`
- Spec tests (determinism, no-network, snapshot, purity) MUST pass before any merge

---

## ADR-002: Adopt RPM v2.1 + GDE UI Spec v2.1 as Domain Specifications

**Date:** 2026-03-20

**Decision:** Adopt RPM v2.1 (Discovery-First Architecture — Production Specification) as the engine spec and GDE UI Spec v2.1 (Query Builder for Non-Technical SMEs) as the UI spec. Both are checked into `project/` as normative sources.

**Context:** The Graph Discovery Engine requires two complementary specifications: an engine spec governing deterministic graph pattern expansion, discovery, labeling, and APIs; and a UI spec governing the SME-facing Query Builder that consumes those APIs. RPM v2.1 defines the kernel algorithms, three-tier discovery, 15 canonical tests, and the Label Override API. GDE UI Spec v2.1 defines five screens, four modals, a settings panel, design tokens, accessibility requirements, and performance budgets. Together they cover the full stack from kernel to rendered pixel.

**Consequences:**
- `project/RPM-v2.1-FINAL.md` is the normative engine reference — all kernel, discovery, and API implementation must conform to it
- `project/GDE-UI-SPEC-v2.1.md` is the normative UI reference — all frontend implementation must conform to it
- The roadmap (`project/ROADMAP.md`) phases map directly to these specs: Phases 1–4 implement RPM v2.1, Phase 5 implements GDE UI Spec v2.1
- 15 Canonical Tests (CT-01 through CT-15) are CI-blocking per RPM §33
- The SME Firewall principle (RPM §21, UI §2.1) governs all user-facing output
- Deployment targets GitHub Pages (UI) and GitHub Actions (CI/CD)

---

## ADR-003: Deploy via GitHub Pages and GitHub Actions

**Date:** 2026-03-20

**Decision:** Use GitHub Pages for UI hosting and GitHub Actions for CI/CD.

**Context:** The project needs a deployment target for the Query Builder UI and a CI pipeline for the engine. GitHub Pages provides static hosting suitable for a client-side application. GitHub Actions is already configured in the template's `.github/workflows/ci.yml` for build/test/purity checks.

**Consequences:**
- The Query Builder UI (Phase 5) must produce a static build artifact deployable to GitHub Pages
- GitHub Actions CI pipeline runs build → test → purity → CT suite on every push/PR
- A GitHub Pages deployment workflow will be added when Phase 5 produces a deployable artifact
- The RPM engine kernel runs client-side (edge-canonical per Architecture Principle §1) — no server-side hosting required for core computation
- API endpoints (Phase 3) require a separate hosting decision — GitHub Pages serves static assets only; the SPARQL connector, entity search, and override API need a server runtime

---

## ADR-004: Oxigraph for CT-11 Test Endpoint

**Date:** 2026-03-21

**Decision:** Use Oxigraph as the SPARQL test endpoint for CT-11 (Frequent Path Discovery) and all Phase 2 integration tests.

**Context:** CT-11 requires a SPARQL 1.1 endpoint seeded with deterministic fixture data (1,000 test:Person instances, 950 via 4-hop path, 50 via 2-hop path). The endpoint must start in CI without manual provisioning, run in < 10s, and be isolated from production. Alternatives considered: Apache Jena (heavy JVM dependency, slow startup), RDF4J (same JVM issues), in-memory N-Quads evaluator (incomplete SPARQL 1.1 support). Oxigraph is MIT-licensed, ships as a single binary, starts in under a second, has a standards-compliant SPARQL 1.1 endpoint, and is available as a Docker image for GitHub Actions service containers.

**Consequences:**
- CT-11 fixture data stored as N-Quads or Turtle in `tests/fixtures/ct-11-endpoint/`
- CI provisions Oxigraph as a GitHub Actions service container from `ghcr.io/oxigraph/oxigraph`
- Fixture loaded via Oxigraph's bulk load or SPARQL UPDATE on startup
- All Phase 2 SPARQL integration tests run against the same Oxigraph instance
- No JVM dependency — Node.js 22 + Oxigraph binary is the full CI stack
- Oxigraph is a devDependency concern only — it never enters the kernel or production runtime

---

## ADR-005: React 18 as Frontend Framework

**Date:** 2026-03-21

**Decision:** Use React 18 with TypeScript for the Query Builder UI (Phase 5.B).

**Context:** The kernel is TypeScript throughout; Phase 1 types are the UI data contract. React has the best TypeScript integration, widest maintenance talent pool, and richest accessible component tooling for WCAG 2.1 AA requirements (focus trapping, ARIA live regions, screen reader testing). Vue and Svelte were considered — both capable but neither has React's depth of accessibility ecosystem. React 18 concurrent features support the loading states and narrative row stagger animations specified in UI Spec §14.

**Consequences:**
- All UI components in `src/ui/` as React TSX
- React 18 concurrent features for Suspense-based loading states
- Vite as build tool (see ADR-008)
- `react` and `react-dom` added as runtime dependencies (Orchestrator-approved)

---

## ADR-006: CSS Custom Properties + CSS Modules

**Date:** 2026-03-21

**Decision:** Use CSS custom properties for design tokens and CSS Modules for component scoping. Do not use Tailwind.

**Context:** The UI spec defines a precise design system — 8 spacing tokens, 17-stop color palette, 5 typography scales, 4 border radius tokens, 6 motion tokens. Tailwind's utility-first model works against this precision: fighting the framework to hit exact spec values instead of expressing them directly. CSS custom properties (`:root { --space-4: 16px; }`) are the natural home for design tokens from §5.5, §15–17. CSS Modules scope component styles without build step complexity.

**Consequences:**
- Design tokens defined as CSS custom properties in a root stylesheet
- Component styles in `*.module.css` files co-located with components
- No Tailwind dependency — direct CSS aligned with spec values
- Portable, readable, exactly matching GDE-UI-SPEC-v2.1.md

---

## ADR-007: `src/ui/` Subdirectory Structure

**Date:** 2026-03-21

**Decision:** Place frontend code in `src/ui/` alongside `src/kernel/` and `src/adapters/`, not as a separate workspace package.

**Context:** A separate NPM workspace adds package management complexity before a single component exists. The demo deadline favors simplicity. The import rule stands: `src/ui/` must not import from `src/kernel/` at runtime — only TypeScript type imports for annotation are permitted. All data flows through the Phase 3 HTTP API.

**Consequences:**
- Single `package.json` — no workspace configuration
- `src/ui/` directory with React components, styles, and hooks
- Vite config at project root or in `src/ui/`
- Build produces static assets for GitHub Pages deployment
- Purity check continues to verify `src/kernel/` has no UI imports

---

## ADR-008: Vite as Build Tool

**Date:** 2026-03-21

**Decision:** Use Vite as the frontend build tool for the Query Builder UI.

**Context:** Vite handles TypeScript, CSS Modules, and environment variables (`VITE_API_BASE_URL`) without configuration overhead. It produces optimized static assets suitable for GitHub Pages deployment (Phase 6). HMR for development iteration speed. No competing bundler (webpack, esbuild standalone) offers this combination with less configuration.

**Consequences:**
- `vite` added as devDependency
- `vite.config.ts` at project root
- `VITE_API_BASE_URL` env var for API base URL (default `http://localhost:3000`)
- `npm run build:ui` produces `dist-ui/` static assets
- Phase 6.2 deploys `dist-ui/` to GitHub Pages via `actions/deploy-pages@v4`

---

## ADR-009: Defer Chained Search to Post-Launch (OQ-10)

**Date:** 2026-03-21

**Decision:** Defer the "Chained search" (targetToSubject) composition mode to post-launch. Hide the option entirely in the composition mode selector.

**Context:** The demo graph has one Person and one Organization — no targetToSubject join is possible. Building and testing the chained search UI without a graph that exercises it produces untested code. The kernel's `rpmCompose` already supports the `targetToSubject` mode (Phase 1.9); only the UI rendering is deferred.

**Consequences:**
- Composition mode selector shows only "All must match" and "Any can match"
- "Chained search" radio option is hidden, not shown disabled
- No changes to kernel `compose.ts` or `types.ts`
- Post-launch: when a graph with multiple entity types is available, unhide the option

---

<!--
  Add new decisions below. Use the format:

  ## ADR-NNN: [Decision Title]

  **Date:** YYYY-MM-DD

  **Decision:** One sentence stating the choice.

  **Context:** Why this decision was needed. What alternatives were considered.

  **Consequences:** What follows from this decision. What is now easier or harder.
-->
