import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { collection, onSnapshot } from "firebase/firestore";

export const LogsPanel = () => {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "tab_logs"), (snapshot) => {
     const data = snapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));

// sort newest first
data.sort((a: any, b: any) => {
  return b.timestamp?.toMillis?.() - a.timestamp?.toMillis?.();
});

setLogs(data);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Logs</h2>

      {logs.length === 0 ? (
        <p>No logs yet</p>
      ) : (
       logs.map(log => (
  <div key={log.id} className="border p-2 mb-2 rounded">
    <p><strong>User:</strong> {log.user || "Unknown"}</p>
    <p><strong>Role:</strong> {log.role || "N/A"}</p>
    <p><strong>Event:</strong> {log.event || "N/A"}</p>

    <p>
      <strong>Time:</strong>{" "}
      {log.timestamp?.seconds
        ? new Date(log.timestamp.seconds * 1000).toLocaleString()
        : "No time"}
    </p>
  </div>
))
      )}
    </div>
  );
};