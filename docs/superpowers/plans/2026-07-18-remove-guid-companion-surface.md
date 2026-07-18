# Remove Guid Companion Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the desktop companion poster from `/guid` and remove the sidebar "桌面伙伴" entry, while keeping the actual companion/settings features available in settings pages.

**Architecture:** Treat the guid homepage as a pure workspace launcher. Delete the homepage companion promo component and its CSS, then remove the sidebar Nomi entry so the desktop companion is only reachable from settings and existing direct routes. Keep the companion domain code and translations intact unless they are directly part of the removed surface.

**Tech Stack:** React, TypeScript, CSS Modules, Bun tests

---

### Task 1: Remove the guid homepage companion poster

**Files:**
- Modify: `ui/src/renderer/pages/guid/GuidPage.tsx`
- Delete: `ui/src/renderer/pages/guid/components/GuidCompanionPosterPreview.tsx`
- Modify: `ui/src/renderer/pages/guid/index.module.css`
- Test: `ui/src/renderer/pages/guid/GuidPage.advancedControls.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
expect(source.includes('GuidCompanionPosterPreview')).toBe(false);
expect(source.includes('conversation.companionPoster')).toBe(false);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test ui/src/renderer/pages/guid/GuidPage.advancedControls.test.ts`

- [ ] **Step 3: Write minimal implementation**

```tsx
// remove GuidCompanionPosterPreview import and render from GuidPage
// delete the component file
// delete its CSS block from index.module.css
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test ui/src/renderer/pages/guid/GuidPage.advancedControls.test.ts`

- [ ] **Step 5: Commit**

```bash
git add ui/src/renderer/pages/guid/GuidPage.tsx ui/src/renderer/pages/guid/components/GuidCompanionPosterPreview.tsx ui/src/renderer/pages/guid/index.module.css ui/src/renderer/pages/guid/GuidPage.advancedControls.test.ts
git commit -m "feat(guid): 移除桌面伙伴海报入口"
```

### Task 2: Remove the sidebar desktop companion entry

**Files:**
- Modify: `ui/src/renderer/components/layout/Sider/index.tsx`
- Modify: `ui/src/renderer/components/layout/Sider/SiderNav/index.ts`
- Delete: `ui/src/renderer/components/layout/Sider/SiderNav/SiderNomiEntry.tsx`
- Test: `ui/src/renderer/components/layout/Sider/capabilityHubNav.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
expect(siderSource.includes('SiderNomiEntry')).toBe(false);
expect(siderSource.includes("navTo('/nomi')")).toBe(false);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test ui/src/renderer/components/layout/Sider/capabilityHubNav.test.ts`

- [ ] **Step 3: Write minimal implementation**

```tsx
// remove the SiderNomiEntry import, handler and render from Sider/index.tsx
// remove its export from SiderNav/index.ts
// delete SiderNomiEntry.tsx
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test ui/src/renderer/components/layout/Sider/capabilityHubNav.test.ts`

- [ ] **Step 5: Commit**

```bash
git add ui/src/renderer/components/layout/Sider/index.tsx ui/src/renderer/components/layout/Sider/SiderNav/index.ts ui/src/renderer/components/layout/Sider/SiderNav/SiderNomiEntry.tsx ui/src/renderer/components/layout/Sider/capabilityHubNav.test.ts
git commit -m "feat(sider): 移除桌面伙伴导航入口"
```
