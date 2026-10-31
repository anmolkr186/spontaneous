# Checklist

Things built but not yet verified by hand, and known gaps. Tick them off as you go.

## Verify by hand (native app)

### Recorder dock
- [ ] Drag the dock by the grip, and by an empty part of the slab.
- [ ] First click on the dock works while another app is active.
- [ ] Record / Starting… / Stop / Saving… swap without the dock changing width.
- [ ] Discard deletes the recording and closes the dock.
- [ ] Esc in the dock: closes it in setup; stops the recording while live.
- [ ] The dock shadow is soft and isn't clipped at any edge.

### Window picker
- [ ] Hovering a window tints it and shows its app name and title.
- [ ] Clicking a window chooses it; the Window key then shows the app name.
- [ ] Tab / Shift-Tab / arrows cycle windows front to back; Return picks.
- [ ] After Cmd-Tab to another app, one Esc cancels.
- [ ] After Cmd-Tab, the highlight follows the window that's now on top.
- [ ] Right-click cancels.
- [ ] Recording a picked window works end to end (opens in the editor).

### Area picker
- [ ] Crosshair guides follow the cursor before the first drag.
- [ ] Drag to select; move by dragging inside; resize from each corner.
- [ ] Return confirms; Esc cancels in one press; right-click cancels.
- [ ] Recording an area works end to end and the video matches the area.

### Source keys
- [ ] The × on a chosen window or area clears it back to Display.
- [ ] Clicking a chosen key again reopens the picker.
- [ ] Long app names truncate with an ellipsis.

### Launch and menu bar
- [ ] The launch intro plays centred on screen and lands on the dock.
- [ ] Closing the dock without recording leaves the app in the menu bar.
- [ ] Clicking the Dock icon with nothing open starts a new recording.
- [ ] Menu bar item: Record display / window / area, Open, Show in Finder, Quit. (Currently hidden by your menu bar manager.)

### Editor
- [x] Stop opens the editor in front, on the new project (verified 2026-10-30 with an auto-recorded clip).
- [ ] Click Stop yourself from another app in front; the editor should come forward with the recording.
- [ ] `project.json` updates after edits.
- [ ] Lite / Studio switch and ⌘1 / ⌘2.
- [ ] Tooltips reveal after 450ms and open instantly between neighbours.
- [x] With no clip, picking a shot previews it on its own with a span timeline under the artboard (checked in the browser, Lite and Studio).
- [ ] On a real clip, **Preview shot** switches to the shot preview and **Back to clip** returns to the clip with its notes.
- [ ] Changing the span length on a clip keeps the shot's move starting at the span start.
- [ ] On a clip, picking a shot applies it and opens the preview; **Back to clip** returns with the shot applied.
- [ ] ⌘[ and ⌘] (and the top-bar buttons) collapse and reopen the sidebars with a spring and a short blur; nothing animates on launch.
- [x] The timeline sits between the sidebars and refits the whole project to its width when either one opens or closes (checked in the browser).
- [ ] Timeline zoom (1× fits, up to 12×) still scrolls smoothly when zoomed in.
- [ ] Apply two notes back to back while the agent is busy: the second waits under the thread as Up next and starts on its own.
- [ ] Stop during a batch: unfinished notes go back to open, the queue clears, finished edits stay and can be undone.
- [ ] Undo on an agent step reverts that edit and marks the step Undone.
- [ ] Backdrop picker: Natural, Gradient and Neutral tabs; images look right on the stage at full size.

## Known gaps
- The voice chip simulates playback; real audio playback lands with voice capture.
- Agent is scripted; Claude Code isn't connected yet (phase 4).
- The stage preview is drawn in the webview; the native renderer is phase 3.
- No export yet (phase 5).
- Pickers cover the main display only.
- Video is written with `SCRecordingOutput`; crash-safe fragmented MP4 is a follow-up.
- Microphone permission flow hasn't been exercised.
