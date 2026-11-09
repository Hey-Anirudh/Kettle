# Diagram Guide — SDD Generator

This file contains complete, ready-to-use Python rendering recipes for every diagram type
used in the SDD. All diagrams use `matplotlib` and `pillow`. No external graph libraries required.

Install dependencies before generating diagrams:
```bash
pip install matplotlib pillow --break-system-packages -q
```

---

## Shared Setup (always include at the top of your diagram generation script)

```python
import matplotlib
matplotlib.use('Agg')  # non-interactive backend — required for server/script use
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import os

# Output directory
DIAGRAM_DIR = "/tmp/sdd_diagrams"
os.makedirs(DIAGRAM_DIR, exist_ok=True)

# Colour palette (use consistently across ALL diagrams)
C_PRIMARY    = "#1F3864"   # dark blue — AI platform, primary components
C_SECONDARY  = "#2E75B6"   # medium blue — application backend, process steps
C_ACTOR      = "#C9A84C"   # gold — users / actors
C_EXTERNAL   = "#70AD47"   # green — external systems / integrations
C_DATABASE   = "#ED7D31"   # orange — databases / data stores
C_DECISION   = "#7030A0"   # purple — decision diamonds
C_SWIMLANE   = "#D5E8F0"   # light blue — swimlane header backgrounds
C_ARROW      = "#404040"   # dark grey — arrows
C_BG         = "#FAFAFA"   # near white — figure background
C_TEXT_LIGHT = "#FFFFFF"   # white — text on dark boxes
C_TEXT_DARK  = "#1A1A1A"   # near black — text on light boxes
C_BORDER     = "#CCCCCC"   # light grey — box borders
```

---

## 1. Workflow / Process Flow Diagram

**Used in:** Section 2 (Project Scope)
**Shows:** End-to-end process steps with decision points, start/end nodes, and directional arrows.

```python
def draw_workflow_diagram(steps, output_path, title="End-to-End Process Flow"):
    """
    steps: list of dicts, each with:
        { "label": str, "type": "process"|"decision"|"start"|"end" }
    Draws a top-to-bottom flowchart.
    """
    fig, ax = plt.subplots(figsize=(10, max(12, len(steps) * 1.4)))
    fig.patch.set_facecolor(C_BG)
    ax.set_facecolor(C_BG)
    ax.axis('off')
    ax.set_title(title, fontsize=13, fontweight='bold', color=C_PRIMARY, pad=16)

    box_w, box_h = 3.2, 0.55
    x_center = 5.0
    y_start  = len(steps) * 1.3
    gap      = 1.3

    positions = []
    for i, step in enumerate(steps):
        y = y_start - i * gap
        positions.append((x_center, y))
        label = step["label"]
        stype = step["type"]

        if stype == "start" or stype == "end":
            # Rounded pill
            color = C_PRIMARY
            ellipse = mpatches.Ellipse((x_center, y), box_w * 0.8, box_h * 0.9,
                                        facecolor=color, edgecolor=C_BORDER, linewidth=1.2, zorder=3)
            ax.add_patch(ellipse)
            ax.text(x_center, y, label, ha='center', va='center',
                    fontsize=9, fontweight='bold', color=C_TEXT_LIGHT, zorder=4)

        elif stype == "decision":
            # Diamond
            dx, dy = box_w * 0.55, box_h * 1.1
            diamond = plt.Polygon(
                [[x_center, y + dy], [x_center + dx, y],
                 [x_center, y - dy], [x_center - dx, y]],
                facecolor=C_DECISION, edgecolor=C_BORDER, linewidth=1.2, zorder=3)
            ax.add_patch(diamond)
            ax.text(x_center, y, label, ha='center', va='center',
                    fontsize=8, fontweight='bold', color=C_TEXT_LIGHT, zorder=4,
                    wrap=True)

        else:
            # Rectangle process box
            rect = FancyBboxPatch((x_center - box_w / 2, y - box_h / 2),
                                   box_w, box_h,
                                   boxstyle="round,pad=0.05",
                                   facecolor=C_SECONDARY, edgecolor=C_BORDER,
                                   linewidth=1.2, zorder=3)
            ax.add_patch(rect)
            ax.text(x_center, y, label, ha='center', va='center',
                    fontsize=9, color=C_TEXT_LIGHT, zorder=4,
                    wrap=True)

        # Arrow to next step
        if i < len(steps) - 1:
            y_arrow_start = y - (box_h * 0.6 if stype != "decision" else box_h * 1.15)
            y_arrow_end   = y_start - (i + 1) * gap + (box_h * 0.6)
            ax.annotate("", xy=(x_center, y_arrow_end), xytext=(x_center, y_arrow_start),
                        arrowprops=dict(arrowstyle="-|>", color=C_ARROW, lw=1.5), zorder=2)

    # Legend
    legend_elements = [
        mpatches.Patch(facecolor=C_PRIMARY,   label='Start / End'),
        mpatches.Patch(facecolor=C_SECONDARY, label='Process Step'),
        mpatches.Patch(facecolor=C_DECISION,  label='Decision'),
    ]
    ax.legend(handles=legend_elements, loc='lower right', fontsize=8,
              framealpha=0.9, edgecolor=C_BORDER)

    ax.set_xlim(1.5, 8.5)
    ax.set_ylim(y_start - len(steps) * gap - 0.5, y_start + 1.0)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor=C_BG)
    plt.close()
    print(f"Saved: {output_path}")


# ── EXAMPLE CALL (adapt labels from BRD) ──────────────────────────
workflow_steps = [
    {"label": "START",                          "type": "start"},
    {"label": "Supervisor Initiates PIP Request","type": "process"},
    {"label": "System Validates Eligibility",   "type": "process"},
    {"label": "Eligible?",                      "type": "decision"},
    {"label": "Route to ER SPOC for Review",    "type": "process"},
    {"label": "ER SPOC Reviews Request",        "type": "process"},
    {"label": "Approved?",                      "type": "decision"},
    {"label": "Notify Employee of PIP",         "type": "process"},
    {"label": "Employee Acknowledges PIP",      "type": "process"},
    {"label": "Conduct Scheduled Reviews",      "type": "process"},
    {"label": "Complete PIP Closure Form",      "type": "process"},
    {"label": "Record PIP Outcome",             "type": "process"},
    {"label": "END",                            "type": "end"},
]
draw_workflow_diagram(
    workflow_steps,
    output_path=f"{DIAGRAM_DIR}/workflow_diagram.png",
    title="Figure 1: End-to-End Process Flow — HR PIP Automation"
)
```

---

## 2. System Architecture Diagram

**Used in:** Section 3 (System Overview)
**Shows:** All system layers — User, Application, AI Platform, Data, External Integrations — with labelled connections.

