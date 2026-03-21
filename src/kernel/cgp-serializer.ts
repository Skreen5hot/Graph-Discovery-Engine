/**
 * CGP Serializer — RPM v2.1 §13
 *
 * Produces a canonical CGP (Canonical Graph Pattern) from an expanded
 * pattern. Handles step path tracking through branch recursion,
 * deterministic blank node ID generation, @graph node ordering,
 * and provenance attachment.
 *
 * Pure function: no I/O, no network, no non-deterministic APIs.
 */

import type {
  CGP,
  CGPNode,
  Provenance,
  PatternStep,
  BranchStep,
  Subject,
} from "./types.js";
import { generateNodeId } from "./deterministic-id.js";
import { stableStringify } from "./canonicalize.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Static kernel version. Update on breaking changes. */
const KERNEL_VERSION = "0.1.0";

/**
 * The embedded JSON-LD context for CGP output.
 *
 * This is the minimum viable context for Phase 1.5+. It includes:
 * - rpm: The RPM v2.1 namespace
 * - rdf/rdfs/owl/xsd: Standard ontology prefixes
 * - skos: Used by ICE literal mode and labeling
 *
 * Production contexts may extend this with domain-specific prefixes.
 * The context structure is stable enough for Phase 1.6 to expand
 * patterns against it.
 */
export const CGP_CONTEXT: Record<string, string> = {
  rpm: "https://spec.example.org/rpm/v2/",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
};

// ---------------------------------------------------------------------------
// Step Path Tracking
// ---------------------------------------------------------------------------

/**
 * Build a dot-separated step path string.
 * E.g., parentPath="0.1", stepIndex=2 → "0.1.2"
 */
export function buildStepPath(parentPath: string, stepIndex: number): string {
  if (parentPath === "") {
    return String(stepIndex);
  }
  return `${parentPath}.${stepIndex}`;
}

// ---------------------------------------------------------------------------
// Pattern Expansion to CGP Nodes
// ---------------------------------------------------------------------------

/** Accumulator for collecting CGP nodes during pattern walk. */
interface ExpansionContext {
  subjectId: string;
  intent: string;
  mappingShorthand: string;
  nodes: CGPNode[];
  rulesApplied: string[];
}

/**
 * Walk a pattern step tree and emit CGP nodes with deterministic IDs.
 *
 * Each node step produces a CGPNode with a blank node @id derived from
 * the step path. Edge steps produce predicate relationships on the
 * preceding node. Bind steps mark output roles. Branch steps recurse
 * with the accumulated path.
 *
 * @param steps - The pattern steps to walk
 * @param parentPath - The parent step path (empty string for root)
 * @param parentNodeId - The @id of the parent node (subject @id for root)
 * @param branchName - The enclosing branch name
 * @param ctx - The expansion context accumulator
 */
export function walkPatternSteps(
  steps: readonly PatternStep[],
  parentPath: string,
  parentNodeId: string,
  branchName: string,
  ctx: ExpansionContext,
): void {
  let currentNodeId = parentNodeId;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepPath = buildStepPath(parentPath, i);

    switch (step.type) {
      case "edge": {
        // Edge steps don't create new nodes — they create predicates
        // on the current node pointing to the next node.
        // The actual predicate linking is done when the next node step fires.
        // Store the edge info for the next node step to consume.
        break;
      }

      case "node": {
        // Create a new CGP node with a deterministic blank node ID
        const nodeId = generateNodeId(
          ctx.subjectId,
          ctx.intent,
          ctx.mappingShorthand,
          stepPath,
          branchName,
        );
        const node: CGPNode = {
          "@id": nodeId,
          "@type": [step.class],
        };
        ctx.nodes.push(node);

        // Link from parent via the preceding edge (if any)
        const prevStep = i > 0 ? steps[i - 1] : null;
        if (prevStep && prevStep.type === "edge") {
          const parentNode = findOrCreateParentLink(currentNodeId, ctx);
          if (prevStep.direction === "forward") {
            parentNode[prevStep.predicate] = { "@id": nodeId };
          } else {
            // Inverse: the new node points back to the parent
            node[prevStep.predicate] = { "@id": currentNodeId };
          }
        }

        currentNodeId = nodeId;
        break;
      }

      case "bind": {
        // Mark the current node with the bind role
        const bindNode = ctx.nodes.find((n) => n["@id"] === currentNodeId);
        if (bindNode) {
          bindNode["rpm:role"] = step.role;
        }
        break;
      }

      case "literal": {
        // Literal steps modify the preceding edge's handling mode
        // The via mode ("direct" or "ice") is metadata on the mapping,
        // not a structural CGP element. No node created.
        break;
      }

      case "branch": {
        // Recurse into the branch with the current node as parent
        walkPatternSteps(
          step.steps,
          stepPath,
          currentNodeId,
          step.name,
          ctx,
        );
        break;
      }
    }
  }
}

