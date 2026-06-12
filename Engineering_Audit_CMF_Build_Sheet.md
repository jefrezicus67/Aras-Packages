# Engineering Audit Document — CMF Build Sheet

A working specification for the single shared Content Type. Build the schema once; each
engineering discipline is a populated **seed document**, not a separate configuration.

Decision baseline: *same structure across disciplines, questions differ only.* → one Content
Type, one schema, seed-and-copy for templates.

---

## 0. Prerequisites (do before opening the Content Type editor)

| # | Step | Notes |
|---|------|-------|
| 0.1 | Create Business Object ItemType `eng_AuditDocument` | TOC access, permissions, Can Add identity, `name` property (String, 64, required) |
| 0.2 | Add the standard CMF `onFormPopulated` method to its default Form | Required for every CMF-backed ItemType; paste the method body from the CMF Guide. Also wire the Name property here. |
| 0.3 | Create the three Lists below | Needed before you can attach List editors to properties |

### Container metadata (regular ItemType properties on `eng_AuditDocument`, not CMF elements)

| Property | Data Type | Required | Notes |
|----------|-----------|----------|-------|
| `name` | String (64) | Yes | Identifier / keyed_name |
| `discipline` | List → *Engineering Discipline* | Yes | Tags which discipline this audit (and seed) belongs to |
| `project` | Item → *Project* | No | Link audit to its project |
| `audit_date` | Date | No | |
| `auditor` | Item → Identity | No | |
| `is_template` | Boolean | No | Marks seed/template instances; auditors copy only from these |

---

## 1. Lists to create

**Engineering Discipline** (adjust to your set)
`Mechanical` · `Electrical` · `Structural` · `Civil` · `I&C` · `Process` · `Piping`

**Audit Milestone Stage**
`10%` · `30%` · `60%` · `90%`

**Audit Question Status**
`Satisfactory` · `Unsatisfactory` · `Not Applicable` · `Notable`

---

## 2. Element Types

Data Type maps to the `cmf_PropertyType` *Data Type* field. Editor is set in the **View**
(Default / List / Combo List). "Text" = long/multi-line string; "String" = single-line.

### 2.1 `Milestone`  — top element under the document root

| Property | Data Type | Editor | Required | List / Notes |
|----------|-----------|--------|----------|--------------|
| `stage` | List | Combo List | Yes | *Audit Milestone Stage* |
| `milestone_label` | String (128) | Default | No | Optional free-text descriptor |

> CMF maintains intrinsic element order, so the four milestones display in entry order. A
> `sort_order` integer is only needed if you want to reorder independently of creation order.

### 2.2 `Scope`  — child of Milestone

| Property | Data Type | Editor | Required | List / Notes |
|----------|-----------|--------|----------|--------------|
| `scope_name` | String (128) | Default | Yes | e.g. "Process Safety", "Structural Integrity" |
| `description` | Text | Default | No | Optional scope intro |

### 2.3 `Question`  — child of Scope

| Property | Data Type | Editor | Required | List / Notes |
|----------|-----------|--------|----------|--------------|
| `question_number` | String (32) | Default | Yes | Manual, or auto-stamp via the Name/onFormPopulate method |
| `question_text` | Text | Default | Yes | The question content |
| `guidance` | Text | Default | No | Acceptance criteria / reviewer guidance |
| `ref_text` | Text | Default | No | References as free text |
| `ref_document` | Item → *Document* / `tp_TechDoc` | Default | No | References as a live document link (confirm target ItemType) |
| `status` | List | Combo List | Yes | *Audit Question Status* — no default; blank until reviewed |
| `reviewer_comment` | Text | Default | No | Quick inline note; formal observation = child Finding |

### 2.4 `Finding`  — child of Question — **bound to the QMS Audit Finding**

This element is a **proxy** to the real QMS Audit Finding (business-object binding, not local
properties). The View surfaces the bound item's properties so the finding renders inside the
audit document.

| Surfaced (from bound Audit Finding) | Editor | Notes |
|-------------------------------------|--------|-------|
| `finding number` | Default (read-only) | From the BO |
| `description` | Default | From the BO |
| `classification / severity` | Default | From the BO |
| `state` | Default (read-only) | Lifecycle state of the Finding |

> Binding is a **soft link** — it will **not** appear in Where-Used. For hard traceability add a
> real relationship alongside the proxy (part of the deferred Unsatisfactory→Finding seam).

### 2.5 `Action`  — child of Finding — **bound to the QMS CAP action item**

Proxy to the corrective action under the CAP. Confirm the exact action ItemType in your instance
(CAP action / task) before binding.

| Surfaced (from bound action) | Editor | Notes |
|------------------------------|--------|-------|
| `action number` | Default (read-only) | From the BO |
| `description` | Default | From the BO |
| `owner / assignee` | Default | Item → Identity, from the BO |
| `status / state` | Default (read-only) | Lifecycle state |
| `due_date` | Default | From the BO |

---

## 3. Element binding (hierarchy)

```
eng_AuditDocument (root container)
└── Milestone        (stage: 10/30/60/90)
    └── Scope        (scope_name)
        └── Question (number, text, refs, status)
            └── Finding   ⟶ bound to QMS Audit Finding
                └── Action ⟶ bound to QMS CAP action
```

- Add each binding on the **Content Type → element binding** step, parent → child.
- For `Finding` and `Action`, use the **business-object reference binding**, not plain properties.

---

## 4. View configuration

- Build a single tree/tabular View covering the full hierarchy; map columns to the properties
  above and to the surfaced BO properties for Finding/Action.
- Set the cell editor per property: **Combo List** for `stage` and `status`, **Default** for the rest.
- **Status color-coding** (the "intuitive" requirement): apply `cmf_Style` cell styles on `status`
  — Unsatisfactory red, Notable amber, Satisfactory green, Not Applicable grey.
- **Gotcha:** any parallel element structure without a shared parent must live in its own View or
  the editor renders blank. The single-tree layout above avoids this.
- Optional: per-milestone filtered Views (10/30/60/90) if reviewers prefer one milestone at a time.

---

## 5. Build order

1. ItemType `eng_AuditDocument` + `onFormPopulated` method + Name property *(§0)*
2. Three Lists *(§1)*
3. Content Type, Linked ItemType = `eng_AuditDocument`
4. Element Types + Property Types *(§2)*
5. Element bindings, including the two BO bindings *(§3)*
6. View(s) + status styling *(§4)*
7. Run the metadata configuration check
8. Build one Released seed document per discipline → copy to start new audits
9. *(deferred)* Lifecycle + workflow gates at 10/30/60/90
10. *(deferred)* Unsatisfactory → auto-create Finding + hard relationship

---

## 6. Confirm before binding (open items)

- **Action ItemType:** exact QMS object the `Action` element binds to (CAP action vs. task).
- **`ref_document` target:** the ItemType auditors link to — native Document, `tp_TechDoc`, or both.
- **Question numbering:** manual string vs. auto-sequence in the Name method.
