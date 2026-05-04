## Goal

Make the Analytics page a true command center, rebuild Trackable Assets into a richer device operations console, deepen battery telemetry, and ship a set of high-impact polish fixes across the app.

---

## 1. Analytics — full rebuild

Replace the current 3-chart page with a multi-tab analytics workspace.

**Filter bar (top, sticky):** date range presets (7d, 30d, 90d, 6mo, 12mo, custom) + department filter + employee filter. All charts react to it.

**KPI strip (8 cards):** Visitors today / week / month, Unique returning visitors %, Active staff right now (clocked in), Avg attendance hours/day, Tasks completed this week, On-time clock-in rate, Devices in use right now, Overdue tasks.

**Tabs:**
- **Overview** — KPI strip + 30-day combined activity sparkline (visitors, attendance, tasks, device usage on one chart)
- **People & Attendance** — daily clock-in trend, hours by department (stacked bar), top 10 contributors by hours (horizontal bar), late arrivals heatmap (day-of-week × hour)
- **Tasks** — status funnel (todo → in_progress → done → approved), avg cycle time, by-priority pie, by-assignee leaderboard, overdue list
- **Visitors** — daily traffic line, hour-of-day histogram (peak hours), top hosts, repeat-visit ratio donut, top companies
- **Assets & Resources** — device utilisation %, hours-in-use per device (bar), top users of devices, low-battery alerts, currently-issued list
- **Inventory** — checkouts trend, top borrowed items, currently-out items, items needing return >24h

**Export:** every tab gets a "Download CSV" button. Add "Download full report (CSV bundle as .zip-style multi-file)" — implement as one consolidated CSV per tab.

---

## 2. Trackable Assets — rebuild

Keep table but add a richer layout above it.

**Top:** 4 KPIs (Total / In Use / In Safe / Low Battery) + a *Live Fleet Health* card showing battery distribution (Critical <20, Low 20-40, Healthy 40+) as a stacked bar.

**New: Asset Detail Drawer** — click any row to open a side sheet with full session history (last 20), total hours used this month, top 5 users, current battery sparkline (last 24h of telemetry), maintenance notes, edit/delete.

**New tab: Utilisation** — bar chart of hours-in-use per asset (last 7/30 days), and "Most active devices" leaderboard.

**Filter improvements:** type tabs + status filter (All / In Use / In Safe / Low Battery / Stale Telemetry) + search by tag/name/serial/current user.

**Bulk actions (admin):** bulk return, bulk move location.

**Alerts:** in-page alert banner if any device <15% battery or telemetry stale >2h.

---

## 3. Battery telemetry — make it better

**What's possible (and what's not — be honest):**
- Web Battery API works on most Chromium browsers (Chrome, Edge, Opera) and reports level + charging state. Firefox and Safari removed it. iPads/iPhones cannot report battery via the web.
- For iPads we can't get real battery; we'll mark them telemetry-N/A and rely on manual status.

**Improvements to ship:**
1. **History table** — new `asset_battery_history` table with periodic snapshots (every report). Lets us show 24h sparklines and detect rapidly-draining devices.
2. **Smarter reporting** — on the kiosk, only push when level changes ≥1%, charging state flips, or every 5 min (instead of every 60s) → less write load, more meaningful data.
3. **Health classification** — derive `battery_health` (`charging`, `healthy`, `low`, `critical`, `stale`, `unsupported`) server-side via a SQL view so all consumers agree.
4. **Stale detection** — surface "Stale" badge if `battery_updated_at` older than configurable `battery_stale_after_minutes` (already in app_settings — wire it in).
5. **Page Visibility handling** — pause reporting when tab hidden, force a fresh report on visibility return.
6. **Device kiosk upgrades**:
   - Show last-known-by-others banner (who used it last and when)
   - Big QR code linking to asset detail
   - "Lock screen" mode that keeps screen awake using the Wake Lock API so the kiosk stays alive
   - Manual "Report now" button
   - Display asset notes (e.g. "Charger missing")
7. **Low-battery notifications** — when an in-use device drops below 15%, insert a notification for the issuing admin and the current user.

---

## 4. Cross-module improvements

Targeted, high-value polish.

- **Notifications**: add toast + sound option in profile preferences; mark-all-read button; group by date.
- **Tasks**: add "My Tasks" quick filter on Dashboard; overdue badge color; ability to comment on a task (new `task_comments` table) so reassignments have context.
- **Inventory**: low-stock badge when `available_quantity ≤ 1`; auto-notify admin on checkout.
- **Front Desk**: "Currently in space" live count widget on Dashboard for admins.
- **Chat**: typing indicator + unread DM count badge in sidebar.
- **Duty Roster**: "My upcoming shifts" widget on Dashboard.
- **Accessibility/UX**: keyboard shortcuts (g+d dashboard, g+t tasks, etc.), command palette (cmd-k) for quick navigation.
- **Security pass**: re-run linter and fix any new warnings introduced by the migrations below.

---

## Technical notes

**New tables (migration):**
```sql
asset_battery_history(id, asset_id, level, charging, recorded_at)
task_comments(id, task_id, user_id, content, created_at)
```
Both with RLS: authenticated read for assets/tasks they can see, insert restricted to authenticated users.

**New view:**
```sql
asset_health_v -- classification + minutes_since_update
```

**Files to touch:**
- Rewrite: `src/pages/Analytics.tsx`, `src/pages/Assets.tsx`, `src/pages/DeviceKiosk.tsx`
- New: `src/components/AssetDetailDrawer.tsx`, `src/components/AnalyticsFilters.tsx`, `src/components/CommandPalette.tsx`
- Edit: `src/pages/Dashboard.tsx` (new widgets), `src/pages/Tasks.tsx` (comments), `src/components/AppLayout.tsx` (palette + shortcuts), `src/components/NotificationBell.tsx` (group + mark-all)

**Scope check:** This is large. If you'd like, I can ship in two passes:
- **Pass A (now):** Sections 1, 2, 3 — the explicitly requested rebuilds.
- **Pass B (next message):** Section 4 polish + command palette.

Reply "ship all" to do everything in one go, or "pass A only" to start with the rebuilds.
