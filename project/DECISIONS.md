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

<!--
  Add new decisions below. Use the format:

  ## ADR-NNN: [Decision Title]

  **Date:** YYYY-MM-DD

  **Decision:** One sentence stating the choice.

  **Context:** Why this decision was needed. What alternatives were considered.

  **Consequences:** What follows from this decision. What is now easier or harder.
-->
