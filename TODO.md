# TODO - Move Attendance & Grades to Student Portal Sidebar

## Info gathered
- `AppSidebar.tsx` already contains role-based professor navigation but **student navigation currently lacks Attendance/Grades**.
- `CourseDetails.tsx` contains a course-level nav with tabs Content/Assessments/Grades/Broadcasts and (for professors) an extra Attendance link.
- App routing/state appears to be controlled via `activeTab` in `src/pages/Index.tsx` / `AppLayout` and sidebar calls `onTabChange`.
- Attendance UI exists in `src/components/attendance/CourseAttendanceTab.tsx` and uses `subscribeAttendanceLogs(courseId, ...)`.

## Plan
1. **Create global Student Portal pages**:
   - Add `Attendance` page component that aggregates attendance logs across all enrolled courses.
   - Add `Grades` page component that aggregates grades across all enrolled courses.
   - Reuse existing UI components (tables/dialogs) where possible, preserving styling.
2. **Wire routing/tabs**:
   - Update `src/pages/Index.tsx` (InnerAppContent) to render the new `activeTab === 'attendance'` and `activeTab === 'grades'` for students.
3. **Update sidebar navigation**:
   - Update `src/components/layout/AppSidebar.tsx` so studentNav includes:
     - Dashboard
     - Courses
     - Attendance
     - Grades
     - View Reports
     - Settings
   - Ensure active item highlighting remains driven by `activeTab`.
4. **Remove duplicate course-level links**:
   - Update `src/components/dashboard/Coursedetails.tsx` to remove `Grades` from `navTabs`.
   - If a course-level Attendance tab exists for students, remove it as well (current file shows Attendance is professor-only).
5. **Ensure role-based access**:
   - Students should only see their own aggregated attendance/grades.
   - Professors remain unaffected.
6. **Data integrity**:
   - Attendance and Grades must continue to use the existing Firestore subscriptions / existing grade data structures.
7. **Testing**:
   - Build + run (typecheck) and quick manual verification of navigation + active highlighting.

## Followup steps after edits
- Run `pnpm test` / `pnpm typecheck` (whatever exists) or `pnpm -s lint`.
- Manual UI checks:
  - Student sees Attendance/Grades in main sidebar.
  - Clicking Attendance/Grades navigates and highlights.
  - Course Details no longer shows those duplicates.

