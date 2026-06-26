import { LogOut, LayoutDashboard, GraduationCap, CalendarDays, Settings, FileCheck2, BarChart3, ClipboardCheck, BookMarked } from 'lucide-react';
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
  const isStudent = role === 'student';

  const professorNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'courses', label: 'Courses', icon: GraduationCap },
    { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
    { id: 'grades', label: 'Scores', icon: BookMarked },
    { id: 'reports', label: 'View Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const studentNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'my-courses', label: 'Courses', icon: GraduationCap },
    { id: 'assessments', label: 'Assessments', icon: FileCheck2 },
    { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
    { id: 'grades', label: 'Grades', icon: BookMarked },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const navItems = isStudent ? studentNav : professorNav;

  return (
    <div
      className={cn(
        'relative w-full h-full flex flex-col overflow-hidden shadow-2xl transition-[padding] duration-300 bg-slate-950',
        isCollapsed ? 'p-3' : 'p-4 md:p-6'
      )}
    >
      {/* Background with custom frosted overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-overlay"
        style={{ backgroundImage: `url(${sidebarBg})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-900/80 to-slate-950 border-r border-white/5" />

      {/* Logo + Title */}
      <div className="relative mb-8 flex-shrink-0 flex flex-col items-center text-center gap-2 z-10 pt-2">
        <div className={cn(
          'relative rounded-full p-[2px] transition-all duration-500 shadow-lg',
          isCollapsed ? 'w-11 h-11' : 'w-20 h-20',
          !isStudent 
            ? 'bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 hover:shadow-amber-500/20' 
            : 'bg-gradient-to-tr from-cyan-400 via-blue-500 to-indigo-400 hover:shadow-cyan-400/20'
        )}>
          <img
            src={icctLogo}
            alt="ICCT Colleges Logo"
            className="rounded-full w-full h-full object-cover bg-white"
          />
        </div>
        {!isCollapsed && (
          <div className="mt-1 flex flex-col items-center">
            <h2 className="text-lg font-bold tracking-wider text-white">ProctorTab</h2>
            <div className={cn(
              "mt-1.5 px-3.5 py-1 rounded-full text-[10px] font-extrabold tracking-widest uppercase shadow-md backdrop-blur-sm border",
              !isStudent 
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-amber-500/5"
                : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 shadow-cyan-500/5"
            )}>
              {!isStudent ? 'Instructor Portal' : 'Student Portal'}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="relative flex-1 flex flex-col items-stretch space-y-1.5 overflow-y-auto overflow-x-hidden -mr-2 pr-2 z-10 scrollbar-thin scrollbar-thumb-slate-800">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={isCollapsed ? item.label : undefined}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'group w-full flex items-center transition-all duration-300 text-left flex-shrink-0 rounded-lg relative overflow-hidden',
                isCollapsed ? 'justify-center px-0 py-3' : 'gap-3.5 px-4 py-3 border-l-[3px]',
                isActive
                  ? isStudent
                    ? 'bg-gradient-to-r from-cyan-950/30 via-cyan-900/10 to-transparent text-cyan-400 font-bold border-cyan-400 shadow-[inset_1px_0_0_rgba(34,211,238,0.05)]'
                    : 'bg-gradient-to-r from-amber-950/30 via-amber-900/10 to-transparent text-amber-400 font-bold border-amber-500 shadow-[inset_1px_0_0_rgba(245,158,11,0.05)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border-transparent'
              )}
            >
              {/* Highlight backdrop glow on hover */}
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-white/[0.01] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              <Icon className={cn(
                "w-5 h-5 flex-shrink-0 transition-all duration-300 group-hover:scale-110",
                isActive 
                  ? isStudent ? 'text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]' : 'text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]'
                  : 'text-slate-450 group-hover:text-slate-300'
              )} />
              {!isCollapsed && <span className="truncate tracking-wide text-sm">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Logout button */}
      <div className="relative mt-auto pt-4 border-t border-white/5 z-10 flex-shrink-0">
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
            localStorage.removeItem("user");
            localStorage.removeItem("userProfile");
            window.location.href = "/";
          }}
          className={cn(
            'w-full flex items-center rounded-lg font-bold transition-all duration-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.02)]',
            isCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-2.5'
          )}
        >
          <LogOut className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          {!isCollapsed && <span className="text-sm tracking-wide">Logout</span>}
        </button>
      </div>
    </div>
  );
};