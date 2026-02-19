# Database Schema Documentation

This document describes the Supabase database schema for the My Memo application, including entity relationships, table definitions, and critical business logic for data integrity.

---

## 1. Entity Relationship Overview

```
auth.users (Supabase Auth)
    │
    ├── profiles (1:1) ───────── User settings (app_title)
    │
    ├── tabs (1:N) ───────────── Categories (Job, Family, Personal, etc.)
    │       │
    │       └── mytask (N:1) ─── Tasks belong to one tab
    │
    └── mytask (direct) ──────── All tasks scoped by user_id
```

| Entity | Relationship | Description |
|--------|--------------|-------------|
| **profiles** | 1:1 with `auth.users` | User-specific application settings. One row per authenticated user. |
| **tabs** | N:1 with `auth.users` | User-owned categorization containers. Tasks are grouped under tabs. |
| **mytask** | N:1 with `tabs`, N:1 with `auth.users` | Core task records. Each task belongs to one tab and one user. |

**Key Constraints:**
- All tables enforce Row Level Security (RLS) scoped to `auth.uid()`.
- `profiles.id` = `auth.users.id` (primary key, CASCADE on user delete).
- `mytask.tab_id` references a tab; when the tab is deleted, tasks are soft-deleted (not hard-deleted).

---

## 2. Table Definitions

### 2.1 `profiles`

User-specific application settings. Used for the editable app title (e.g., "Today's Tasks").

| Name | Type | Description | Key |
|------|------|-------------|-----|
| `id` | UUID | References `auth.users(id)`. Primary key. | PK, FK → auth.users |
| `app_title` | TEXT | Custom application title. Default: `'Today''s Tasks'`. | — |

**Migration:** `20260211_add_profiles_app_title.sql`

**RLS Policies:** SELECT, INSERT, UPDATE — own row only (`id = auth.uid()`).

---

### 2.2 `tabs`

Categorization system for organizing tasks. Ordered by `order_index`.

| Name | Type | Description | Key |
|------|------|-------------|-----|
| `id` | SERIAL / INTEGER | Primary key. | PK |
| `title` | TEXT | Display name of the tab (e.g., "Job", "Family"). | — |
| `created_at` | TIMESTAMPTZ | Creation timestamp. | — |
| `order_index` | INTEGER | Sort order for tab bar display. | — |
| `user_id` | UUID | References `auth.users(id)`. Owner of the tab. | FK → auth.users |

**Migration:** `20260211_add_user_auth_rls.sql` (adds `user_id`).

**Default Categories:** New users receive `Job`, `Family`, `Personal` when no tabs exist.

**Virtual System Tab:** The "All" tab (ID = -1) is not stored in the database; it is a client-side virtual tab that aggregates tasks across all user tabs.

---

### 2.3 `mytask`

Core task table. Supports soft delete, completion tracking, and tab reconstruction memory.

| Name | Type | Description | Key |
|------|------|-------------|-----|
| `id` | SERIAL / INTEGER | Primary key. | PK |
| `text` | TEXT | Task content (displayed to user). | — |
| `is_completed` | BOOLEAN | Completion status. | — |
| `created_at` | TIMESTAMPTZ | Creation timestamp. | — |
| `completed_at` | TIMESTAMPTZ | When the task was marked complete. Null if not completed. | — |
| `tab_id` | INTEGER | Foreign key to `tabs.id`. Task's category. | FK → tabs |
| `order_index` | INTEGER | Sort order within the tab. | — |
| `user_id` | UUID | References `auth.users(id)`. Owner of the task. | FK → auth.users |
| `deleted_at` | TIMESTAMPTZ | **Soft delete.** When set, task is in Trash. Null = active. | — |
| `last_tab_title` | TEXT | **Reconstruction memory.** Tab name at time of soft delete. Used when restoring to recreate a deleted tab. | — |

**Migrations:**
- `20260211_add_user_auth_rls.sql` — `user_id`
- `20260211_add_deleted_at.sql` — `deleted_at`
- `20260211_add_completed_at.sql` — `completed_at`
- `20260211_add_last_tab_title.sql` — `last_tab_title`

---

## 3. Special Logic Documentation

### 3.1 Soft Delete Cascade

When a user deletes a tab, associated tasks are **not** hard-deleted. Instead, they are moved to the Trash via a bulk soft delete.

