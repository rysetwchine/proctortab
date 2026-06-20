import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";
import { getCurrentStudentDirectoryId, studentProfileDocId } from "@/utils/studentDirectory";

export type StudentProfileFields = {
  name?: string;
  studentNumber?: string;
  email?: string;
  course?: string;
  year?: string;
};

/**
 * Upserts the signed-in student's profile for the professor roster (live via onSnapshot).
 */
export async function syncStudentProfileToFirestore(
  fields: StudentProfileFields,
  explicitStudentId?: string
): Promise<void> {
  const rawId = explicitStudentId || getCurrentStudentDirectoryId();
  if (!rawId) return;

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const docId = studentProfileDocId(rawId);

  await setDoc(
    doc(db, "student_profiles", docId),
    {
      ...fields,
      directoryId: rawId,
      accountName: user?.name || "",
      accountEmail: user?.email || "",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
