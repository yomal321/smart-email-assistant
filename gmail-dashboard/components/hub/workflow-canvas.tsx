"use client";

// The workflow's real internal node graph — actual nodes and actual
// connections, fetched live from n8n (GET /api/v1/workflows/:id via
// bot-workflow-detail), not a simplified stand-in. n8n's own saved (x, y)
// positions aren't used: they're laid out for an infinite pannable canvas,
// and for Assistant Brain/Assistant Scheduler (36-40 nodes spanning a
// coordinate range in the thousands) reproducing them at real scale in a
// docked panel would be either unreadably tiny or require pan/zoom
// controls. Instead: real nodes, real edges, auto-laid-out into a clean
// left-to-right layered flow per connected component (n8n workflows with
// multiple independent triggers — Assistant Scheduler has four — naturally
// split into separate components, rendered as separate labeled flows).
import * as React from "react";
import { Box, Code2, Database, GitBranch, Send, Zap, ZoomIn, ZoomOut } from "lucide-react";
import { IconChip, toneColor, type Tone } from "@/components/hub/primitives";

export interface WorkflowStructure {
  nodes: { name: string; type: string }[];
  connections: Record<string, { main?: ({ node: string; type: string; index: number } | null)[][] | null }>;
}

interface Edge {
  from: string;
  to: string;
}

interface LaidOutNode {
  name: string;
  type: string;
  layer: number;
  row: number;
}

const NODE_W = 208;
const NODE_H = 54;
const COL_GAP = 56;
const ROW_GAP = 14;
const COL_W = NODE_W + COL_GAP;
const ROW_H = NODE_H + ROW_GAP;
const COMPONENT_LABEL_H = 28; // mb-2 (8px) + one text line (~20px), only present when there's more than one flow
const COMPONENT_GAP = 24; // matches the space-y-6 wrapper below
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

// "n8n-nodes-base.executeWorkflowTrigger" -> "Execute Workflow Trigger".
// Also handles a bare type with no dot ("if" -> "If") and vendor-prefixed
// custom nodes, whose last segment is treated the same way.
function friendlyType(type: string): string {
  const last = type.split(".").pop() ?? type;
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// A visual read on what kind of step a node is, so the canvas isn't a wall
// of identical white boxes — matched on the real n8n type string (the same
// value already shown as the node's sublabel), not invented metadata.
function nodeCategory(type: string): { icon: React.ComponentType<{ size?: number; className?: string }>; tone: Tone } {
  const seg = (type.split(".").pop() ?? type).toLowerCase();
  if (seg.includes("trigger") || seg === "webhook") return { icon: Zap, tone: "primary" };
  if (seg === "if" || seg.includes("switch") || seg.includes("filter")) return { icon: GitBranch, tone: "warning" };
  if (seg.includes("postgres") || seg.includes("database") || seg.includes("supabase")) return { icon: Database, tone: "success" };
  if (seg.includes("code") || seg.includes("function")) return { icon: Code2, tone: "info" };
  if (seg.includes("telegram") || seg.includes("respondtowebhook") || seg.includes("http")) return { icon: Send, tone: "danger" };
  return { icon: Box, tone: "neutral" };
}

function extractEdges(connections: WorkflowStructure["connections"]): Edge[] {
  const edges: Edge[] = [];
  for (const [from, outputs] of Object.entries(connections)) {
    for (const branch of outputs.main ?? []) {
      for (const target of branch ?? []) {
        if (target) edges.push({ from, to: target.node });
      }
    }
  }
  return edges;
}

function weaklyConnectedComponents(nodeNames: string[], edges: Edge[]): string[][] {
  const adjacency = new Map<string, Set<string>>(nodeNames.map((n) => [n, new Set<string>()]));
  for (const e of edges) {
    adjacency.get(e.from)?.add(e.to);
    adjacency.get(e.to)?.add(e.from);
  }
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const start of nodeNames) {
    if (visited.has(start)) continue;
    const component: string[] = [];
    const stack = [start];
    visited.add(start);
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  return components;
}

// BFS shortest-path layering from the component's root(s) (nodes with no
// incoming edge within the component; if none exist — an all-cycle
// component — the first node by original order stands in). Each node is
// enqueued at most once, so a real loop-back edge (n8n's own "Loop Over
// Items" pattern) simply never advances that node's layer further — it's
// flagged as a back-edge at render time instead (layer[to] <= layer[from]).
function layerComponent(componentNodes: string[], edges: Edge[]): Map<string, number> {
  const inComponent = new Set(componentNodes);
  const incomingCount = new Map<string, number>(componentNodes.map((n) => [n, 0]));
  const outgoing = new Map<string, string[]>(componentNodes.map((n) => [n, []]));
  for (const e of edges) {
    if (!inComponent.has(e.from) || !inComponent.has(e.to)) continue;
    outgoing.get(e.from)!.push(e.to);
    incomingCount.set(e.to, (incomingCount.get(e.to) ?? 0) + 1);
  }

  const roots = componentNodes.filter((n) => incomingCount.get(n) === 0);
  const startNodes = roots.length > 0 ? roots : [componentNodes[0]];

  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const r of startNodes) {
    layer.set(r, 0);
    queue.push(r);
  }
  let i = 0;
  while (i < queue.length) {
    const current = queue[i++];
    for (const next of outgoing.get(current) ?? []) {
      if (!layer.has(next)) {
        layer.set(next, layer.get(current)! + 1);
        queue.push(next);
      }
    }
  }
  // Any node BFS never reached (disconnected within its own "connected"
  // component shouldn't happen, but a defensive fallback costs nothing).
  for (const n of componentNodes) if (!layer.has(n)) layer.set(n, 0);
  return layer;
}

