# Engineering Audit Document — CMF Build Sheet

A working specification for the single shared Content Type. Build the schema once; each
engineering discipline is a populated **seed document**, not a separate configuration.

Decision baseline: *same structure across disciplines, questions differ only.* → one Content
Type, one schema, seed-and-copy for templates.

> **Correction note (v3):** CMF has **no "List" data type** — confirmed against the live QMS
> Design FMEA. Property data types are String, Text, Integer, Date, Boolean, Image. Dropdowns are
> a **View column** setting, not a property attribute: `cmf_TabularViewColumn.classification` =
> `Unbound Combo` (inline values, no list) or `Bound List` (sourced from a list, two-column
> label/value editor). The FMEA stores severity as plain `integer` and gets its 1–10 dropdown
> purely from the column classification. So `status`/`stage` are **String** + **Unbound Combo** —
> no helper ItemType, no code. Also corrected: the document is the **CMF ItemType**, the
> OnFormPopulated method is **`cmf_ShowContentType`**, binding params are in §2.4.

---

## 0. Prerequisites (before opening the Content Type editor)

CMF separates two ItemTypes. Get this right or nothing renders:

- **CMF ItemType** = `eng_AuditDocument` — the document users create and open. It hosts the grid
  editor and is the **Linked ItemType** on the Content Type. Needs the OnFormPopulated method and
  a RelationshipType.
- **Business Object ItemType(s)** = the external items that *elements bind to* — here, the QMS
  **Audit Finding** and the **CAP action**. You do not create a new one; you bind to the QMS ones.

| # | Step | Notes |
|---|------|-------|
| 0.1 | Create ItemType `eng_AuditDocument` | TOC access, permissions, Can Add identity, `name` property (String, 32–64). No special CMF config on the ItemType itself. |
| 0.2 | On its Form: Form Event tab → Add Methods → `cmf_ShowContentType`, set Event = **OnFormPopulated** | Required for every CMF ItemType form. This is the core method, not custom code. |
| 0.3 | Create a RelationshipType (e.g. `eng_AuditDocumentRel`), Source ItemType = `eng_AuditDocument` | CMF needs this. (CMF also auto-creates 2 hidden RelationshipTypes later — do **not** export those.) |
| 0.4 | *(Optional)* Create a maintained List for status/stage values | Only needed if you choose **Bound List** (governed values). For **Unbound Combo**, values are typed inline on the column — skip this. |

### Container metadata (regular properties on `eng_AuditDocument`)

| Property | Data Type | Required | Notes |
|----------|-----------|----------|-------|
| `name` | String (64) | Yes | Identifier / keyed_name |
| `discipline` | String or Item | No | Tags which discipline this audit/seed belongs to |
| `project` | Item → *Project* | No | Link audit to its project |
| `audit_date` | Date | No | |
| `auditor` | Item → Identity | No | |
| `is_template` | Boolean | No | Marks seed instances; auditors copy only from these |

---

## 1. Picklist values

**Engineering Discipline** (container metadata)
`Mechanical` · `Electrical` · `Structural` · `Civil` · `I&C` · `Process` · `Piping`

**Audit Milestone Stage** (`stage`)
`10%` · `30%` · `60%` · `90%`

**Audit Question Status** (`status`)
`Satisfactory` · `Unsatisfactory` · `Not Applicable` · `Notable`

---

## 2. Element Types

CMF property data types: **String, Text, Integer, Date, Boolean, Image.** (No List.)
"Text" = long/multi-line; "String" = single-line with a Data Length.

### 2.1 `Milestone` — top element under the document root

| Property | Data Type | Required | List / Notes |
|----------|-----------|----------|--------------|
| `stage` | String | Yes | Dropdown via column `classification` = Unbound Combo (see §2.3) |
| `milestone_label` | String (128) | No | Optional free-text descriptor |

### 2.2 `Scope` — child of Milestone

| Property | Data Type | Required | List / Notes |
|----------|-----------|----------|--------------|
| `scope_name` | String (128) | Yes | e.g. "Process Safety", "Structural Integrity" |
| `description` | Text | No | Optional scope intro |

### 2.3 `Question` — child of Scope

| Property | Data Type | Required | List / Notes |
|----------|-----------|----------|--------------|
| `question_number` | String (32) | Yes | Manual, or auto-stamp via the Name/onFormPopulate method |
| `question_text` | Text | Yes | The question content |
| `guidance` | Text | No | Acceptance criteria / reviewer guidance |
| `ref_text` | Text | No | References as free text |
| `ref_document` | (binding) | No | References as a live document link — element binding, not a property (see §2.4) |
| `status` | String | Yes | Dropdown via column `classification` = Unbound Combo (see below) |
| `reviewer_comment` | Text | No | Quick inline note; formal observation = child Finding |