```python
def draw_architecture_diagram(components, connections, output_path, title="System Architecture"):
    """
    components: list of dicts:
        { "id": str, "label": str, "layer": str, "color": str, "x": float, "y": float }
    connections: list of dicts:
        { "from": str, "to": str, "label": str }
    """
    fig, ax = plt.subplots(figsize=(14, 9))
    fig.patch.set_facecolor(C_BG)
    ax.set_facecolor(C_BG)
    ax.axis('off')
    ax.set_title(title, fontsize=13, fontweight='bold', color=C_PRIMARY, pad=16)

    box_w, box_h = 2.2, 0.65
    pos = {}

    # Draw layer background bands
    layers = {
        "User Layer":        (0.0, 9.5, C_ACTOR,    0.08),
        "Application Layer": (0.0, 7.5, C_SECONDARY, 0.06),
        "AI Layer":          (0.0, 5.5, C_PRIMARY,   0.06),
        "Data Layer":        (0.0, 3.5, C_DATABASE,  0.06),
        "External Systems":  (0.0, 1.5, C_EXTERNAL,  0.06),
    }
    for layer_name, (x, y, color, alpha) in layers.items():
        band = FancyBboxPatch((0.2, y - 0.8), 13.6, 1.6,
                               boxstyle="round,pad=0.1",
                               facecolor=color, alpha=alpha,
                               edgecolor=color, linewidth=0.5, zorder=1)
        ax.add_patch(band)
        ax.text(0.4, y, layer_name, fontsize=8, color=color,
                fontweight='bold', va='center', alpha=0.7, zorder=2)

    # Draw component boxes
    for comp in components:
        x, y = comp["x"], comp["y"]
        pos[comp["id"]] = (x, y)
        color = comp.get("color", C_SECONDARY)
        rect = FancyBboxPatch((x - box_w / 2, y - box_h / 2),
                               box_w, box_h,
                               boxstyle="round,pad=0.08",
                               facecolor=color, edgecolor=C_BORDER,
                               linewidth=1.2, zorder=3)
        ax.add_patch(rect)
        ax.text(x, y, comp["label"], ha='center', va='center',
                fontsize=8.5, fontweight='bold', color=C_TEXT_LIGHT,
                zorder=4, wrap=True)

    # Draw connections
    for conn in connections:
        x1, y1 = pos[conn["from"]]
        x2, y2 = pos[conn["to"]]
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle="-|>", color=C_ARROW,
                                    lw=1.3, connectionstyle="arc3,rad=0.1"),
                    zorder=2)
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ax.text(mx, my + 0.12, conn.get("label", ""), fontsize=7,
                color=C_ARROW, ha='center', va='bottom', style='italic', zorder=5)

    # Legend
    legend_elements = [
        mpatches.Patch(facecolor=C_ACTOR,     label='User / Actor'),
        mpatches.Patch(facecolor=C_SECONDARY, label='Application'),
        mpatches.Patch(facecolor=C_PRIMARY,   label='AI Platform'),
        mpatches.Patch(facecolor=C_DATABASE,  label='Database'),
        mpatches.Patch(facecolor=C_EXTERNAL,  label='External System'),
    ]
    ax.legend(handles=legend_elements, loc='lower right', fontsize=8,
              framealpha=0.9, edgecolor=C_BORDER)

    ax.set_xlim(0, 14)
    ax.set_ylim(0, 11)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor=C_BG)
    plt.close()
    print(f"Saved: {output_path}")


# ── EXAMPLE CALL (adapt from BRD) ─────────────────────────────────
arch_components = [
    # User Layer (y=9.5)
    {"id": "supervisor", "label": "Supervisor\n(Band 4D+)",  "layer": "User", "color": C_ACTOR,    "x": 3.5,  "y": 9.5},
    {"id": "er_spoc",    "label": "ER SPOC /\nTalent Mgr",  "layer": "User", "color": C_ACTOR,    "x": 7.0,  "y": 9.5},
    {"id": "employee",   "label": "Employee",                "layer": "User", "color": C_ACTOR,    "x": 10.5, "y": 9.5},
    # Application Layer (y=7.5)
    {"id": "app",        "label": "PIP Workflow\nApplication","layer": "App", "color": C_SECONDARY,"x": 7.0,  "y": 7.5},
    # AI Layer (y=5.5)
    {"id": "crewai",     "label": "CrewAI Enterprise\n(5 Crews / 18 Agents)", "layer": "AI", "color": C_PRIMARY, "x": 7.0, "y": 5.5},
    # Data Layer (y=3.5)
    {"id": "postgres",   "label": "PostgreSQL\nDatabase",   "layer": "Data", "color": C_DATABASE, "x": 5.0,  "y": 3.5},
    {"id": "audit",      "label": "Audit &\nNotif. Logs",   "layer": "Data", "color": C_DATABASE, "x": 9.0,  "y": 3.5},
    # External Systems (y=1.5)
    {"id": "hr_sys",     "label": "HR System\n(Employee API)","layer": "Ext","color": C_EXTERNAL, "x": 2.5,  "y": 1.5},
    {"id": "doc_mgmt",   "label": "Document\nManagement",   "layer": "Ext", "color": C_EXTERNAL, "x": 5.5,  "y": 1.5},
    {"id": "email",      "label": "Email /\nNotif. System", "layer": "Ext", "color": C_EXTERNAL, "x": 8.5,  "y": 1.5},
    {"id": "auth",       "label": "SSO / Active\nDirectory","layer": "Ext", "color": C_EXTERNAL, "x": 11.5, "y": 1.5},
]
arch_connections = [
    {"from": "supervisor", "to": "app",      "label": "Initiates PIP"},
    {"from": "er_spoc",    "to": "app",      "label": "Reviews / Approves"},
    {"from": "employee",   "to": "app",      "label": "Acknowledges"},
    {"from": "app",        "to": "crewai",   "label": "Triggers Crews"},
    {"from": "crewai",     "to": "postgres", "label": "Reads / Writes"},
    {"from": "crewai",     "to": "audit",    "label": "Logs Actions"},
    {"from": "crewai",     "to": "hr_sys",   "label": "Fetch Employee Data"},
    {"from": "crewai",     "to": "doc_mgmt", "label": "Store Attachments"},
    {"from": "crewai",     "to": "email",    "label": "Send Notifications"},
    {"from": "app",        "to": "auth",     "label": "Authenticate"},
]
draw_architecture_diagram(
    arch_components, arch_connections,
    output_path=f"{DIAGRAM_DIR}/arch_diagram.png",
    title="Figure 2: System Architecture — HR PIP Automation"
)
```

---

## 3. Data Flow Diagram (DFD)

**Used in:** Section 3 (System Overview)
**Shows:** Actors, processes, data stores, and labelled data flows between them.

