# RoomBoard Pulse Capture Addon

This is a load-unpacked Chrome/Opera extension that keeps your RoomBoard HTML untouched.

What it does:

- The scheduler page always shows a small green `VB` badge in the bottom-left corner.
- Left-clicking `VB` arms patient selection. Clicking `VB` again before selecting a patient cancels it.
- Right-clicking `VB` opens the Supabase login panel.
- While armed, hovering an appointment draws a green box.
- Clicking the appointment opens a thin Quick Add-style send popout from the right side and immediately disarms capture again.
- Supabase login is handled from the `VB` badge panel using the same account as RoomBoard.
- After login, it loads your clinic rooms, types, doctors, and quick notes from the RoomBoard clinic tables.
- Clicking `Send to VetBoard` writes the appointment directly into the shared RoomBoard clinic board.
- After a successful send, the addon stays inactive until you press `VB` again.
- Closing the send window without sending discards that captured patient.

## Files

- `manifest.json`: Chrome/Opera extension manifest
- `background.js`: badge state for whether an appointment is queued
- `scheduler-capture.js`: badge controls, hover/capture, right-click login panel, and direct send to RoomBoard

## Install in Chrome or Opera

1. Open the extensions page.
2. Turn on `Developer mode`.
3. Choose `Load unpacked`.
4. Select this folder:
   `/Users/jackson/Desktop/Stats viewer and website copy/pulse-vetboard-addon`

## Important after loading it

Refresh both tabs after the extension is installed:

- refresh the scheduler page
- refresh the RoomBoard page

Chrome and Opera usually do not inject the new content scripts into tabs that were already open before the extension was loaded.

## Important for local HTML files

If your RoomBoard page is opened directly from disk as a `file://` page, enable:

- `Allow access to file URLs`

That setting is on the extension details page after you load it.

## How to use it

1. Right-click the green `VB` badge if you need to log in.
2. Left-click the green `VB` badge to arm capture.
3. Hover an appointment until you see the green outline.
4. Click the appointment.
5. In the right-side popout, pick the room and confirm the fields.
6. Click `Send to VetBoard`.

To cancel before picking a patient, click `VB` again.

To cancel after the send window opens, close the window or click `VB` again.

## Notes

- The scheduler script now injects broadly and decides in-page whether it looks like a schedule, so it is less dependent on guessing the exact vendor host.
- Because I only had the screenshot and not the live Pulse DOM, the scheduler parser is written with card-detection heuristics rather than vendor-specific selectors.
- If your real Pulse scheduler uses a different domain or different appointment markup, I can tighten the selectors once you give me the live URL pattern or HTML.
