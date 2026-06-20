import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, User } from "lucide-react";
import type { Session } from "@/context/SessionContext";
import { studentProfileDocId } from "@/utils/studentDirectory";

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
    <div className="space-y-6 max-w-4xl mx-auto">
      <Button variant="ghost" onClick={onBack} className="-ml-2">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to courses
      </Button>

      <div>
        <h2 className="text-2xl sm:text-3xl font-bold">{course.title}</h2>
        <p className="text-muted-foreground mt-1">Enrolled students ({ids.length})</p>
        <p className="text-sm text-muted-foreground mt-2">
          Profiles update live when students save their details under Profile in the sidebar.
        </p>
      </div>

      {ids.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No students have joined this course yet.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {ids.map((enrolledId) => {
            const row = byId[enrolledId];
            const displayName =
              row?.name || row?.accountName || (enrolledId.includes("@") ? enrolledId.split("@")[0] : enrolledId);
            const displayEmail = row?.email || row?.accountEmail || (enrolledId.includes("@") ? enrolledId : "");
            const studentNumber = row?.studentNumber || "—";
            const profileCourse = row?.course || "—";
            const year = row?.year || "—";

            return (
              <li key={enrolledId}>
                <Card>
                  <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                      <User className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-lg truncate">{displayName}</CardTitle>
                      <p className="text-xs text-muted-foreground font-mono truncate" title={enrolledId}>
                        ID: {enrolledId}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-2 sm:grid-cols-2 text-sm pt-0">
                    <div>
                      <span className="text-muted-foreground">Student number</span>
                      <p className="font-medium">{studentNumber}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Email</span>
                      <p className="font-medium truncate" title={displayEmail}>
                        {displayEmail || "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Course (profile)</span>
                      <p className="font-medium">{profileCourse}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Year</span>
                      <p className="font-medium">{year}</p>
                    </div>
                    {row && !row.exists && (
                      <p className="sm:col-span-2 text-xs text-amber-600 dark:text-amber-500">
                        No profile shared yet — ask the student to open Profile and save their details.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