```python
def draw_dfd(entities, processes, stores, flows, output_path, title="Data Flow Diagram"):
    """
    entities:  [{"id": str, "label": str, "x": float, "y": float}]  — external actors
    processes: [{"id": str, "label": str, "x": float, "y": float}]  — system processes
    stores:    [{"id": str, "label": str, "x": float, "y": float}]  — data stores
    flows:     [{"from": str, "to": str, "label": str}]             — data flows
    """
    fig, ax = plt.subplots(figsize=(14, 9))
    fig.patch.set_facecolor(C_BG)
    ax.set_facecolor(C_BG)
    ax.axis('off')
    ax.set_title(title, fontsize=13, fontweight='bold', color=C_PRIMARY, pad=16)

    pos = {}
    bw, bh = 2.0, 0.7

    # Draw external entities (rectangles, gold)
    for e in entities:
        pos[e["id"]] = (e["x"], e["y"])
        rect = FancyBboxPatch((e["x"] - bw/2, e["y"] - bh/2), bw, bh,
                               boxstyle="square,pad=0.05",
                               facecolor=C_ACTOR, edgecolor=C_BORDER, linewidth=1.5, zorder=3)
        ax.add_patch(rect)
        ax.text(e["x"], e["y"], e["label"], ha='center', va='center',
                fontsize=8.5, fontweight='bold', color=C_TEXT_LIGHT, zorder=4)

    # Draw processes (circles, blue)
    for p in processes:
        pos[p["id"]] = (p["x"], p["y"])
        circle = plt.Circle((p["x"], p["y"]), 0.75,
                              facecolor=C_SECONDARY, edgecolor=C_BORDER, linewidth=1.5, zorder=3)
        ax.add_patch(circle)
        ax.text(p["x"], p["y"], p["label"], ha='center', va='center',
                fontsize=7.5, fontweight='bold', color=C_TEXT_LIGHT, zorder=4)

    # Draw data stores (open-ended rectangles, orange)
    for s in stores:
        pos[s["id"]] = (s["x"], s["y"])
        # Open-ended rectangle: draw 3 sides only
        sw, sh = 2.2, 0.55
        ax.plot([s["x"] - sw/2, s["x"] - sw/2, s["x"] + sw/2, s["x"] + sw/2],
                [s["y"] - sh/2, s["y"] + sh/2, s["y"] + sh/2, s["y"] - sh/2],
                color=C_DATABASE, linewidth=2.0, zorder=3)
        ax.fill([s["x"] - sw/2, s["x"] - sw/2, s["x"] + sw/2, s["x"] + sw/2],
                [s["y"] - sh/2, s["y"] + sh/2, s["y"] + sh/2, s["y"] - sh/2],
                color=C_DATABASE, alpha=0.15, zorder=2)
        ax.text(s["x"], s["y"], s["label"], ha='center', va='center',
                fontsize=8, fontweight='bold', color=C_DATABASE, zorder=4)

    # Draw flows (arrows with labels)
    for f in flows:
        x1, y1 = pos[f["from"]]
        x2, y2 = pos[f["to"]]
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle="-|>", color=C_ARROW,
                                    lw=1.3, connectionstyle="arc3,rad=0.08"),
                    zorder=2)
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ax.text(mx, my + 0.15, f.get("label", ""), fontsize=7,
                color=C_ARROW, ha='center', va='bottom', style='italic',
                bbox=dict(facecolor=C_BG, edgecolor='none', alpha=0.7), zorder=5)

    # Legend
    legend_elements = [
        mpatches.Patch(facecolor=C_ACTOR,    label='External Actor'),
        mpatches.Patch(facecolor=C_SECONDARY,label='System Process'),
        mpatches.Patch(facecolor=C_DATABASE, label='Data Store', alpha=0.5),
    ]
    ax.legend(handles=legend_elements, loc='lower right', fontsize=8,
              framealpha=0.9, edgecolor=C_BORDER)

    ax.set_xlim(0, 14)
    ax.set_ylim(0, 10)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor=C_BG)
    plt.close()
    print(f"Saved: {output_path}")


# ── EXAMPLE CALL ──────────────────────────────────────────────────
dfd_entities  = [
    {"id": "sup",  "label": "Supervisor",   "x": 1.5, "y": 8.0},
    {"id": "er",   "label": "ER SPOC",      "x": 1.5, "y": 5.5},
    {"id": "emp",  "label": "Employee",     "x": 1.5, "y": 3.0},
    {"id": "hr",   "label": "HR System",    "x": 12.5,"y": 7.0},
    {"id": "email","label": "Email System", "x": 12.5,"y": 4.0},
]
dfd_processes = [
    {"id": "p1", "label": "PIP\nInitiation",  "x": 5.0, "y": 8.0},
    {"id": "p2", "label": "PIP\nReview",      "x": 5.0, "y": 5.5},
    {"id": "p3", "label": "PIP\nImplement",   "x": 5.0, "y": 3.0},
    {"id": "p4", "label": "PIP\nReviews",     "x": 9.0, "y": 6.5},
    {"id": "p5", "label": "PIP\nClosure",     "x": 9.0, "y": 3.5},
]
dfd_stores = [
    {"id": "db1", "label": "pip_requests",  "x": 7.0, "y": 8.5},
    {"id": "db2", "label": "pip_reviews",   "x": 7.0, "y": 5.0},
    {"id": "db3", "label": "audit_log",     "x": 7.0, "y": 2.0},
]
dfd_flows = [
    {"from": "sup",  "to": "p1",  "label": "PIP Form Data"},
    {"from": "p1",   "to": "db1", "label": "Store PIP Record"},
    {"from": "p1",   "to": "p2",  "label": "Route to ER SPOC"},
    {"from": "er",   "to": "p2",  "label": "Approval Decision"},
    {"from": "p2",   "to": "p3",  "label": "Approved PIP"},
    {"from": "p3",   "to": "emp", "label": "PIP Notification"},
    {"from": "emp",  "to": "p3",  "label": "Acknowledgement"},
    {"from": "p3",   "to": "p4",  "label": "Active PIP"},
    {"from": "p4",   "to": "db2", "label": "Review Feedback"},
    {"from": "p4",   "to": "p5",  "label": "Completed Reviews"},
    {"from": "p5",   "to": "db3", "label": "Closure Record"},
    {"from": "hr",   "to": "p1",  "label": "Employee Data"},
    {"from": "p2",   "to": "email","label": "Notifications"},
    {"from": "p4",   "to": "email","label": "Escalation Alerts"},
]
draw_dfd(
    dfd_entities, dfd_processes, dfd_stores, dfd_flows,
    output_path=f"{DIAGRAM_DIR}/dfd_diagram.png",
    title="Figure 3: Data Flow Diagram — HR PIP Automation"
)
```

---

## 4. Entity-Relationship (ER) Diagram

**Used in:** Section 5 (Database Design)
**Shows:** Database tables as entities with key fields and FK relationships.