function layoutComponent(componentNodes: string[], nodesByName: Map<string, string>, edges: Edge[]) {
  const layers = layerComponent(componentNodes, edges);
  const byLayer = new Map<number, string[]>();
  for (const n of componentNodes) {
    const l = layers.get(n)!;
    const arr = byLayer.get(l) ?? [];
    arr.push(n);
    byLayer.set(l, arr);
  }
  const laidOut: LaidOutNode[] = [];
  for (const [layer, names] of byLayer) {
    names.forEach((name, row) => {
      laidOut.push({ name, type: nodesByName.get(name) ?? "", layer, row });
    });
  }
  const maxLayer = Math.max(0, ...laidOut.map((n) => n.layer));
  const maxRows = Math.max(1, ...[...byLayer.values()].map((arr) => arr.length));
  return { laidOut, width: (maxLayer + 1) * COL_W - COL_GAP, height: maxRows * ROW_H - ROW_GAP };
}

// Shared by WorkflowCanvas (which needs the full per-component layout to
// render) and computeCanvasWidth (which just needs the resulting sizes, so
// the panel hosting this component can size itself to the real content
// instead of a guessed fixed width) — one computation, not two copies of
// the same graph logic that could quietly drift apart.
function buildLayout(structure: WorkflowStructure) {
  // Sticky notes are editor annotations, not execution steps — n8n never
  // connects them to anything, and including them would show real data
  // (they are real nodes in the definition) in a misleading way (as if
  // they were part of how the workflow runs, which they aren't).
  const realNodes = structure.nodes.filter((n) => n.type !== "n8n-nodes-base.stickyNote");
  const nodesByName = new Map(realNodes.map((n) => [n.name, n.type]));
  const nodeNames = realNodes.map((n) => n.name);
  const edges = extractEdges(structure.connections);
  const components = weaklyConnectedComponents(nodeNames, edges).sort((a, b) => b.length - a.length);

  return components.map((component) => {
    const { laidOut, width, height } = layoutComponent(component, nodesByName, edges);
    const componentSet = new Set(component);
    const internalEdges = edges.filter((e) => componentSet.has(e.from) && componentSet.has(e.to));
    return { laidOut, width, height, internalEdges };
  });
}

// The real content width this structure needs, so the panel hosting the
// canvas (workflow-detail-sheet.tsx) can size itself to it instead of one
// fixed guess — a 3-node workflow shouldn't open as wide as a 40-node one.
// Components stack vertically, so the panel only needs to fit the widest
// single one, not their sum.
export function computeCanvasWidth(structure: WorkflowStructure): number {
  const layouts = buildLayout(structure);
  return Math.max(0, ...layouts.map((l) => l.width));
}

