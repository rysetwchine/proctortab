import { ReactNode, useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { Menu, X } from 'lucide-react';
import { LogsPanel } from '@/components/logs/LogsPanel';
const addLog = (type: "LOGIN" | "LOGOUT") => {
  const storedUser = JSON.parse(localStorage.getItem("user") || "{}");

  const existingLogs = JSON.parse(localStorage.getItem("userLogs") || "[]");

  const newLog = {
    id: Date.now(),
    name: storedUser?.name || "Unknown",
    role: storedUser?.role || "unknown",
    type,
    time: new Date().toISOString(),
  };

  const updatedLogs = [newLog, ...existingLogs];

  localStorage.setItem("userLogs", JSON.stringify(updatedLogs));
};
import { Button } from '@/components/ui/button';
import { StudentQrCard } from '@/components/attendance/StudentQrCard';
import { syncStudentProfileToFirestore } from "@/utils/syncStudentProfileFirestore";
import { getCurrentStudentDirectoryId } from '@/utils/studentDirectory';

interface AppLayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void;
}

export const AppLayout = ({ children, activeTab, onTabChange, onLogout }: AppLayoutProps) => {
  const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
  
  // Profile data comes from the 'user' localStorage object which is now loaded from Firestore
  // This ensures we always have the correct current user's profile data
  const [profileData, setProfileData] = useState({
    name: storedUser?.name || "",
    studentNumber: storedUser?.studentNumber || "",
    email: storedUser?.email || "",
    course: storedUser?.course || "",
    year: storedUser?.year || "",
  });
  
  const displayName =
    storedUser?.role === "professor"
      ? storedUser?.name
      : storedUser?.name || "Unknown User";
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleTabChange = (tab: string) => {
    onTabChange(tab);
    setIsSidebarOpen(false); // Close sidebar on mobile after selection
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <AppSidebar activeTab={activeTab} onTabChange={handleTabChange} onLogout={onLogout} />
      </div>

      {/* Main Content */}
     <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between py-4 px-4 border-b bg-card">
          <div className="flex items-center gap-3 h-14">
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="w-6 h-6" />
            </Button>
            <h2 className="text-xl font-bold text-primary">ProctorTab</h2>
          </div>
        </div>

        {/* Desktop Header & Content Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 w-full pt-2">
     
          
          {/* Mobile Welcome Text */}
       {activeTab === 'profile' && (
  <div className="space-y-6 max-w-xl">

    <h1 className="text-2xl font-bold">Profile</h1>

    <div className="bg-card p-5 rounded-lg space-y-4">

      {/* Name */}
      <div>
        <label className="text-sm font-medium">Name</label>
        <input
          className="w-full mt-1 p-2 border rounded"
          value={profileData.name}
          onChange={(e) =>
            setProfileData({ ...profileData, name: e.target.value })
          }
        />
      </div>

      {/* Student Number */}
      <div>
        <label className="text-sm font-medium">Student Number</label>
        <input
          className="w-full mt-1 p-2 border rounded"
          value={profileData.studentNumber}
          onChange={(e) =>
            setProfileData({ ...profileData, studentNumber: e.target.value })
          }
        />
      </div>

      {/* Email */}
      <div>
        <label className="text-sm font-medium">Email</label>
        <input
          className="w-full mt-1 p-2 border rounded"
          value={profileData.email}
          onChange={(e) =>
            setProfileData({ ...profileData, email: e.target.value })
          }
        />
      </div>

      {/* Course */}
      <div>
        <label className="text-sm font-medium">Course</label>
        <input
          className="w-full mt-1 p-2 border rounded"
          value={profileData.course}
          onChange={(e) =>
            setProfileData({ ...profileData, course: e.target.value })
          }
        />
      </div>

      {/* Year */}
      <div>
        <label className="text-sm font-medium">Year</label>
        <input
          className="w-full mt-1 p-2 border rounded"
          value={profileData.year}
          onChange={(e) =>
            setProfileData({ ...profileData, year: e.target.value })
          }
        />
      </div>

      {storedUser?.role !== 'professor' ? (
        <StudentQrCard
          uid={storedUser?.uid || getCurrentStudentDirectoryId()}
          profile={profileData}
        />
      ) : null}

      <button
        className="w-full bg-primary text-white py-2 rounded-lg"
        onClick={async () => {
          // Update both localStorage and Firestore with the new profile data
          // This ensures consistency between the local cache and Firestore
          const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
          
          const updatedUser = {
            ...storedUser,
            ...profileData,
          };

          // Update localStorage to reflect changes immediately
          localStorage.setItem("user", JSON.stringify(updatedUser));
          // Remove old userProfile cache to prevent confusion
          localStorage.removeItem("userProfile");

          try {
            // Also sync to Firestore for persistence and consistency across devices
            await syncStudentProfileToFirestore({
              name: profileData.name,
              studentNumber: profileData.studentNumber,
              email: profileData.email,
              course: profileData.course,
              year: profileData.year,
            });
          } catch (e) {
            console.warn("Could not sync profile to cloud (check Firestore rules):", e);
          }

          alert("Profile Updated!");
        }}
      >
        Save Changes
      </button>

    </div>
  </div>
)}

          <div className="w-full max-w-7xl mx-auto">
            
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
