import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { useAuth } from "@/hooks/useAuth";
import { resolveEnrollmentStudentId } from "@/utils/studentEnrollmentId";
import { useAttendanceCalendar, getAttendanceDatesInMonth } from "@/hooks/useAttendanceCalendar";
import { AttendanceEventDetailsDialog } from "@/components/student/AttendanceEventDetailsDialog";
import type { AttendanceCalendarEvent } from "@/hooks/useAttendanceCalendar";
import { getCurrentOwnerUid, readStoredUser } from "@/utils/storedUser";

export const CalendarPanel = () => {
  const { sessions } = useSession();
  const { user } = useAuth();

  // NOTE: AuthContext user may not contain role. We treat localStorage "user" as the source of truth.
  const stored = readStoredUser();
  const role = String((user as any)?.role || stored?.role || "").toLowerCase();
  const isProfessor = role === "professor";

  const studentId = resolveEnrollmentStudentId(user);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAttendanceEvent, setSelectedAttendanceEvent] = useState<AttendanceCalendarEvent | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);

  // Navigate to the course detail view (Courses > Assessments tab) for a given due-date item.
  // Course-based assessments have an id shaped like `course-${courseId}-${assessmentId}`.
  const goToCourseForDueDate = (item: any) => {
    const rawId = String(item?.id || "");
    const match = rawId.match(/^course-(.+)-[^-]+$/);
    const courseId = match ? match[1] : null;

    if (courseId) {
      window.location.hash = `#course=${courseId}`;
    }
    window.dispatchEvent(
      new CustomEvent('navigate-to-tab', { detail: { tab: 'my-courses' } })
    );
  };

  // Fetch attendance records for the logged-in student
  const { attendanceEvents } = useAttendanceCalendar(isProfessor ? "" : studentId);

  // Get attendance dates for current month
  const attendanceDateMap = getAttendanceDatesInMonth(
    attendanceEvents,
    currentDate.getFullYear(),
    currentDate.getMonth() + 1
  );

  const myOwnerUid = getCurrentOwnerUid();

  // 🔥 COURSE ASSESSMENTS
  // Student: from joined courses
  // Professor: from courses owned by professor (or all if ownerUid is missing)
  const courseAssessments = useMemo(() => {
    const relevantCourses = sessions.filter((s) => {
      if (s.type !== "course") return false;
      if (isProfessor) {
        // Keep backward compatible behavior: older courses may not have ownerUid set.
        return !myOwnerUid || !s.ownerUid || s.ownerUid === myOwnerUid;
      }
      return (s.enrolledStudents ?? []).some((id) => String(id) === String(studentId));
    });

    return relevantCourses.flatMap((course) =>
      (course.assessments || [])
        .filter((a) => String(a?.dueDate || "").trim() !== "")
        .map((a) => ({
          id: `course-${course.id}-${a.id}`,
          title: `${a.title} - ${course.title}`,
          dueDate: a.dueDate,
          subject: course.title, // "Subject" (course name)
          assessmentType: a.assessmentType || "exam",
        }))
    );
  }, [sessions, isProfessor, myOwnerUid, studentId]);

  // In professor calendar, we only show course-based due dates (no Attendance/Due tabs).
  // In student calendar, keep existing behavior.
  const allAssessments = useMemo(() => {
    const merged = isProfessor ? [...courseAssessments] : [...assessments, ...courseAssessments];
    return merged.filter((a) => {
      const raw = String(a?.dueDate || "").trim();
      if (!raw) return false;
      const t = new Date(raw).getTime();
      return !Number.isNaN(t);
    });
  }, [assessments, courseAssessments, isProfessor]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "assessments"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Only keep items that have a valid dueDate (calendar should show due-date items only)
      setAssessments(
        (data || []).filter((a: any) => {
          const raw = String(a?.dueDate || "").trim();
          if (!raw) return false;
          const t = new Date(raw).getTime();
          return !Number.isNaN(t);
        })
      );
    });

    return () => unsub();
  }, []);

  const year = currentDate.getFullYear();
  const monthIndex = currentDate.getMonth(); // 0-11
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = new Date(year, monthIndex, 1).getDay(); // 0=Sun

  const startOfTodayMs = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">

          {/* DATE HEADER */}
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-2xl font-bold">
                {currentDate.toLocaleString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Previous month"
                  onClick={() =>
                    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                  }
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Next month"
                  onClick={() =>
                    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                  }
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <p className="text-muted-foreground">
              {currentDate.toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>

          {/* COMBINED STUDENT CALENDAR (Schedule + Due Dates + Attendance) */}
          <div className="space-y-2">
            <div className="grid grid-cols-7 gap-2 text-[10px] font-semibold text-muted-foreground">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <div key={`blank-${i}`} className="min-h-[90px] rounded-md border bg-muted/20" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const cellDate = new Date(year, monthIndex, day);
                const cellMs = cellDate.getTime();

                const dayDueItems = allAssessments.filter((a) => {
                  const t = new Date(a.dueDate).getTime();
                  if (Number.isNaN(t)) return false;
                  const d = new Date(t);
                  return (
                    d.getFullYear() === year &&
                    d.getMonth() === monthIndex &&
                    d.getDate() === day
                  );
                });

                const dayAttendanceEvents = !isProfessor ? (attendanceDateMap.get(day) || []) : [];

                const now = new Date();
                const isToday =
                  now.getFullYear() === year && now.getMonth() === monthIndex && now.getDate() === day;

                return (
                  <div
                    key={`day-${day}`}
                    className={`border p-2 min-h-[90px] rounded-md ${isToday ? "ring-2 ring-primary/40" : ""}`}
                    data-date-ms={cellMs}
                  >
                    <p className="text-xs font-bold">{day}</p>

                    {/* Due dates - clickable, navigates to the course's Assessments tab */}
                    {dayDueItems.slice(0, 3).map((item, idx) => {
                      const isQuiz = String(item.assessmentType || "").toLowerCase() === "quiz";
                      return (
                        <button
                          key={`due-${idx}`}
                          type="button"
                          onClick={() => goToCourseForDueDate(item)}
                          className={`w-full text-left text-[10px] mt-1 p-1 rounded leading-snug transition-colors ${
                            isQuiz
                              ? "bg-emerald-100 hover:bg-emerald-200"
                              : "bg-blue-100 hover:bg-blue-200"
                          }`}
                          title={item.title}
                        >
                          {item.title}
                        </button>
                      );
                    })}

                    {/* Attendance (green + clickable) */}
                    {!isProfessor &&
                      dayAttendanceEvents.slice(0, 2).map((event, idx) => (
                        <button
                          key={`att-${idx}`}
                          type="button"
                          onClick={() => {
                            setSelectedAttendanceEvent(event);
                            setIsDetailsDialogOpen(true);
                          }}
                          className="w-full text-left text-[10px] mt-1 p-1 rounded leading-snug bg-green-200 text-green-900 hover:bg-green-300 transition-colors"
                          title={`Attendance • ${event.courseName || event.course || ""}`}
                        >
                          Attendance
                        </button>
                      ))}

                    {dayDueItems.length > 3 ? (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        +{dayDueItems.length - 3} more due
                      </div>
                    ) : null}

                    {!isProfessor && dayAttendanceEvents.length > 2 ? (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        +{dayAttendanceEvents.length - 2} more attendance
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <span className="text-xs text-muted-foreground">Quiz</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 flex-shrink-0" />
                <span className="text-xs text-muted-foreground">Exam</span>
              </div>
              {!isProfessor && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">Attendance</span>
                </div>
              )}
            </div>
          </div>

          {/* Student-only: keep the "Due Dates" and "Attendance Records" info in the same page (no tabs/buttons). */}
          {!isProfessor && (
            <div className="space-y-6 border-t pt-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-sm">Due Dates</h3>
                {allAssessments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No due dates yet.</p>
                ) : (
                  <div className="space-y-3">
                    {allAssessments
                      .slice()
                      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                      .map((item, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => goToCourseForDueDate(item)}
                          className="w-full text-left border rounded-lg p-4 bg-card hover:bg-muted/50 hover:border-primary/30 transition-colors"
                        >
                          <h4 className="font-bold text-base">{item.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Due date: {item.dueDate}
                          </p>
                          <p className="text-sm mt-2">{item.subject || "No subject"}</p>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-sm">
                  Attendance Records{" "}
                  {attendanceEvents.length > 0 ? (
                    <Badge className="ml-2 bg-green-100 text-green-800 border-0">
                      {attendanceEvents.length}
                    </Badge>
                  ) : null}
                </h3>

                {attendanceEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="text-3xl mb-2">📅</div>
                    <p className="font-medium">No attendance records yet.</p>
                    <p className="text-sm">
                      Your attendance will appear here when you are scanned in a course.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {attendanceEvents
                      .slice()
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((event) => (
                        <button
                          key={event.id}
                          onClick={() => {
                            setSelectedAttendanceEvent(event);
                            setIsDetailsDialogOpen(true);
                          }}
                          className="w-full text-left border rounded-lg p-3 hover:bg-green-50/50 hover:border-green-300 transition-all duration-200 group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate group-hover:text-green-700">
                                {event.courseName || event.course}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(event.date).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })}{" "}
                                • {event.time}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Scanned by: {event.scannedByProfessor}
                              </p>
                            </div>
                            <Badge className="bg-green-100 text-green-800 border-0 ml-2 whitespace-nowrap flex-shrink-0">
                              ✓ Present
                            </Badge>
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Attendance Event Details Dialog */}
          <AttendanceEventDetailsDialog
            event={selectedAttendanceEvent}
            isOpen={isDetailsDialogOpen}
            onClose={() => setIsDetailsDialogOpen(false)}
          />

        </CardContent>
      </Card>
    </div>
  );
};