export function WorkflowCanvas({ structure }: { structure: WorkflowStructure }) {
  const layouts = buildLayout(structure);
  const [zoom, setZoom] = React.useState(1);

  // The natural (unscaled) size of the whole stack of flows, computed the
  // same way the layout itself was — analytically from the same numbers,
  // not measured from the DOM after paint, so there's no flash of
  // wrong-sized content on first render.
  const naturalWidth = Math.max(0, ...layouts.map((l) => l.width));
  const naturalHeight = layouts.reduce(
    (sum, l, i) => sum + l.height + (layouts.length > 1 ? COMPONENT_LABEL_H : 0) + (i > 0 ? COMPONENT_GAP : 0),
    0
  );

  function zoomBy(delta: number) {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 100) / 100)));
  }

  return (
    <div>
      {/* Sticky on both axes within the parent's scroll region (the panel
          in workflow-detail-sheet.tsx), so it stays reachable however far
          the real graph has been scrolled — a wide 40-node flow is exactly
          the case where losing the zoom controls off-screen would matter. */}
      <div className="sticky top-0 left-0 z-10 mb-2 flex w-fit items-center gap-1 rounded-lg border border-rule bg-surface p-1 shadow-popover">
        <button
          onClick={() => zoomBy(-ZOOM_STEP)}
          disabled={zoom <= ZOOM_MIN}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-secondary hover:bg-surface-sunk disabled:opacity-40"
          aria-label="Zoom out"
        >
          <ZoomOut size={13} />
        </button>
        <button
          onClick={() => setZoom(1)}
          className="tabular w-11 text-center text-xs text-ink-secondary hover:text-ink"
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => zoomBy(ZOOM_STEP)}
          disabled={zoom >= ZOOM_MAX}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-secondary hover:bg-surface-sunk disabled:opacity-40"
          aria-label="Zoom in"
        >
          <ZoomIn size={13} />
        </button>
      </div>

      {/* Outer box is sized to the SCALED visual size, so the parent's
          overflow-auto scrollbars match what's actually visible at this
          zoom level. Inner box stays at natural size and is scaled purely
          visually (transform, not a layout-affecting property), which is
          what lets the natural-size computation above stay correct at any
          zoom without re-measuring. */}
      <div style={{ width: naturalWidth * zoom, height: naturalHeight * zoom }}>
        <div
          className="space-y-6 pb-2"
          style={{ width: naturalWidth, height: naturalHeight, transform: `scale(${zoom})`, transformOrigin: "top left" }}
        >
          {layouts.map(({ laidOut, width, height, internalEdges }, ci) => {
        const posOf = (name: string) => {
          const n = laidOut.find((x) => x.name === name)!;
          return { x: n.layer * COL_W, y: n.row * ROW_H };
        };

        return (
          <div key={ci}>
            {layouts.length > 1 && (
              <p className="mb-2 font-narrow text-[10.5px] font-bold uppercase tracking-wider text-ink-tertiary">
                {laidOut.find((n) => n.layer === 0)?.name ?? `Flow ${ci + 1}`}
              </p>
            )}
            <div className="relative" style={{ width, height, minWidth: width }}>
              <svg width={width} height={height} className="absolute inset-0 overflow-visible">
                <defs>
                  <marker id={`arrow-${ci}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--rule-strong)" />
                  </marker>
                </defs>
                {internalEdges.map((e, i) => {
                  const a = posOf(e.from);
                  const b = posOf(e.to);
                  const isBack = b.x <= a.x;
                  const ax = a.x + NODE_W;
                  const ay = a.y + NODE_H / 2;
                  const bx = isBack ? b.x + NODE_W : b.x;
                  const by = b.y + NODE_H / 2;
                  return (
                    <path
                      key={i}
                      d={`M${ax},${ay} C${ax + 24},${ay} ${bx - (isBack ? -24 : 24)},${by} ${bx},${by}`}
                      fill="none"
                      stroke="var(--rule-strong)"
                      strokeWidth={1.25}
                      strokeDasharray={isBack ? "3 3" : undefined}
                      markerEnd={`url(#arrow-${ci})`}
                    />
                  );
                })}
              </svg>
              {laidOut.map((n) => {
                const { icon: NodeIcon, tone } = nodeCategory(n.type);
                return (
                  <div
                    key={n.name}
                    className="absolute flex items-center gap-2 rounded-lg border border-rule bg-surface-raised py-1.5 pr-2.5 pl-2 shadow-card"
                    style={{
                      left: n.layer * COL_W,
                      top: n.row * ROW_H,
                      width: NODE_W,
                      height: NODE_H,
                      borderLeft: `3px solid ${toneColor(tone)}`,
                    }}
                    title={`${n.name} (${n.type})`}
                  >
                    <IconChip icon={NodeIcon} tone={tone} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-ink">{n.name}</p>
                      <p className="truncate text-[10px] text-ink-tertiary">{friendlyType(n.type)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
          })}
        </div>
      </div>
    </div>
  );
}