/**
 * Find a node in the accumulator by @id, or create a stub if it's the
 * subject node (which isn't in the nodes array — it's the root).
 */
function findOrCreateParentLink(
  nodeId: string,
  ctx: ExpansionContext,
): CGPNode {
  const existing = ctx.nodes.find((n) => n["@id"] === nodeId);
  if (existing) return existing;

  // This is the subject/root node — create it
  const rootNode: CGPNode = {
    "@id": nodeId,
    "@type": [],
  };
  ctx.nodes.push(rootNode);
  return rootNode;
}

// ---------------------------------------------------------------------------
// CGP Assembly
// ---------------------------------------------------------------------------

/**
 * Normalize the @graph array: sort nodes by @id for deterministic output (RPM §13).
 * Lexicographic sort on @id ensures identical patterns produce identical CGPs
 * regardless of expansion traversal order.
 */
export function normalizeGraph(nodes: CGPNode[]): CGPNode[] {
  return [...nodes].sort((a, b) => {
    const aId = String(a["@id"]);
    const bId = String(b["@id"]);
    return aId.localeCompare(bId);
  });
}

/**
 * Build provenance metadata for a CGP.
 * Deterministic: no timestamps, no random values.
 */
export function buildProvenance(rulesApplied: string[]): Provenance {
  return {
    "@type": "Provenance",
    kernelVersion: KERNEL_VERSION,
    rulesApplied: [...rulesApplied],
  };
}

/**
 * Serialize a set of CGP nodes into a complete CGP document.
 *
 * The output is a valid JSON-LD document with:
 * - Embedded @context (RPM namespace + standard prefixes)
 * - @graph array sorted by @id (deterministic ordering)
 * - Provenance with kernelVersion and rulesApplied
 * - All object keys recursively sorted (via stableStringify)
 *
 * @param nodes - The expanded CGP nodes (unsorted)
 * @param rulesApplied - The transformation rules that produced these nodes
 * @returns A complete, canonical CGP document
 */
export function serializeCGP(
  nodes: CGPNode[],
  rulesApplied: string[],
): CGP {
  const sorted = normalizeGraph(nodes);

  const cgp: CGP = {
    "@context": { ...CGP_CONTEXT },
    "@graph": sorted,
    provenance: buildProvenance(rulesApplied),
  };

  // Round-trip through stableStringify to ensure all keys are sorted
  return JSON.parse(stableStringify(cgp)) as CGP;
}

/**
 * Expand a mapping pattern against a subject and produce a canonical CGP.
 *
 * This is the core serialization entry point for Phase 1.6's RPM_Expand.
 * It walks the pattern steps, generates deterministic blank node IDs,
 * normalizes the output, and attaches provenance.
 *
 * @param subject - The subject entity
 * @param intent - The intent shorthand from the expand call
 * @param mappingShorthand - The resolved mapping shorthand
 * @param pattern - The root branch step of the mapping pattern
 * @param rulesApplied - The rules that apply during this expansion
 * @returns A complete, canonical CGP document
 */
export function expandPatternToCGP(
  subject: Subject,
  intent: string,
  mappingShorthand: string,
  pattern: BranchStep,
  rulesApplied: string[],
): CGP {
  const ctx: ExpansionContext = {
    subjectId: subject["@id"],
    intent,
    mappingShorthand,
    nodes: [],
    rulesApplied,
  };

  // Add the subject as the root node
  const rootNode: CGPNode = {
    "@id": subject["@id"],
    "@type": [...subject["@type"]],
  };
  ctx.nodes.push(rootNode);

  // Walk the pattern from the root
  walkPatternSteps(
    pattern.steps,
    "",
    subject["@id"],
    pattern.name,
    ctx,
  );

  return serializeCGP(ctx.nodes, rulesApplied);
}

/**
 * Produce a canonical JSON string from a CGP.
 * Uses stableStringify for deterministic key ordering.
 */
export function stringifyCGP(cgp: CGP, pretty: boolean = false): string {
  return stableStringify(cgp, pretty);
}
