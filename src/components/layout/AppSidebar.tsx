import { LogOut, LayoutDashboard, GraduationCap, CalendarDays, Settings, FileCheck2, BarChart3 } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";
import { cn } from '@/lib/utils';
import icctLogo from '@/assets/icct-logo.jpg';
import sidebarBg from '@/assets/sidebar-bg.png';

interface AppSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void | Promise<void>;
  isCollapsed?: boolean;
}

export const AppSidebar = ({ activeTab, onTabChange, onLogout, isCollapsed = false }: AppSidebarProps) => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const role = (user?.role?.toLowerCase?.() || "student");

  const professorNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'courses', label: 'Courses', icon: GraduationCap },
    { id: 'reports', label: 'View Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const studentNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'assessments', label: 'Assessments', icon: FileCheck2 },
    { id: 'my-courses', label: 'Courses', icon: GraduationCap },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  ];

  const navItems = role === 'professor' ? professorNav : studentNav;

  return (
    <div
      className={cn(
        'w-full h-full flex flex-col overflow-hidden shadow-xl md:shadow-none text-white bg-cover bg-center transition-[padding] duration-300',
        isCollapsed ? 'p-3' : 'p-4 md:p-6'
      )}
      style={{ backgroundImage: `url(${sidebarBg})` }}
    >
      {/* Logo + Title */}
      <div className="mb-8 flex-shrink-0 flex flex-col items-center text-center gap-2">
        <img
          src={icctLogo}
          alt="ICCT Colleges Logo"
          className={cn(
            'rounded-full object-contain transition-all duration-300 flex-shrink-0',
            isCollapsed ? 'w-10 h-10' : 'w-20 h-20'
          )}
        />
        {!isCollapsed && (
          <div>
            <h2 className="text-xl font-bold tracking-wide">ProctorTab</h2>
            <p className="text-xs text-white/70">Student Portal</p>
          </div>
        )}
      </div>

      <nav className="flex-1 flex flex-col items-stretch space-y-2 overflow-y-auto overflow-x-hidden -mr-2 pr-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              title={isCollapsed ? item.label : undefined}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'w-full flex items-center rounded-full transition-colors text-left flex-shrink-0',
                isCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3',
                activeTab === item.id
                  ? 'bg-white text-blue-900 font-semibold shadow-md'
                  : 'text-white/90 hover:bg-white/10'
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        title={isCollapsed ? "Logout" : undefined}
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
        className={cn(
          'w-full flex items-center rounded-full bg-orange-500 text-white hover:bg-orange-600 transition-colors font-semibold mt-4 flex-shrink-0',
          isCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'
        )}
      >
        <LogOut className="w-5 h-5" />
        {!isCollapsed && <span>Logout</span>}
      </button>
    </div>
  );
};
