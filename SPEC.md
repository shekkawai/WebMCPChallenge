# Smart Responsive Presentation for WebMCP

Status: experimental proposal implemented by this challenge demo.

## Abstract

Responsive design lets one document adapt its layout to different screens. Smart Responsive Presentation lets an agent send the same semantic data to different human contexts—desktop, glasses, passenger display, touch screen, or assistive technology—without choosing a device-specific widget.

The agent states **what the user needs to do**. The page decides **how that need should be rendered and controlled** in its current context.

This proposal adds no new browser primitive. It is a portable convention carried by one ordinary WebMCP tool.

## Contract

```ts
surface_present({
  id?: string,
  title: string,
  purpose: "glance" | "browse" | "inspect" | "compare" | "choose" | "triage",
  dataKind?: "collection" | "document" | "schedule" | "timeline" |
    "metrics" | "media" | "people" | "hierarchy" | "location" | "entity",
  interaction?: "view" | "navigate" | "single-select" | "multi-select" |
    "edit" | "confirm",
  hint?: { layout?: "cards" | "grid" | "list" | "table" },
  items: PresentationItem[],
})
```

Only `purpose` is a required semantic decision. `dataKind`, `interaction`, and `hint` are optional. A host may infer them, use safe defaults, or ignore hints that do not fit its current context.

### Purpose vocabulary

| Purpose | User need | Positive example | Boundary |
| --- | --- | --- | --- |
| `glance` | Understand key facts within seconds | Next meeting and urgent count | Not for exploring many items |
| `browse` | Explore a collection without an immediate decision | Drive folder or news results | Not for prioritizing or deciding |
| `inspect` | Examine one item deeply | Read one email or proposal | Not for side-by-side evaluation |
| `compare` | Weigh multiple items using shared attributes | Venues by price and capacity | Use `choose` when only selection remains |
| `choose` | Pick one option to act on | Select an invitation design | Use `compare` while trade-offs are still being evaluated |
| `triage` | Prioritize, keep, dismiss, or organize many items | Morning inbox review | Not passive browsing |

A workflow may change purpose without changing its underlying data. Candidate event times can begin as `compare`, become `choose` after discussion, and become `glance` after confirmation.

## Presentation items

Every item has a `title` and may carry `subtitle`, `summary`, `content`, `imageUrl`, `badge`, `lat`/`lng` coordinates, and ordered `facts`:

```json
{
  "id": "harbour-room",
  "title": "Harbour Room",
  "subtitle": "Wan Chai",
  "summary": "Best atmosphere",
  "facts": [
    { "label": "Price", "value": "HK$18,000" },
    { "label": "Capacity", "value": 120 }
  ]
}
```

Facts are semantic values, not CSS or HTML. For `compare`, agents should use identical fact labels on every item so values align as columns; a host unions the labels it receives and renders a placeholder for missing values. Hosts remain responsible for escaping content, validating media URLs, applying privacy limits, and choosing accessible components.

## Context adaptation

The host owns the mapping. This demo currently uses:

| Purpose | Desktop | Glasses |
| --- | --- | --- |
| `glance` | Summary grid | One focused summary |
| `browse` | Card deck, list, or grid | Swipeable deck |
| `inspect` | Document reader | Compact reader |
| `compare` | Wide comparison table | One comparison card per swipe |
| `choose` | Option deck | One option per swipe |
| `triage` | Dense review list | One review card per swipe |

Shapes are host-side vocabulary; agents speak purpose. When items carry `lat`/`lng`, this host recognizes the **location shape** and renders a live map — pins with a focus highlight on desktop (`map-pins`), the same map filling the lens in glasses context (`map-lens`) — for every purpose except `inspect` and `triage`, which keep their focused layouts. The agent never asked for a map; it sent location-shaped data. This is the extensibility rule in practice: adding the map renderer required zero agent-side changes, and an older host that predates it simply renders the same items as cards.

The page re-registers `surface_present` when context changes so its tool description tells the agent which context is active. This is advisory optimization, not a correctness requirement: the render receipt is authoritative.

## Render receipt

Every successful call returns what the host actually did:

```json
{
  "receipt": {
    "surface": "venues",
    "purpose": "compare",
    "context": "glasses",
    "renderedAs": "comparison-cards",
    "interaction": "view",
    "showing": 1,
    "total": 3
  }
}
```

Receipts close the negotiation loop. An agent can shorten content, rank the top results, or explain that more items exist without understanding the host's component library.

## Degradation rules

1. Unknown or missing purpose degrades to `browse`.
2. Unknown `dataKind`, `interaction`, or hint is ignored.
3. A host may override hints to preserve readability, safety, or accessibility.
4. Unsupported new item fields are ignored.
5. Existing data must remain usable when the context changes; the agent must not be required to resend it.

These rules make vocabulary growth backward-compatible rather than turning every new renderer into an agent change.

## Cross-model conformance prompts

The following corpus tests whether models can choose a useful purpose. Exact labels are expected where the user's need is explicit; graceful fallback is still required when a model differs.

| Prompt | Expected purpose |
| --- | --- |
| “What is my next meeting?” | `glance` |
| “Show the files in this Drive folder.” | `browse` |
| “Open and read Kelvin's email.” | `inspect` |
| “Compare these venues by price, capacity, and distance.” | `compare` |
| “Show three invitation designs so I can pick one.” | `choose` |
| “Help me clear and prioritize my unread inbox.” | `triage` |
| “Which of these Friday time slots is best?” | `compare` |
| “Use slot two.” | `choose` |
| “Give me the essentials from this proposal.” | `glance` |
| “Let me look through the event photos.” | `browse` |

Conformance should judge whether the resulting presentation remains useful—not merely whether every model emits an identical enum.

## Non-goals

- Letting agents send arbitrary HTML, CSS, or executable code.
- Standardizing a universal visual component library.
- Replacing domain-specific tools such as calendar slot proposals.
- Claiming that current glasses browsers implement WebMCP.

The proposal standardizes semantic presentation intent. Rendering remains a host capability.