> **How `status` / `stage` get a dropdown** (confirmed from the live QMS Design FMEA) — the value
> is stored as a plain **String/Integer**; the dropdown is set on the **Tabular View column** via
> its `classification`:
> - **Property Default** — plain cell (no dropdown)
> - **Unbound Combo** — dropdown of inline values, no external list. *Use this for `status` and
>   `stage`*: type the 4 values on the column. No helper ItemType, no method, no code.
> - **Bound List** — dropdown sourced from a maintained list, rendered as a two-column
>   label/value editor (how FMEA does its 1–10 severity/occurrence/detection ranks). Use only if
>   you want status/stage values centrally governed and reusable.

### 2.4 `Finding` — child of Question — **bound to the QMS Audit Finding**

Element binding (proxy to the real Finding). Configure on the element via **Add Element Binding**:

| Binding setting | Value |
|-----------------|-------|
| Referenced Type | QMS **Audit Finding** ItemType |
| Tracking Mode | **Show Differences** (editor flags drift between the proxy and the live item) |
| Resolution Mode | **Current** (compare against the current version) |
| New Element Mode | **Pick or Create** (link existing, or spawn a new Finding) |
| Reference Is Required | No (a Question may have no finding) |
| Property Bindings | Map Finding props → columns: number, description, classification/severity, state |

### 2.5 `Action` — child of Finding — **bound to the QMS CAP action**

Same binding mechanism; Referenced Type = the QMS **CAP action** item (confirm exact ItemType).
Property Bindings → columns: action number, description, owner/assignee, status/state, due_date.

> Binding is a **soft link** — it won't appear in Where-Used. For hard traceability, carry a real
> relationship alongside the proxy (part of the deferred Unsatisfactory→Finding seam).

---

## 3. Element binding (hierarchy)

```
eng_AuditDocument (CMF ItemType / Linked ItemType — the document)
└── Milestone        (stage: 10/30/60/90)
    └── Scope        (scope_name)
        └── Question (number, text, refs, status)
            └── Finding   ⟶ binding → QMS Audit Finding
                └── Action ⟶ binding → QMS CAP action
```

- Build each parent→child level with **Add Element Type**; add **Add Element Binding** for the
  Finding/Action proxies (and for `ref_document` / picklist helpers if using the binding route).
- **Identity inheritance:** elements inherit `managed_by_id`, `owned_by_id`, `team_id` from the
  parent document instance — relevant when you set permissions on the audit trail.

---

## 4. View configuration

- Right-click **Views → Add View** → confirm **Tabular** view.
- **Columns:** Add Column per visible property — Mapped Property, Header Title, Initial Width, and
  set **`classification`** for the cell editor: `Property Default` for plain cells, `Unbound Combo`
  for `status`/`stage` dropdowns, `Bound List` if sourcing from a maintained list.
- **Element Nodes:** Add Element Type Configuration per element (Label, Element Type, Icon).
- **Additional Header Rows:** optional grouping bands (Label, Start col, End col).
- **Status color-coding** (the "intuitive" requirement): apply cell styles on `status` —
  Unsatisfactory red, Notable amber, Satisfactory green, Not Applicable grey.
- **Gotcha:** any parallel element structure without a shared parent must live in its own View or
  the editor renders blank. The single-tree layout above avoids this.

---

## 5. Build order

1. ItemType `eng_AuditDocument` + `cmf_ShowContentType` OnFormPopulated + RelationshipType *(§0)*
2. Helper picklist ItemTypes, if using the binding route *(§0.4 / §2.3)*
3. Content Type, **Linked ItemType = `eng_AuditDocument`**
4. Element Types + Property Types *(§2)*
5. Element bindings — Finding/Action proxies + any picklist/document bindings *(§2.4)*
6. View(s) + status styling *(§4)*
7. Run the metadata configuration check
8. Build one Released seed document per discipline → copy to start new audits
9. *(deferred)* Lifecycle + workflow gates at 10/30/60/90
10. *(deferred)* Unsatisfactory → auto-create Finding + hard relationship

---

## 6. Confirm before binding (open items)

- ~~**Dropdown mechanism**~~ — **resolved:** String property + column `classification` =
  Unbound Combo (inline) or Bound List (governed). Confirmed against the QMS Design FMEA.
- **Action ItemType:** exact QMS object the `Action` element binds to (CAP action vs. task).
- **`ref_document` target:** native Document, `tp_TechDoc`, or both.
- **Question numbering:** manual string vs. auto-sequence in the Name method.

---

## 7. Packaging note (for later export)

When exporting the Content Type, exclude the 2 RelationshipTypes CMF auto-creates on
`eng_AuditDocument`, and include `cmf_BaseView` so the CMF loads correctly on import.
