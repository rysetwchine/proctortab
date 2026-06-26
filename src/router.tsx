import { StudentDashboard } from "./components/student/StudentsDashboard";
import { InstructorDashboard } from "./components/instructor/InstructorDashboard";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PhoneAttendanceScanPage from "./pages/PhoneAttendanceScanPage";
import WebcamScannerPage from "./pages/WebcamScannerPage";
import { ScannerErrorBoundary } from "./components/shared/ScannerErrorBoundary";


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
    path: "/webcam-scanner",
    name: "webcam-scanner",
    element: <WebcamScannerPage />,
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