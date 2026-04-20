# RoomBoard Settings Save Model

## Scope Types
- `This window only`: temporary appearance and view preferences that should not affect other users or tabs.
- `My defaults`: account-level preferences that should follow the signed-in user.
- `Clinic-wide`: shared operational settings that affect all staff in the practice.

## Current Shared Save Paths
- Rooms: clinic-wide
- Doctors and doctor initials: clinic-wide
- Color labels and default color label: clinic-wide
- Practice defaults snapshot: clinic-wide
- Board state: clinic-wide

## Current Personal Save Paths
- Timer alerts: my defaults
- Font sizes: my defaults
- Theme selection: my defaults

## Current Window-Only Save Paths
- Display-only active toggle: this window only
- Display sort mode: this window only
- Doctor highlight selection: this window only
- Display layout mode: this window only
- Display card scale and display text override colors: this window only

## Notes
- The board is now split into separate HTML, CSS, and JavaScript files under `public/roomboard`.
- JavaScript is grouped by responsibility into `compat`, `board-state`, `rendering`, `settings`, `auth-sync`, `ux`, and `theme`.
- The smoke-test checklist for validating these save paths lives in `smoke-test-checklist.md`.