```python
def draw_er_diagram(tables, relationships, output_path, title="Entity-Relationship Diagram"):
    """
    tables: list of dicts:
        { "id": str, "name": str, "fields": [str], "x": float, "y": float }
    relationships: list of dicts:
        { "from": str, "to": str, "label": str, "cardinality": str }
    """
    fig, ax = plt.subplots(figsize=(14, 10))
    fig.patch.set_facecolor(C_BG)
    ax.set_facecolor(C_BG)
    ax.axis('off')
    ax.set_title(title, fontsize=13, fontweight='bold', color=C_PRIMARY, pad=16)

    pos = {}
    tw, row_h, header_h = 2.8, 0.28, 0.45

    for tbl in tables:
        x, y = tbl["x"], tbl["y"]
        fields = tbl["fields"]
        total_h = header_h + len(fields) * row_h
        pos[tbl["id"]] = (x, y - total_h / 2)  # anchor = top-left of header

        # Header
        header = FancyBboxPatch((x - tw/2, y - header_h/2),
                                 tw, header_h,
                                 boxstyle="round,pad=0.04",
                                 facecolor=C_PRIMARY, edgecolor=C_BORDER,
                                 linewidth=1.2, zorder=3)
        ax.add_patch(header)
        ax.text(x, y, tbl["name"], ha='center', va='center',
                fontsize=8.5, fontweight='bold', color=C_TEXT_LIGHT, zorder=4)

        # Field rows
        for j, field in enumerate(fields):
            fy = y - header_h/2 - (j + 0.5) * row_h
            bg = C_BG if j % 2 == 0 else "#EEF4F8"
            row_rect = FancyBboxPatch((x - tw/2, fy - row_h/2),
                                       tw, row_h,
                                       boxstyle="square,pad=0.0",
                                       facecolor=bg, edgecolor=C_BORDER,
                                       linewidth=0.5, zorder=3)
            ax.add_patch(row_rect)
            ax.text(x - tw/2 + 0.12, fy, field, ha='left', va='center',
                    fontsize=7, color=C_TEXT_DARK, zorder=4)

        # Store centre position for arrows
        pos[tbl["id"]] = (x, y - (header_h + len(fields) * row_h) / 2)

    # Draw relationships
    for rel in relationships:
        x1, y1 = tables[[t["id"] for t in tables].index(rel["from"])]["x"], \
                  tables[[t["id"] for t in tables].index(rel["from"])]["y"]
        x2, y2 = tables[[t["id"] for t in tables].index(rel["to"])]["x"], \
                  tables[[t["id"] for t in tables].index(rel["to"])]["y"]
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle="-|>", color=C_SECONDARY,
                                    lw=1.5, connectionstyle="arc3,rad=0.1"),
                    zorder=2)
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ax.text(mx, my + 0.15, rel.get("cardinality", ""), fontsize=7.5,
                color=C_SECONDARY, ha='center', fontweight='bold', zorder=5)

    ax.set_xlim(0, 14)
    ax.set_ylim(0, 11)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor=C_BG)
    plt.close()
    print(f"Saved: {output_path}")


# ── EXAMPLE CALL ──────────────────────────────────────────────────
er_tables = [
    {"id": "pip_req",  "name": "pip_requests",        "fields": ["PK pip_id", "ohr_id", "band_level", "supervisor_id", "status", "pip_start_date", "pip_end_date"], "x": 3.5,  "y": 8.5},
    {"id": "pip_rev",  "name": "pip_review_approvals","fields": ["PK approval_id", "FK pip_id", "er_spoc_id", "action_taken", "comments"],                          "x": 10.5, "y": 8.5},
    {"id": "pip_ack",  "name": "pip_acknowledgements","fields": ["PK ack_id", "FK pip_id", "ack_type", "actor_id", "ack_method"],                                    "x": 3.5,  "y": 5.0},
    {"id": "pip_rvws", "name": "pip_reviews",         "fields": ["PK review_id", "FK pip_id", "review_number", "feedback_text", "escalated"],                       "x": 10.5, "y": 5.0},
    {"id": "pip_cls",  "name": "pip_closures",        "fields": ["PK closure_id", "FK pip_id", "outcome", "closure_submitted_on"],                                  "x": 3.5,  "y": 2.0},
    {"id": "notif",    "name": "notification_log",    "fields": ["PK notification_id", "FK pip_id", "recipient_id", "notification_type", "status"],                 "x": 10.5, "y": 2.0},
]
er_relationships = [
    {"from": "pip_req",  "to": "pip_rev",  "cardinality": "1 : N"},
    {"from": "pip_req",  "to": "pip_ack",  "cardinality": "1 : N"},
    {"from": "pip_req",  "to": "pip_rvws", "cardinality": "1 : N"},
    {"from": "pip_req",  "to": "pip_cls",  "cardinality": "1 : 1"},
    {"from": "pip_req",  "to": "notif",    "cardinality": "1 : N"},
]
draw_er_diagram(
    er_tables, er_relationships,
    output_path=f"{DIAGRAM_DIR}/er_diagram.png",
    title="Figure 4: Entity-Relationship Diagram — HR PIP Automation Data Model"
)
```

---

## 5. Deployment Architecture Diagram

**Used in:** Section 6 (Hardware & Software)
**Shows:** Cloud boundary, compute, data, networking, and external systems.

