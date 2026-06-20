import { LogOut, Home, BookOpen, Activity, Settings, Play, BarChart3, User } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";
import { cn } from '@/lib/utils';

interface AppSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void | Promise<void>;
}

export const AppSidebar = ({ activeTab, onTabChange, onLogout }: AppSidebarProps) => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const role = (user?.role?.toLowerCase?.() || "student");

  const professorNav = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'courses', label: 'Courses', icon: BookOpen },
    { id: 'reports', label: 'View Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const studentNav = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'my-courses', label: 'My Courses', icon: BookOpen },
    { id: 'calendar', label: 'Calendar', icon: Activity },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const navItems = role === 'professor' ? professorNav : studentNav;

  return (
    <div className="w-full h-full bg-sidebar flex flex-col p-6 overflow-hidden shadow-xl md:shadow-none">
      <div className="mb-8 flex-shrink-0 hidden md:block">
        <h2 className="text-2xl font-bold text-sidebar-primary text-center">
          ProctorTab
        </h2>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto pr-2 -mr-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left',
                activeTab === item.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={async () => {
          if (onLogout) {
            try {
              await onLogout();
            } catch (e) {
              console.warn("Logout handler failed:", e);
            }
            return;
          }
          const u = JSON.parse(localStorage.getItem("user") || "{}");
          try {
            await addDoc(collection(db, "tab_logs"), {
              userId: u?.uid || "",
              user: u?.name,
              role: u?.role,
              event: "logout",
              timestamp: serverTimestamp(),
            });
          } catch (e) {
            console.warn("Could not write logout log:", e);
          }
          // CLEAR ALL CACHED USER DATA on logout to prevent old profile appearing for next user
          localStorage.removeItem("user");
          localStorage.removeItem("userProfile");
          window.location.href = "/";
        }}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors font-semibold mt-4 flex-shrink-0"
      >
        <LogOut className="w-5 h-5" />
        <span>Logout</span>
      </button>
    </div>
  );
};
