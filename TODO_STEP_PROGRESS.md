# TODO_STEP_PROGRESS (Assessment System UI + Real-time + Anti-cheat)

- [x] Located key files and verified: due date icon alignment, Select All detectors, join session confirmation + auto-dash formatting, anti-cheat Task View/virtual desktop logic, and instructor live monitoring table sources.
- [ ] Implement Firestore-backed attempts tracking (replace localStorage attempt counting) so student allowed attempts exactly match instructor settings.
- [ ] Ensure attempts used/max are updated via onSnapshot in both student UI and instructor dashboard.
- [ ] Ensure all deductions/violations/time/status changes write to Firestore with consistent document IDs (avoid duplicates) and reflect immediately.
- [ ] Fix any remaining UI container spacing/text overlap issues found after the state-sync changes.
- [ ] Build/test and verify on Vercel deployment.