```python
def draw_deployment_diagram(output_path, title="Deployment Architecture"):
    fig, ax = plt.subplots(figsize=(14, 9))
    fig.patch.set_facecolor(C_BG)
    ax.set_facecolor(C_BG)
    ax.axis('off')
    ax.set_title(title, fontsize=13, fontweight='bold', color=C_PRIMARY, pad=16)

    def draw_boundary(ax, x, y, w, h, label, color, alpha=0.07, linestyle='--'):
        rect = FancyBboxPatch((x, y), w, h,
                               boxstyle="round,pad=0.15",
                               facecolor=color, alpha=alpha,
                               edgecolor=color, linewidth=1.5,
                               linestyle=linestyle, zorder=1)
        ax.add_patch(rect)
        ax.text(x + 0.2, y + h - 0.25, label, fontsize=8.5,
                color=color, fontweight='bold', va='top', zorder=2)

    def draw_box(ax, x, y, w, h, label, color, zorder=3):
        rect = FancyBboxPatch((x, y), w, h,
                               boxstyle="round,pad=0.08",
                               facecolor=color, edgecolor=C_BORDER,
                               linewidth=1.2, zorder=zorder)
        ax.add_patch(rect)
        ax.text(x + w/2, y + h/2, label, ha='center', va='center',
                fontsize=8, fontweight='bold', color=C_TEXT_LIGHT,
                zorder=zorder + 1, wrap=True)

    def draw_arrow(ax, x1, y1, x2, y2, label=""):
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle="-|>", color=C_ARROW, lw=1.3,
                                    connectionstyle="arc3,rad=0.05"), zorder=2)
        if label:
            ax.text((x1+x2)/2, (y1+y2)/2 + 0.1, label, fontsize=7,
                    color=C_ARROW, ha='center', style='italic', zorder=5)

    # Cloud boundary
    draw_boundary(ax, 0.5, 1.0, 9.5, 7.5, "Cloud Platform (AWS / Azure)", C_SECONDARY)

    # VPC boundary
    draw_boundary(ax, 1.0, 1.5, 8.5, 6.5, "VPC / Virtual Network", C_PRIMARY, alpha=0.05)

    # Compute
    draw_box(ax, 1.5, 6.5, 3.5, 0.8, "Load Balancer", C_SECONDARY)
    draw_box(ax, 1.5, 5.2, 3.5, 0.9, "PIP App Container\n(Python Backend)", C_SECONDARY)
    draw_box(ax, 1.5, 3.9, 3.5, 0.9, "CrewAI Enterprise\nAgent Runtime", C_PRIMARY)

    # Data
    draw_box(ax, 6.0, 5.2, 3.0, 0.9, "PostgreSQL\n(Managed DB)", C_DATABASE)
    draw_box(ax, 6.0, 3.9, 3.0, 0.9, "Secrets Manager\n(API Keys / Creds)", C_DATABASE)

    # External systems (outside cloud)
    draw_box(ax, 10.5, 7.0, 3.0, 0.8, "HR System\n(Employee API)", C_EXTERNAL)
    draw_box(ax, 10.5, 5.5, 3.0, 0.8, "Email /\nNotif. System", C_EXTERNAL)
    draw_box(ax, 10.5, 4.0, 3.0, 0.8, "Document\nManagement", C_EXTERNAL)
    draw_box(ax, 10.5, 2.5, 3.0, 0.8, "SSO / Active\nDirectory", C_EXTERNAL)

    # Users (top)
    draw_box(ax, 2.0, 8.5, 2.0, 0.7, "Supervisor", C_ACTOR)
    draw_box(ax, 4.5, 8.5, 2.0, 0.7, "ER SPOC", C_ACTOR)
    draw_box(ax, 7.0, 8.5, 2.0, 0.7, "Employee", C_ACTOR)

    # Arrows
    draw_arrow(ax, 3.0, 8.5, 3.25, 7.3, "HTTPS")
    draw_arrow(ax, 5.5, 8.5, 3.25, 7.3)
    draw_arrow(ax, 8.0, 8.5, 3.25, 7.3)
    draw_arrow(ax, 3.25, 6.5, 3.25, 6.1, "Routes")
    draw_arrow(ax, 3.25, 5.2, 3.25, 4.8, "Triggers")
    draw_arrow(ax, 5.0, 5.65, 6.0, 5.65, "SQL")
    draw_arrow(ax, 5.0, 4.35, 6.0, 4.35, "Fetch Secrets")
    draw_arrow(ax, 5.0, 4.1, 10.5, 7.4, "REST API")
    draw_arrow(ax, 5.0, 4.1, 10.5, 5.9, "SMTP")
    draw_arrow(ax, 5.0, 4.1, 10.5, 4.4, "REST API")
    draw_arrow(ax, 5.0, 4.1, 10.5, 2.9, "OAuth/SAML")

    ax.set_xlim(0, 14)
    ax.set_ylim(0, 10)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor=C_BG)
    plt.close()
    print(f"Saved: {output_path}")


draw_deployment_diagram(
    output_path=f"{DIAGRAM_DIR}/deployment_diagram.png",
    title="Figure 5: Deployment Architecture — HR PIP Automation"
)
```

---

## 6. Swimlane Diagram

**Used in:** Section 7 (Detailed System Design)
**Shows:** All actors in horizontal lanes with process steps and cross-lane handoffs.

```python
def draw_swimlane(lanes, steps, output_path, title="Swimlane Diagram"):
    """
    lanes: list of str — actor/role names, one per lane (top to bottom)
    steps: list of dicts:
        { "label": str, "lane": str, "col": int, "type": "process"|"decision" }
        col = horizontal position (0-based integer)
    """
    n_lanes = len(lanes)
    n_cols  = max(s["col"] for s in steps) + 1
    lane_h  = 2.0
    col_w   = 2.5
    label_w = 2.0

    fig_w = label_w + n_cols * col_w + 1.0
    fig_h = n_lanes * lane_h + 1.5

    fig, ax = plt.subplots(figsize=(fig_w, fig_h))
    fig.patch.set_facecolor(C_BG)
    ax.set_facecolor(C_BG)
    ax.axis('off')
    ax.set_title(title, fontsize=12, fontweight='bold', color=C_PRIMARY, pad=14)

    lane_y = {}
    for i, lane in enumerate(lanes):
        y_center = fig_h - 1.5 - i * lane_h - lane_h / 2
        lane_y[lane] = y_center

        # Lane background
        bg = C_SWIMLANE if i % 2 == 0 else "#EAF4FB"
        band = FancyBboxPatch((label_w, y_center - lane_h/2),
                               n_cols * col_w, lane_h,
                               boxstyle="square,pad=0.0",
                               facecolor=bg, edgecolor=C_BORDER,
                               linewidth=0.5, zorder=1)
        ax.add_patch(band)

        # Lane label
        label_bg = FancyBboxPatch((0, y_center - lane_h/2),
                                   label_w, lane_h,
                                   boxstyle="square,pad=0.0",
                                   facecolor=C_PRIMARY, edgecolor=C_BORDER,
                                   linewidth=0.5, zorder=2)
        ax.add_patch(label_bg)
        ax.text(label_w / 2, y_center, lane, ha='center', va='center',
                fontsize=8.5, fontweight='bold', color=C_TEXT_LIGHT,
                rotation=0, zorder=3)

    # Draw steps
    step_pos = {}
    bw, bh = 1.8, 0.6
    for step in steps:
        x = label_w + step["col"] * col_w + col_w / 2
        y = lane_y[step["lane"]]
        step_pos[step["label"]] = (x, y)

        if step["type"] == "decision":
            dx, dy = bw * 0.5, bh * 0.9
            diamond = plt.Polygon(
                [[x, y + dy], [x + dx, y], [x, y - dy], [x - dx, y]],
                facecolor=C_DECISION, edgecolor=C_BORDER, linewidth=1.2, zorder=3)
            ax.add_patch(diamond)
            ax.text(x, y, step["label"], ha='center', va='center',
                    fontsize=7, fontweight='bold', color=C_TEXT_LIGHT, zorder=4)
        else:
            rect = FancyBboxPatch((x - bw/2, y - bh/2), bw, bh,
                                   boxstyle="round,pad=0.06",
                                   facecolor=C_SECONDARY, edgecolor=C_BORDER,
                                   linewidth=1.2, zorder=3)
            ax.add_patch(rect)
            ax.text(x, y, step["label"], ha='center', va='center',
                    fontsize=7.5, color=C_TEXT_LIGHT, zorder=4)

    # Draw sequential arrows (col order within each lane, then cross-lane)
    sorted_steps = sorted(steps, key=lambda s: s["col"])
    for i in range(len(sorted_steps) - 1):
        s1, s2 = sorted_steps[i], sorted_steps[i + 1]
        x1, y1 = step_pos[s1["label"]]
        x2, y2 = step_pos[s2["label"]]
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle="-|>", color=C_ARROW,
                                    lw=1.2, connectionstyle="arc3,rad=0.0"),
                    zorder=2)

    ax.set_xlim(0, fig_w)
    ax.set_ylim(0, fig_h)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor=C_BG)
    plt.close()
    print(f"Saved: {output_path}")


# ── EXAMPLE CALL ──────────────────────────────────────────────────
swimlane_lanes = ["Supervisor", "ER SPOC / Talent Mgr", "Employee", "System / AI Platform"]
swimlane_steps = [
    {"label": "Initiate\nPIP Request",   "lane": "Supervisor",              "col": 0, "type": "process"},
    {"label": "Validate &\nRoute",        "lane": "System / AI Platform",    "col": 1, "type": "process"},
    {"label": "Review\nRequest",          "lane": "ER SPOC / Talent Mgr",   "col": 2, "type": "process"},
    {"label": "Approved?",                "lane": "ER SPOC / Talent Mgr",   "col": 3, "type": "decision"},
    {"label": "Notify\nEmployee",         "lane": "System / AI Platform",    "col": 4, "type": "process"},
    {"label": "Acknowledge\nPIP",         "lane": "Employee",                "col": 5, "type": "process"},
    {"label": "Schedule\nReviews",        "lane": "System / AI Platform",    "col": 6, "type": "process"},
    {"label": "Submit\nFeedback",         "lane": "Supervisor",              "col": 7, "type": "process"},
    {"label": "Acknowledge\nReview",      "lane": "Employee",                "col": 8, "type": "process"},
    {"label": "Complete\nClosure Form",   "lane": "Supervisor",              "col": 9, "type": "process"},
    {"label": "Record\nOutcome",          "lane": "System / AI Platform",    "col": 10,"type": "process"},
]
draw_swimlane(
    swimlane_lanes, swimlane_steps,
    output_path=f"{DIAGRAM_DIR}/swimlane_diagram.png",
    title="Figure 6: Swimlane Diagram — HR PIP Automation Overall Workflow"
)
```

