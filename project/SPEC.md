# GDE Domain Specification — RPM v2.1

<!--
  This file defines the input/output contract for the Graph Discovery Engine kernel.
  Phase 1.1 populates these sections with concrete types and examples.

  Normative sources:
    project/RPM-v2.1-FINAL.md     — Engine specification (§4 Input/Output Contract)
    project/GDE-UI-SPEC-v2.1.md   — UI specification (screens, components, design system)
-->

---

## 1. Input Contract (RPM §4.1)

```
RPM_Expand(intent, subject, context) -> CGP | RPMError | RPMPartialCGP
RPM_Compose(composedQuery, context) -> CGP_c | RPMError[]
```

<!-- Phase 1.1: Define Intent, Subject, and Context shapes here -->

---

## 2. Subject Shape (RPM §4.2)

<!-- Phase 1.1: Define the subject entity shape with @id and @type -->

---

## 3. Output Contract (RPM §4.3)

<!-- Phase 1.1: Define CGP, CGP_c, RPMError, RPMPartialCGP output shapes -->

---

## 4. Context Requirements

<!-- Phase 1.1: Define mappingRegistry, ontologyClosure, and runtime parameter shapes -->

---

## 5. JSON-LD Context

<!-- Phase 1.1: Define the @context structure — embedded vs. remote decision pending Orchestrator input -->