**Trigger:** `deleteTab(id)` in `useTabs.ts`

**Sequence:**

1. **Identify tab title** (before deletion):
   ```ts
   const targetTabTitle = tabs.find(t => t.id === id)?.title ?? 'Recovered';
   ```

2. **Bulk update `mytask`** — Soft delete all tasks in the tab and store the tab name:
   ```sql
   UPDATE mytask
   SET deleted_at = :now, last_tab_title = :targetTabTitle
   WHERE tab_id = :id
     AND user_id = :userId
     AND deleted_at IS NULL;
   ```

3. **Delete the tab**:
   ```sql
   DELETE FROM tabs WHERE id = :id AND user_id = :userId;
   ```

**Result:** Tasks appear in the Trash view and can be restored. The `last_tab_title` value enables Intelligent Reconstruction when the original tab no longer exists.

---

### 3.2 Intelligent Tab Reconstruction

When restoring a task from Trash, the system may need to recreate a tab that was deleted.

**Trigger:** `restoreTask(task)` in `useTasks.ts`

**Flow:**

1. **Check if original tab exists:**
   - If `task.tab_id` is in the user's current `tabIds` → restore to that tab.

2. **If tab is missing** (tab was deleted):
   - Use `task.last_tab_title` (or `'Recovered'` if null).
   - Call `ensureTabExists(title)`:
     - Search for an existing tab with `title === last_tab_title`.
     - If found → use that tab's `id`.
     - If not found → **create a new tab** with that title, append to `tabs`, return new `id`.

3. **Update the task:**
   ```sql
   UPDATE mytask
   SET deleted_at = NULL, tab_id = :targetTabId
   WHERE id = :taskId AND user_id = :userId;
   ```

**Result:** The task is restored to its original tab (if it exists) or to a newly created tab with the same name.

---

### 3.3 Orphan Rescue

Tasks whose `tab_id` points to a non-existent tab (e.g., from legacy data or failed migrations) are "orphaned" and invisible in the UI.

**Trigger:** One-time run when `tabIds` is available (in `useTasks.ts`).

**Logic:**

1. Fetch all active tasks (`deleted_at IS NULL`) for the user.
2. Filter: `tab_id IS NULL` OR `tab_id NOT IN (user's tab ids)`.
3. Bulk update:
   ```sql
   UPDATE mytask
   SET deleted_at = :now, last_tab_title = 'Recovered'
   WHERE id IN (:orphanIds)
     AND user_id = :userId
     AND deleted_at IS NULL;
   ```

**Result:** Orphaned tasks move to Trash. When restored, they go into a "Recovered" tab.

---

## 4. Data Retention Policy

| Data Type | Policy |
|-----------|--------|
| **Active tasks** (`deleted_at IS NULL`) | Permanent. Never auto-deleted. |
| **Trash tasks** (`deleted_at IS NOT NULL`) | 30-day retention. UI hides items older than 30 days; a cron job may permanently purge them. |

---

## 5. Design Decisions

### Why Soft Deletes?

- **User safety:** Accidental tab deletion does not destroy task data. Tasks move to Trash and can be restored.
- **Audit trail:** `deleted_at` provides a clear marker for "removed" items.
- **Reversibility:** Restore flow uses `last_tab_title` to reconstruct the original tab when needed.

### Why `last_tab_title`?

- **Tab reconstruction:** When a tab is deleted, its name is lost. Storing `last_tab_title` on each task allows the restore flow to recreate a tab with the same name.
- **Orphan recovery:** Orphaned tasks (e.g., from legacy data) get `last_tab_title = 'Recovered'`, so they can be restored into a "Recovered" tab.

### Why User-Scoped Queries?

- All `mytask` and `tabs` queries include `.eq('user_id', userId)` for defense-in-depth alongside RLS.
- Ensures strict data isolation between users.

---

## 6. Migration Order

Apply migrations in this order:

1. `20260211_add_user_auth_rls.sql` — `user_id`, RLS
2. `20260211_add_deleted_at.sql` — `deleted_at`
3. `20260211_add_completed_at.sql` — `completed_at`
4. `20260211_add_profiles_app_title.sql` — `profiles` table
5. `20260211_add_last_tab_title.sql` — `last_tab_title`

---

*Last updated: February 2025*