---

## 7. Sequence Flow Diagram (per use case)

**Used in:** Section 7 (per use case sub-section)
**Shows:** Participants as vertical lifelines with numbered messages between them.

```python
def draw_sequence_diagram(participants, messages, output_path, title="Sequence Flow"):
    """
    participants: list of str — names of actors/systems (left to right)
    messages: list of dicts:
        { "from": str, "to": str, "label": str, "style": "solid"|"dashed" }
    """
    n_p = len(participants)
    n_m = len(messages)
    fig_w = max(10, n_p * 2.5)
    fig_h = max(8,  n_m * 0.9 + 2)

    fig, ax = plt.subplots(figsize=(fig_w, fig_h))
    fig.patch.set_facecolor(C_BG)
    ax.set_facecolor(C_BG)
    ax.axis('off')
    ax.set_title(title, fontsize=12, fontweight='bold', color=C_PRIMARY, pad=14)

    spacing = fig_w / (n_p + 1)
    p_x = {p: spacing * (i + 1) for i, p in enumerate(participants)}
    top_y = fig_h - 1.5
    box_h = 0.55

    # Draw participant boxes and lifelines
    for p, x in p_x.items():
        color = C_ACTOR if p in ["Supervisor", "ER SPOC", "Employee"] else C_PRIMARY
        rect = FancyBboxPatch((x - 1.0, top_y - box_h/2), 2.0, box_h,
                               boxstyle="round,pad=0.06",
                               facecolor=color, edgecolor=C_BORDER,
                               linewidth=1.2, zorder=3)
        ax.add_patch(rect)
        ax.text(x, top_y, p, ha='center', va='center',
                fontsize=8, fontweight='bold', color=C_TEXT_LIGHT, zorder=4)
        # Lifeline
        ax.plot([x, x], [top_y - box_h/2, 0.5],
                color=C_BORDER, linewidth=1.0, linestyle='--', zorder=1)

    # Draw messages
    msg_gap = (top_y - box_h/2 - 0.8) / max(n_m, 1)
    for i, msg in enumerate(messages):
        y = top_y - box_h/2 - (i + 0.7) * msg_gap
        x1 = p_x[msg["from"]]
        x2 = p_x[msg["to"]]
        style = "-|>" if msg.get("style", "solid") == "solid" else "->"
        ls    = "solid" if msg.get("style", "solid") == "solid" else "dashed"
        ax.annotate("", xy=(x2, y), xytext=(x1, y),
                    arrowprops=dict(arrowstyle=style, color=C_SECONDARY,
                                    lw=1.3, linestyle=ls), zorder=2)
        mx = (x1 + x2) / 2
        ax.text(mx, y + 0.12, f"{i+1}. {msg['label']}", ha='center', va='bottom',
                fontsize=7.5, color=C_TEXT_DARK,
                bbox=dict(facecolor=C_BG, edgecolor='none', alpha=0.8), zorder=5)

    ax.set_xlim(0, fig_w)
    ax.set_ylim(0, fig_h)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor=C_BG)
    plt.close()
    print(f"Saved: {output_path}")


# ── EXAMPLE CALL (UC1: PIP Request Initiation) ────────────────────
draw_sequence_diagram(
    participants=["Supervisor", "PIP App", "CrewAI", "HR System", "Email System"],
    messages=[
        {"from": "Supervisor",  "to": "PIP App",     "label": "Submit PIP Form",           "style": "solid"},
        {"from": "PIP App",     "to": "CrewAI",      "label": "Trigger Initiation Crew",   "style": "solid"},
        {"from": "CrewAI",      "to": "HR System",   "label": "Fetch Employee Data",        "style": "solid"},
        {"from": "HR System",   "to": "CrewAI",      "label": "Return Employee Record",     "style": "dashed"},
        {"from": "CrewAI",      "to": "PIP App",     "label": "Validation Result",          "style": "dashed"},
        {"from": "PIP App",     "to": "CrewAI",      "label": "Persist PIP Record",         "style": "solid"},
        {"from": "CrewAI",      "to": "Email System","label": "Notify ER SPOC",             "style": "solid"},
        {"from": "Email System","to": "Supervisor",  "label": "Confirmation Email",         "style": "dashed"},
    ],
    output_path=f"{DIAGRAM_DIR}/sequence_uc1.png",
    title="Figure 7.1: Sequence Flow — PIP Request Initiation"
)
```

---

## 8. Agent Interaction Diagram

**Used in:** Section 9 (Crew Details — Agentic AI / Both)
**Shows:** Crews as group boundaries, Agents inside each Crew, and inter-agent/inter-crew flows.

