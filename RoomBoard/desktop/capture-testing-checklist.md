# RoomBoard Capture Testing Checklist

Target date: Tuesday, May 19, 2026

## Before Testing

- Install the latest RoomBoard Capture build for the test machine.
- Sign in with a RoomBoard account that belongs to the intended clinic.
- Click Load board and confirm the Room selector shows that clinic's rooms.
- Open the scheduler/calendar app on the same machine.

## Windows Scheduler Capture

- Confirm the RoomBoard Capture icon appears in the Windows notification tray.
- Right-click the tray icon, choose Open Login / Review, and confirm the sign-in/review window opens without adding a separate taskbar button.
- Click or select an appointment in the scheduler.
- Press the capture hotkey or left-click the tray icon.
- Confirm the review window opens with selected/copied appointment text when the scheduler exposes text.
- If no text is available, confirm a screen preview appears for manual review.
- Confirm Patient is filled from the appointment name line.
- Confirm Appointment type or reason is filled from procedure text such as PRO, BWX, PEXAM, SRP, or EXAM.
- Confirm phone/contact lines are not used as the patient or reason.
- Choose a Room and RoomBoard type.
- Click Send to RoomBoard.
- Confirm the RoomBoard website updates that room.

## Clipboard Fallback

- In the scheduler, select or copy appointment text if the normal capture does not read it.
- Click Use copied text in RoomBoard Capture.
- Confirm the parsed fields populate.
- Send to a test room.

## Mac Capture

- Install the latest signed/notarized DMG when available.
- Confirm the `RoomBoard` Capture item appears in the macOS menu bar.
- Click or select an appointment in the scheduler.
- Press the capture hotkey or left-click the menu bar icon.
- Right-click the menu bar icon, choose Open Login / Review, and confirm the sign-in/review window opens.
- If macOS asks for Accessibility permission, allow RoomBoard Capture in System Settings.
- If screen previews are blank, allow RoomBoard Capture in Screen Recording.
- Test the same capture and send flow.

## If Capture Fails

- Open Diagnostics.
- Click Copy diagnostics.
- Save the copied text with the scheduler name, operating system, and what was clicked.
- Do not send real patient information unless the test account and test data are approved for troubleshooting.

## Pass Criteria

- Sign in uses the signed-in RoomBoard clinic without asking for a website URL.
- Website sync and normal board updates continue working.
- Captured appointments can be reviewed before send.
- A failed text capture still gives a usable screenshot preview or clipboard fallback.
- Diagnostics are available for any scheduler that does not parse correctly.
