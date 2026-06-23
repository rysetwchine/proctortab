import { ReactNode, useEffect, useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { Menu, X, ChevronLeft, ChevronRight, Bell, UserCircle2, IdCard, Mail, GraduationCap, CalendarDays } from 'lucide-react';
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
  const displayRole = storedUser?.role
    ? storedUser.role.charAt(0).toUpperCase() + storedUser.role.slice(1)
    : "User";
  const initials = (displayName || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join("") || "U";

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleTabChange = (tab: string) => {
    onTabChange(tab);
    setIsSidebarOpen(false); // Close sidebar on mobile after selection
  };

  // Allow any nested component (e.g. Calendar due-date click) to request a tab
  // switch without needing a prop drilled all the way down to it.
  // Usage: window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'my-courses' } }))
  useEffect(() => {
    const handleNavigateToTab = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab: string }>;
      const tab = customEvent?.detail?.tab;
      if (tab) {
        onTabChange(tab);
      }
    };

    window.addEventListener('navigate-to-tab', handleNavigateToTab);
    return () => window.removeEventListener('navigate-to-tab', handleNavigateToTab);
  }, [onTabChange]);

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
        fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out
        md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        ${isCollapsed ? 'md:w-20' : 'md:w-64'}
        w-64
      `}>
        <AppSidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onLogout={onLogout}
          isCollapsed={isCollapsed}
        />

        {/* Desktop collapse toggle */}
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden md:flex items-center justify-center w-6 h-6 rounded-full
                     bg-sidebar border border-sidebar-border shadow-md
                     absolute top-8 -right-3 z-10
                     text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
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
          <button
            type="button"
            className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-accent/50 transition-colors"
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
          </button>
        </div>

        {/* Desktop Header */}
        <div className="hidden md:flex items-center justify-between px-8 py-4 border-b bg-card flex-shrink-0">
          <h1 className="text-lg font-semibold capitalize">{activeTab.replace(/-/g, ' ')}</h1>

          <div className="flex items-center gap-4">
            <button
              type="button"
              className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-accent/50 transition-colors"
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              {/* Notification dot - remove if not needed */}
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
            </button>

            <button
              type="button"
              onClick={() => onTabChange('profile')}
              className="flex items-center gap-3 pl-3 border-l hover:opacity-80 transition-opacity"
              title="View profile"
            >
              <div className="text-right leading-tight">
                <p className="text-sm font-semibold">{displayName}</p>
                <p className="text-xs text-muted-foreground">{displayRole}</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold flex-shrink-0">
                {initials}
              </div>
            </button>
          </div>
        </div>

        {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 w-full pt-2">
     
          
          {/* Mobile Welcome Text */}
       {activeTab === 'profile' && (
  <div className="space-y-6 max-w-5xl mx-auto">

    <h1 className="text-2xl font-bold">Profile</h1>

    <div className="bg-card rounded-xl shadow-md border border-border overflow-hidden grid md:grid-cols-2 md:divide-x divide-border">

      {/* Profile Form Section */}
      <div className="overflow-hidden">
        {/* Header with avatar */}
        <div className="bg-primary/5 px-6 py-5 flex items-center gap-4 border-b border-border">
          <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-semibold flex-shrink-0">
            {(profileData.name || "U")
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((part: string) => part[0]?.toUpperCase())
              .join("") || "U"}
          </div>
          <div>
            <p className="font-semibold">{profileData.name || "Your Name"}</p>
            <p className="text-sm text-muted-foreground">{profileData.course || "Course"} {profileData.year ? `· ${profileData.year}` : ""}</p>
          </div>
        </div>

        <div className="p-6 space-y-4">

          {/* Name */}
          <div>
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1.5">
              <UserCircle2 className="w-4 h-4" />
              Name
            </label>
            <input
              className="w-full p-2.5 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
              value={profileData.name}
              onChange={(e) =>
                setProfileData({ ...profileData, name: e.target.value })
              }
            />
          </div>

          {/* Student Number */}
          <div>
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1.5">
              <IdCard className="w-4 h-4" />
              Student Number
            </label>
            <input
              className="w-full p-2.5 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
              value={profileData.studentNumber}
              onChange={(e) =>
                setProfileData({ ...profileData, studentNumber: e.target.value })
              }
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1.5">
              <Mail className="w-4 h-4" />
              Email
            </label>
            <input
              className="w-full p-2.5 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
              value={profileData.email}
              onChange={(e) =>
                setProfileData({ ...profileData, email: e.target.value })
              }
            />
          </div>

          {/* Course */}
          <div>
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1.5">
              <GraduationCap className="w-4 h-4" />
              Course
            </label>
            <input
              className="w-full p-2.5 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
              value={profileData.course}
              onChange={(e) =>
                setProfileData({ ...profileData, course: e.target.value })
              }
            />
          </div>

          {/* Year */}
          <div>
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1.5">
              <CalendarDays className="w-4 h-4" />
              Year
            </label>
            <input
              className="w-full p-2.5 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
              value={profileData.year}
              onChange={(e) =>
                setProfileData({ ...profileData, year: e.target.value })
              }
            />
          </div>

          <button
            className="w-full bg-primary text-white py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors"
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

      {/* QR Code Section */}
      {storedUser?.role !== 'professor' ? (
        <div className="p-6 flex flex-col">
          <StudentQrCard
            uid={storedUser?.uid || getCurrentStudentDirectoryId()}
            profile={profileData}
          />
        </div>
      ) : null}

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
