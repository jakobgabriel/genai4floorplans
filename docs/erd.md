# FlowPlan — Entity-Relationship Diagram

The FlowPlan API (Express + Prisma + Postgres) is multi-tenant: a **User** joins
one or more **Teams** via a **Membership** (role OWNER/EDITOR/VIEWER); a Team owns
**Workspaces**, the shared **Subflows**, and its **custom Library entries**. Within
a Workspace the planning tree is **Folder › Concept › Layout(Cell)**, with
**Scenarios** as saved variants. Domain models (a Cell's/Scenario's `Model`, a
LibraryEntry's `ProcessCatalogEntry`, a Subflow's payload) are stored as JSON —
`@flowplan/core` owns their intra-JSON schema evolution, so a `SCHEMA_VERSION`
bump needs no Prisma migration.

The process **Library** is a global seed catalog (`LibraryEntry.teamId = null`)
plus per-team custom entries (`teamId` set). AI credentials/usage are team-scoped.

```mermaid
erDiagram
  User ||--o{ Membership : has
  Team ||--o{ Membership : has
  Team ||--o{ Workspace : owns
  Team ||--o{ Subflow : owns
  Team ||--o{ LibraryEntry : "owns (custom)"
  Team ||--o{ TeamAiCredential : has
  Team ||--o{ AiUsageLog : has
  User ||--o{ AiUsageLog : made

  Workspace ||--o{ Folder : contains
  Workspace ||--o{ Concept : contains
  Workspace ||--o{ Cell : contains
  Workspace ||--o{ Scenario : contains

  Folder ||--o{ Folder : "nests (parentId)"
  Folder ||--o{ Concept : "holds"
  Folder ||--o{ Cell : "holds"
  Folder ||--o{ Scenario : "holds"
  Concept ||--o{ Cell : "holds (layouts)"

  User {
    string id PK
    string email UK
    string name
    string passwordHash "null = OAuth-only"
  }
  Team {
    string id PK
    string name
  }
  Membership {
    string id PK
    string userId FK
    string teamId FK
    Role   role "OWNER|EDITOR|VIEWER"
  }
  Workspace {
    string id PK
    string teamId FK
    string name
    string activeId "soft ref to Cell.id"
  }
  Folder {
    string id PK
    string workspaceId FK
    string parentId FK "null = root"
    string name
    int    position
  }
  Concept {
    string id PK
    string workspaceId FK
    string folderId FK "null = root"
    string name
    int    position
  }
  Cell {
    string id PK
    string workspaceId FK
    string conceptId FK "owning concept"
    string folderId FK "mirrors concept folder"
    string name
    int    schemaVersion
    json   model "the full Model"
    int    position
  }
  Scenario {
    string id PK
    string workspaceId FK
    string folderId FK
    string name
    int    schemaVersion
    json   model
  }
  LibraryEntry {
    string id PK
    string teamId FK "null = GLOBAL catalog"
    json   entry "ProcessCatalogEntry"
  }
  Subflow {
    string id PK
    string teamId FK
    string name
    json   data "member stations + flows"
  }
  TeamAiCredential {
    string id PK
    string teamId FK
    AiProviderId provider
    string model
    bytes  keyCiphertext
  }
  AiUsageLog {
    string id PK
    string teamId FK
    string userId FK
    AiCapability capability
    boolean ok
  }
```

## Cascade & integrity rules
- Deleting a **Team** cascades to its Memberships, Workspaces (and everything
  inside), Subflows, custom LibraryEntries, and AI creds/usage.
- Deleting a **Workspace** cascades to its Folders, Concepts, Cells, Scenarios.
- Deleting a **Folder** reparents its child folders, concepts, cells and
  scenarios up one level (handled in the route; `SetNull` FK backstop).
- Deleting a **Concept** cascades to its Cells (a layout can't exist without a
  concept).
- **Global** LibraryEntries (`teamId = null`) are read-only over the API; only a
  team's own custom entries can be edited or deleted.
