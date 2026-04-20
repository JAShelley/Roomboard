# RoomBoard Smoke Test Checklist

## Auth and Access
- Open the board over `http://localhost` and confirm the board loads.
- Log in with `Remember me` checked and confirm the session survives a reload.
- Log in with `Remember me` unchecked and confirm the session is limited to the current tab session.
- Log out and confirm the clinic banner, sync state, and board reset to guest mode.

## Shared Clinic Settings
- Add a room and confirm it appears immediately and survives refresh.
- Rename a room and confirm the new name appears on the board and in settings.
- Reorder rooms and confirm the display order survives refresh.
- Add a doctor and confirm the doctor appears in room controls and highlight controls.
- Rename and delete a doctor and confirm room references update safely.
- Add a color label and confirm it saves without backend errors.
- Change a color label title and swatch color and confirm room cards update.
- Change the default color label and confirm new rooms inherit it.

## Personal and Window Settings
- Change display layout settings and confirm they save automatically.
- Change timer alert thresholds and colors and confirm the stopwatch styling updates.
- Change font sizes and stopwatch style and confirm the board updates.
- Change display text colors and confirm the board reflects the new contrast choices.
- Change the theme preset and default theme and confirm both save correctly.
- Save practice defaults and confirm a fresh tab picks them up.

## Board Behavior
- Drag and drop a room and confirm the board updates without visible lag.
- Use discharge, clean, and redo actions and confirm they update immediately.
- Open quick add, edit a room, and confirm the board reflects the changes.
- Confirm timers continue updating without full board rerenders.

## Realtime and Sync
- Open two sessions and confirm board state changes sync across both.
- Confirm clinic config changes like rooms, doctors, and color labels sync correctly.
- Confirm settings save failures show visible feedback instead of silently failing.