```python
def draw_agent_interaction(crews, output_path, title="Agent Interaction Diagram"):
    """
    crews: list of dicts:
        {
          "name": str,
          "agents": [str],   — agent names
          "x": float, "y": float,  — top-left of crew boundary
          "w": float, "h": float   — width and height of crew boundary
        }
    """
    fig, ax = plt.subplots(figsize=(14, 10))
    fig.patch.set_facecolor(C_BG)
    ax.set_facecolor(C_BG)
    ax.axis('off')
    ax.set_title(title, fontsize=13, fontweight='bold', color=C_PRIMARY, pad=16)

    agent_pos = {}
    aw, ah = 2.4, 0.55

    for crew in crews:
        cx, cy, cw, ch = crew["x"], crew["y"], crew["w"], crew["h"]
        # Crew boundary
        boundary = FancyBboxPatch((cx, cy), cw, ch,
                                   boxstyle="round,pad=0.15",
                                   facecolor=C_PRIMARY, alpha=0.07,
                                   edgecolor=C_PRIMARY, linewidth=1.8,
                                   linestyle='--', zorder=1)
        ax.add_patch(boundary)
        ax.text(cx + 0.2, cy + ch - 0.2, crew["name"],
                fontsize=8.5, fontweight='bold', color=C_PRIMARY,
                va='top', zorder=2)

        # Agents inside crew
        n_agents = len(crew["agents"])
        for j, agent in enumerate(crew["agents"]):
            ax_pos = cx + 0.4 + j * (aw + 0.3)
            ay_pos = cy + ch / 2 - ah / 2
            agent_pos[agent] = (ax_pos + aw/2, ay_pos + ah/2)

            rect = FancyBboxPatch((ax_pos, ay_pos), aw, ah,
                                   boxstyle="round,pad=0.06",
                                   facecolor=C_SECONDARY, edgecolor=C_BORDER,
                                   linewidth=1.2, zorder=3)
            ax.add_patch(rect)
            ax.text(ax_pos + aw/2, ay_pos + ah/2, agent,
                    ha='center', va='center', fontsize=7,
                    color=C_TEXT_LIGHT, fontweight='bold', zorder=4)

            # Arrow to next agent in same crew
            if j < n_agents - 1:
                next_ax = cx + 0.4 + (j+1) * (aw + 0.3)
                ax.annotate("", xy=(next_ax, ay_pos + ah/2),
                            xytext=(ax_pos + aw, ay_pos + ah/2),
                            arrowprops=dict(arrowstyle="-|>", color=C_ARROW, lw=1.2),
                            zorder=2)

    # Inter-crew arrows (sequential crew flow)
    crew_centers = [(c["x"] + c["w"]/2, c["y"] + c["h"]/2) for c in crews]
    for i in range(len(crews) - 1):
        x1, y1 = crew_centers[i]
        x2, y2 = crew_centers[i + 1]
        ax.annotate("", xy=(x2, y2 + crews[i+1]["h"]/2 + 0.1),
                    xytext=(x1, y1 - crews[i]["h"]/2 - 0.1),
                    arrowprops=dict(arrowstyle="-|>", color=C_PRIMARY,
                                    lw=2.0, linestyle='solid'),
                    zorder=2)

    ax.set_xlim(0, 14)
    ax.set_ylim(0, 11)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor=C_BG)
    plt.close()
    print(f"Saved: {output_path}")


# ── EXAMPLE CALL ──────────────────────────────────────────────────
agent_crews = [
    {"name": "Crew 1: PIP Initiation",        "agents": ["Eligibility\nValidation", "Record\nCreation", "Notification\nDispatch"],                                                    "x": 0.5, "y": 8.5, "w": 9.5, "h": 1.5},
    {"name": "Crew 2: PIP Review & Approval", "agents": ["Review\nOrchestration", "SLA\nMonitoring", "Notification\nDispatch"],                                                       "x": 0.5, "y": 6.5, "w": 9.5, "h": 1.5},
    {"name": "Crew 3: PIP Implementation",    "agents": ["Conversation\nFacilitation", "Form\nSubmission", "Acknowledgement\nTracking", "Notification\nDispatch"],                    "x": 0.5, "y": 4.5, "w": 12.5,"h": 1.5},
    {"name": "Crew 4: PIP Reviews",           "agents": ["Review\nScheduling", "Feedback\nCollection", "Escalation", "Ack\nTracking", "Notification\nDispatch"],                     "x": 0.5, "y": 2.5, "w": 12.5,"h": 1.5},
    {"name": "Crew 5: PIP Closure",           "agents": ["Closure\nMonitoring", "Closure\nForm", "Closure\nValidation", "Closure\nRecord", "Notification\nDispatch"],                "x": 0.5, "y": 0.5, "w": 12.5,"h": 1.5},
]
draw_agent_interaction(
    agent_crews,
    output_path=f"{DIAGRAM_DIR}/agent_interaction.png",
    title="Figure 8: Agent Interaction Diagram — HR PIP Automation Crew Architecture"
)
```

---

## 9. RAG Pipeline Diagram (GenAI / Both with RAG)

**Used in:** Section 9B (AI Model & Prompt Design)
**Condition:** Only when the solution uses Retrieval-Augmented Generation.

```python
def draw_rag_pipeline(output_path, title="RAG Pipeline Architecture"):
    fig, ax = plt.subplots(figsize=(14, 6))
    fig.patch.set_facecolor(C_BG)
    ax.set_facecolor(C_BG)
    ax.axis('off')
    ax.set_title(title, fontsize=12, fontweight='bold', color=C_PRIMARY, pad=14)

    # Query pipeline (top row)
    query_steps = [
        ("User Query",        C_ACTOR,     1.0),
        ("Query\nEmbedding",  C_SECONDARY, 3.2),
        ("Vector Store\nRetrieval", C_DATABASE, 5.4),
        ("Context\nAssembly", C_SECONDARY, 7.6),
        ("LLM\nPrompt",       C_PRIMARY,   9.8),
        ("LLM\nResponse",     C_PRIMARY,   12.0),
    ]
    bw, bh, y_q = 1.6, 0.7, 3.8
    for label, color, x in query_steps:
        rect = FancyBboxPatch((x - bw/2, y_q - bh/2), bw, bh,
                               boxstyle="round,pad=0.07",
                               facecolor=color, edgecolor=C_BORDER,
                               linewidth=1.2, zorder=3)
        ax.add_patch(rect)
        ax.text(x, y_q, label, ha='center', va='center',
                fontsize=8, fontweight='bold', color=C_TEXT_LIGHT, zorder=4)

    # Arrows between query steps
    for i in range(len(query_steps) - 1):
        x1 = query_steps[i][2] + bw/2
        x2 = query_steps[i+1][2] - bw/2
        ax.annotate("", xy=(x2, y_q), xytext=(x1, y_q),
                    arrowprops=dict(arrowstyle="-|>", color=C_ARROW, lw=1.3), zorder=2)

    # Indexing pipeline (bottom row)
    index_steps = [
        ("Source\nDocuments", C_EXTERNAL,  1.0),
        ("Text\nChunking",    C_SECONDARY, 3.2),
        ("Embedding\nModel",  C_SECONDARY, 5.4),
        ("Vector\nStore",     C_DATABASE,  7.6),
    ]
    y_i = 1.8
    for label, color, x in index_steps:
        rect = FancyBboxPatch((x - bw/2, y_i - bh/2), bw, bh,
                               boxstyle="round,pad=0.07",
                               facecolor=color, edgecolor=C_BORDER,
                               linewidth=1.2, zorder=3)
        ax.add_patch(rect)
        ax.text(x, y_i, label, ha='center', va='center',
                fontsize=8, fontweight='bold', color=C_TEXT_LIGHT, zorder=4)

    for i in range(len(index_steps) - 1):
        x1 = index_steps[i][2] + bw/2
        x2 = index_steps[i+1][2] - bw/2
        ax.annotate("", xy=(x2, y_i), xytext=(x1, y_i),
                    arrowprops=dict(arrowstyle="-|>", color=C_ARROW, lw=1.3), zorder=2)

    # Vertical arrow from Vector Store (index) to Vector Store Retrieval (query)
    ax.annotate("", xy=(5.4, y_q - bh/2), xytext=(7.6, y_i + bh/2),
                arrowprops=dict(arrowstyle="-|>", color=C_DATABASE, lw=1.5,
                                linestyle='dashed'), zorder=2)

    # Lane labels
    ax.text(0.1, y_q, "Query\nPipeline", fontsize=8, color=C_SECONDARY,
            fontweight='bold', va='center', rotation=90)
    ax.text(0.1, y_i, "Indexing\nPipeline", fontsize=8, color=C_EXTERNAL,
            fontweight='bold', va='center', rotation=90)

    ax.set_xlim(0, 14)
    ax.set_ylim(0.5, 5.5)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor=C_BG)
    plt.close()
    print(f"Saved: {output_path}")


# draw_rag_pipeline(
#     output_path=f"{DIAGRAM_DIR}/rag_pipeline.png",
#     title="Figure 8: RAG Pipeline Architecture"
# )
# (Uncomment when RAG is applicable)
```

