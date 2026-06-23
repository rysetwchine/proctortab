import { StudentDashboard } from "./components/dashboard/StudentsDashboard";
import { InstructorDashboard } from "./components/dashboard/InstructorDashboard";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PhoneAttendanceScanPage from "./pages/PhoneAttendanceScanPage";
import { ScannerErrorBoundary } from "./components/attendance/ScannerErrorBoundary";


export const routers = [
  {
    path: "/",
    name: "home",
    element: <Index />,
  },
 {
  path: "/student",
  name: "student",
  element: <StudentDashboard onStartExam={() => {}} />,
},
{
  path: "/professor",
  name: "professor",
  element: <InstructorDashboard onNavigate={() => {}} />,
},
  {
    path: "/attendance/scan",
    name: "attendance-scan",
    element: (
      <ScannerErrorBoundary>
        <PhoneAttendanceScanPage />
      </ScannerErrorBoundary>
    ),
  },
  {
    path: "*",
    name: "404",
    element: <NotFound />,
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;