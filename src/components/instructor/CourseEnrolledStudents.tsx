import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User } from "lucide-react";
import type { Session } from "@/context/SessionContext";
import { studentProfileDocId } from "@/utils/studentDirectory";
import { MotionBackground } from '@/components/shared/MotionBackground';

export type EnrolledStudentProfile = {
  directoryId: string;
  name?: string;
  studentNumber?: string;
  email?: string;
  course?: string;
  year?: string;
  accountName?: string;
  accountEmail?: string;
  exists: boolean;
};

interface CourseEnrolledStudentsProps {
  course: Session;
  onBack: () => void;
}

export const CourseEnrolledStudents = ({ course, onBack }: CourseEnrolledStudentsProps) => {
  const ids = course.enrolledStudents || [];
  const [byId, setById] = useState<Record<string, EnrolledStudentProfile>>({});

  const sortedIds = useMemo(() => [...ids].sort(), [ids.join("|")]);

  useEffect(() => {
    if (sortedIds.length === 0) {
      setById({});
      return;
    }

    const unsubs = sortedIds.map((enrolledId) => {
      const ref = doc(db, "student_profiles", studentProfileDocId(enrolledId));
      return onSnapshot(ref, (snap) => {
        const nextRow: EnrolledStudentProfile = {
          ...(snap.exists() ? (snap.data() as Record<string, unknown>) : {}),
          directoryId: enrolledId,
          exists: snap.exists(),
        };

        setById((prev) => {
          const current = prev[enrolledId];
          if (
            current &&
            current.exists === nextRow.exists &&
            current.name === nextRow.name &&
            current.studentNumber === nextRow.studentNumber &&
            current.email === nextRow.email &&
            current.course === nextRow.course &&
            current.year === nextRow.year &&
            current.accountName === nextRow.accountName &&
            current.accountEmail === nextRow.accountEmail
          ) {
            return prev;
          }
          return { ...prev, [enrolledId]: nextRow };
        });
      });
    });

    return () => unsubs.forEach((u) => u());
  }, [sortedIds.join("|")]);

  return (
    <MotionBackground>
      <div className="space-y-6 max-w-4xl mx-auto min-h-screen px-3 sm:px-4">
        <div className="flex items-center gap-2 pt-6">
          <Button variant="ghost" onClick={onBack} className="-ml-2 text-slate-300 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to courses
          </Button>
        </div>

        <div className="sticky top-0 z-10 bg-slate-950/50 backdrop-blur-md border-b border-slate-800/70 px-2 py-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">{course.title}</h2>
              <p className="text-cyan-300 mt-1 font-medium">Enrolled students ({ids.length})</p>
              <p className="text-sm text-slate-300 mt-2">
                Student profiles update live when students save their details under Profile.
              </p>
            </div>

            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 border border-violet-500/25 text-violet-300">
                <User className="h-4 w-4" aria-hidden />
              </span>
              <div className="leading-tight">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Professor</p>
                <p className="text-sm font-semibold text-white">
                  {(course as any).instructor || (course as any).instructorName || "—"}
                </p>
              </div>
            </div>
          </div>

          {ids.length === 0 ? (
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-2xl py-10 text-center">
              <p className="text-slate-300 font-medium">No students have joined this course yet.</p>
            </div>
          ) : (
            <ul className="space-y-3 pb-10">
              {ids.map((enrolledId) => {
                const row = byId[enrolledId];
                const displayName =
                  row?.name ||
                  row?.accountName ||
                  (enrolledId.includes("@") ? enrolledId.split("@")[0] : enrolledId);
                const displayEmail =
                  row?.email ||
                  row?.accountEmail ||
                  (enrolledId.includes("@") ? enrolledId : "");
                const studentNumber = row?.studentNumber || "—";
                const profileCourse = row?.course || "—";
                const year = row?.year || "—";

                return (
                  <li key={enrolledId}>
                    <div className="bg-slate-900/55 backdrop-blur-md rounded-2xl shadow-lg border border-slate-700/50 p-6 hover:border-cyan-500/30 transition-all duration-300 group">
                      {/* Header row */}
                      <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-700/50">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-200 border border-cyan-400/25 shadow-inner">
                          <User className="h-6 w-6" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-bold text-white truncate group-hover:text-cyan-300 transition-colors">
                            {displayName}
                          </h3>
                          <p className="text-xs text-slate-400 font-mono truncate" title={enrolledId}>
                            ID: {enrolledId}
                          </p>
                        </div>
                      </div>

                      {/* Main grid: aligned fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-slate-400 text-xs uppercase font-semibold tracking-wide">
                            Name
                          </span>
                          <p className="font-medium text-white mt-1 truncate">{displayName}</p>
                        </div>

                        <div>
                          <span className="text-slate-400 text-xs uppercase font-semibold tracking-wide">
                            Email
                          </span>
                          <p className="font-medium text-white mt-1 truncate" title={displayEmail}>
                            {displayEmail || "—"}
                          </p>
                        </div>

                        <div>
                          <span className="text-slate-400 text-xs uppercase font-semibold tracking-wide">
                            Student Number
                          </span>
                          <p className="font-medium text-white mt-1">{studentNumber}</p>
                        </div>

                        <div>
                          <span className="text-slate-400 text-xs uppercase font-semibold tracking-wide">
                            Year & Section
                          </span>
                          <p className="font-medium text-white mt-1">{year} — {row?.section || '—'}</p>
                        </div>

                        <div className="sm:col-span-2">
                          <span className="text-slate-400 text-xs uppercase font-semibold tracking-wide">
                            Course
                          </span>
                          <p className="font-medium text-white mt-1">{profileCourse}</p>
                        </div>

                        {row && !row.exists && (
                          <div className="sm:col-span-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                            No profile shared yet — ask the student to open Profile and save their details.
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </MotionBackground>
  );
};