---

## Embedding All Diagrams into the .docx

**Always use `smart_embed_diagram()` — never use a plain `add_picture()` call.**

This function solves two problems automatically:
1. **Width overflow** — scales the image down if it would exceed the usable page width (6.0 inches)
2. **Height overflow** — inserts a page break before the diagram if its rendered height would exceed 7.5 inches

```python
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from PIL import Image


def insert_page_break(doc):
    """Insert a Word page break as a paragraph."""
    p = doc.add_paragraph()
    run = p.add_run()
    br = OxmlElement('w:br')
    br.set(qn('w:type'), 'page')
    run._r.append(br)


def smart_embed_diagram(doc, image_path, caption_text,
                        target_width_inches=6.0,
                        max_width_inches=6.0,
                        page_height_threshold=7.5):
    """
    Safely embeds a diagram PNG into the Word document.

    Handles two overflow scenarios:
    ─────────────────────────────────────────────────────────────
    1. WIDTH OVERFLOW
       Measures the PNG pixel dimensions and computes the aspect
       ratio (height / width).
       • If the image is portrait (aspect > 1), the rendered
         height at target_width would exceed the page — so the
         width is reduced so that height ≤ page_height_threshold.
       • The final width is always capped at max_width_inches.

    2. HEIGHT OVERFLOW
       After computing the safe width, estimates the rendered
       height = safe_width × aspect.
       • If estimated height > page_height_threshold (default 7.5"),
         a page break is inserted BEFORE the diagram so it starts
         on a fresh page with maximum vertical space.
    ─────────────────────────────────────────────────────────────

    Parameters
    ----------
    doc                   : python-docx Document object
    image_path            : str — absolute path to the PNG file
    caption_text          : str — italic caption shown below the image
    target_width_inches   : float — desired embed width (default 6.0)
    max_width_inches      : float — hard cap on embed width (default 6.0)
    page_height_threshold : float — max rendered height before page break
                            is inserted (default 7.5 inches)
    """
    # ── 1. Measure image ──────────────────────────────────────────
    with Image.open(image_path) as img:
        px_w, px_h = img.size
    aspect = px_h / px_w  # > 1 means portrait (taller than wide)

    # ── 2. Compute safe width ─────────────────────────────────────
    width = min(target_width_inches, max_width_inches)

    if aspect > 1.0:
        # Reduce width so rendered height stays within one page
        max_w_for_height = page_height_threshold / aspect
        width = min(width, max_w_for_height)

    width = min(width, max_width_inches)  # final hard cap

    # ── 3. Estimate rendered height ───────────────────────────────
    est_height = width * aspect

    # ── 4. Page break if diagram is too tall ──────────────────────
    if est_height > page_height_threshold:
        insert_page_break(doc)

    # ── 5. Spacing before ─────────────────────────────────────────
    doc.add_paragraph()

    # ── 6. Embed image ────────────────────────────────────────────
    img_para = doc.add_paragraph()
    img_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    img_para.add_run().add_picture(image_path, width=Inches(width))

    # ── 7. Caption ────────────────────────────────────────────────
    cap_para = doc.add_paragraph()
    cap_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap_run = cap_para.add_run(caption_text)
    cap_run.italic = True
    cap_run.font.size = Pt(9)
    cap_run.font.color.rgb = RGBColor.from_string("555555")

    # ── 8. Spacing after ──────────────────────────────────────────
    doc.add_paragraph()
```

### Default target widths per diagram type

Pass these as `target_width_inches` to `smart_embed_diagram()`:

| Diagram Type | `target_width_inches` |
|---|---|
| Architecture, DFD, Swimlane, Deployment | `6.0` |
| Sequence Flow | `5.5` |
| ER Diagram | `5.0` |
| Agent Interaction | `5.5` |
| Workflow / Process Flow | `4.8` |
| RAG Pipeline | `5.5` |
| Component / Module diagrams | `6.0` |
| Pipeline / Job diagrams | `6.0` |

### Example usage

```python
# Instead of:
#   img_para.add_run().add_picture(path, width=Inches(6.0))  ← NEVER do this

# Always use:
smart_embed_diagram(
    doc,
    image_path=f"{DIAGRAM_DIR}/arch_diagram.png",
    caption_text="Figure 2: System Architecture — My Project",
    target_width_inches=6.0
)

smart_embed_diagram(
    doc,
    image_path=f"{DIAGRAM_DIR}/workflow_diagram.png",
    caption_text="Figure 1: End-to-End Process Flow — My Project",
    target_width_inches=4.8   # workflow diagrams are often tall/portrait
)
```

### How the auto-scaling works — worked examples

**Example A — Wide landscape diagram (arch_diagram.png, 2100×1350 px)**
- aspect = 1350/2100 = 0.643 (landscape, wider than tall)
- target_width = 6.0 → est_height = 6.0 × 0.643 = 3.86" → fits on page
- Result: embedded at 6.0" wide, no page break needed

**Example B — Tall portrait diagram (workflow_diagram.png, 900×2800 px)**
- aspect = 2800/900 = 3.11 (very tall portrait)
- target_width = 4.8 → est_height = 4.8 × 3.11 = 14.9" → exceeds 7.5"
- Auto-reduce: max_w_for_height = 7.5 / 3.11 = 2.41"
- Result: embedded at 2.41" wide, page break inserted before it

**Example C — Moderately tall diagram (swimlane_diagram.png, 3200×2200 px)**
- aspect = 2200/3200 = 0.688
- target_width = 6.0 → est_height = 6.0 × 0.688 = 4.13" → fits on page
- Result: embedded at 6.0" wide, no page break needed
