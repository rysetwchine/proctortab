import { useState, useMemo, useEffect } from 'react';
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import type { Session } from '@/context/SessionContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MotionBackground } from '@/components/shared/MotionBackground';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  Search, 
  Bell, 
  ChevronRight, 
  Clock, 
  Plus,
  Sparkles,
  QrCode,
  Laptop,
  Camera,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { syncStudentProfileToFirestore } from '@/utils/syncStudentProfileFirestore';
import { rtdb } from '@/firebase';
import { ref, set } from 'firebase/database';

interface StudentDashboardProps {
  onStartExam: () => void;
  onNavigate?: (tab: string) => void;
}

function enrolledCourses(sessions: Session[], studentId: string | null) {
  if (!studentId) return [];
  const sid = String(studentId);
  return sessions.filter(
    (s) => s.type === 'course' && (s.enrolledStudents ?? []).some((id) => String(id) === sid)
  );
}

const RECENT_ANNOUNCEMENTS_LIMIT = 6;

type AnnouncementFeedItem = {
  key: string;
  courseId: string;
  courseTitle: string;
  text: string;
  date: string;
  dateMs: number;
};

function collectRecentAnnouncements(courses: Session[], limit: number): AnnouncementFeedItem[] {
  const rows: AnnouncementFeedItem[] = [];
  for (const c of courses) {
    for (const a of c.announcements || []) {
      const dateMs = new Date(a.date || '').getTime();
      rows.push({
        key: `${c.id}-${a.id}-${a.date}`,
        courseId: String(c.id),
        courseTitle: c.title,
        text: a.text,
        date: a.date,
        dateMs: Number.isNaN(dateMs) ? 0 : dateMs,
      });
    }
  }
  rows.sort((x, y) => y.dateMs - x.dateMs);
  return rows.slice(0, limit);
}

function resolveStudentName(user: any) {
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return null;
    }
  })();
  return user?.name || storedUser?.name || 'Student';
}

const QR_SCANNER_ELEMENT_ID = 'student-join-qr-scanner';

export const StudentDashboard = ({ onStartExam, onNavigate }: StudentDashboardProps) => {
  void onStartExam;
  const { sessions, joinSession } = useSession();
  const { user } = useAuth();
  const studentId = resolveEnrollmentStudentId(user);

  const [searchQuery, setSearchQuery] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [scannerInstance, setScannerInstance] = useState<Html5Qrcode | null>(null);

  const formatJoinCodeInput = (val: string) => {
    const clean = val.replace(/[-\s]/g, '').toUpperCase().slice(0, 6);
    if (clean.length > 3) {
      return `${clean.slice(0, 3)}-${clean.slice(3)}`;
    }
    return clean;
  };

  const [testingEvent, setTestingEvent] = useState<string | null>(null);
  const [testLog, setTestLog] = useState<string>('');

  const sendTestEvent = async (eventVal: string) => {
    setTestingEvent(eventVal);
    setTestLog(`Sending "${eventVal}"...`);
    try {
      // 1. Write to generic 'student1' path
      await set(ref(rtdb, 'alerts/student1/event'), eventVal);
      // 2. Write to student's dynamic path
      const cleanStudentId = String(studentId).replace(/[.#$/\[\]]/g, '_');
      await set(ref(rtdb, `alerts/${cleanStudentId}/event`), eventVal);
      setTestLog(`Pushed "${eventVal}" to RTDB at ${new Date().toLocaleTimeString()}`);
      toast.success(`Sent alert event: ${eventVal}`);
    } catch (e: any) {
      setTestLog(`Error: ${e.message}`);
      toast.error(`Send failed: ${e.message}`);
    }
  };

  const myCoursesList = useMemo(() => enrolledCourses(sessions, studentId), [sessions, studentId]);

  const recentAnnouncements = useMemo(
    () => collectRecentAnnouncements(myCoursesList, RECENT_ANNOUNCEMENTS_LIMIT),
    [myCoursesList]
  );

  // Filtering based on search query
  const filteredAnnouncements = useMemo(() => {
    if (!searchQuery.trim()) return recentAnnouncements;
    const q = searchQuery.toLowerCase();
    return recentAnnouncements.filter(
      (item) =>
        item.text.toLowerCase().includes(q) ||
        item.courseTitle.toLowerCase().includes(q)
    );
  }, [recentAnnouncements, searchQuery]);

  const handleOpenCourseAnnouncements = (courseId: string) => {
    sessionStorage.setItem('courseDetailsInitialTab', 'announcements');
    onNavigate?.('my-courses');
    window.setTimeout(() => {
      window.location.hash = `course=${courseId}`;
    }, 0);
  };

  const handleOpenCourse = (courseId: string) => {
    onNavigate?.('my-courses');
    window.setTimeout(() => {
      window.location.hash = `course=${courseId}`;
    }, 0);
  };

  const handleJoinByCode = async (codeToJoin = joinCode) => {
    if (!codeToJoin.trim()) {
      toast.error('Please enter a session/course join code.');
      return;
    }

    setJoinLoading(true);
    try {
      const sid = resolveEnrollmentStudentId(user);
      localStorage.setItem('student_id', sid);
      const cleanCode = codeToJoin.trim().replace(/[-\s]/g, '').toUpperCase();

      const session = await joinSession(cleanCode, sid);

      if (!session) {
        toast.error('Invalid join code. Please check and try again.');
        setJoinLoading(false);
        return;
      }

      toast.success('Successfully Joined Academic Session.');

      if (session.type !== 'course') {
        localStorage.setItem(
          'activeExam',
          JSON.stringify({
            id: session.id,
            title: session.title,
            code: session.joinCode,
          })
        );
      }

      // Sync student profile information
      try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        await syncStudentProfileToFirestore(
          {
            name: u.name || '',
            studentNumber: u.studentNumber || '',
            email: u.email || '',
            course: u.course || '',
            year: u.year || '',
            section: u.section || '',
          },
          sid
        );
      } catch (e) {
        console.warn('Profile sync skipped:', e);
      }

      setJoinCode('');
      
      // Close QR Modal if open
      if (showQrModal) {
        await stopQrScanner();
        setShowQrModal(false);
      }

      setTimeout(() => {
        if (session.type === 'course') {
          onNavigate?.('my-courses');
          window.location.hash = `course=${session.id}`;
        } else {
          window.location.hash = `exam=${session.id}`;
        }
      }, 800);
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong during enrollment.');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void handleJoinByCode();
    }
  };

  // QR Code Scanner control
  const startQrScanner = async () => {
    setShowQrModal(true);
    setJoinLoading(true);
    setTimeout(async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        setCameras(devices);
        
        const cameraId = devices.length > 0 ? devices[0].id : '';
        setSelectedCameraId(cameraId);

        if (!cameraId) {
          toast.error('No camera devices found.');
          setJoinLoading(false);
          return;
        }

        const scanner = new Html5Qrcode(QR_SCANNER_ELEMENT_ID, { verbose: false });
        setScannerInstance(scanner);

        await scanner.start(
          cameraId,
          { fps: 10, qrbox: 230 },
          (decodedText) => {
            void handleJoinByCode(decodedText);
          },
          () => {} // silent scan fails
        );
        setJoinLoading(false);
      } catch (err) {
        console.error('QR Scanner start failed:', err);
        toast.error('Failed to initialize webcam.');
        setJoinLoading(false);
      }
    }, 400);
  };

  const stopQrScanner = async () => {
    if (scannerInstance) {
      try {
        if (scannerInstance.isScanning) {
          await scannerInstance.stop();
        }
        await scannerInstance.clear();
      } catch (e) {
        console.warn('Scanner stop warning:', e);
      }
      setScannerInstance(null);
    }
  };

  useEffect(() => {
    return () => {
      void stopQrScanner();
    };
  }, [scannerInstance]);

  const studentName = resolveStudentName(user);

  return (
    <MotionBackground>
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-2 sm:px-6 lg:px-8 space-y-6">
        
        {/* Welcome Glassmorphic Banner */}
        <section className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-r from-[#0d0933]/90 via-[#130d4d]/85 to-[#0b072c]/95 shadow-[0_0_50px_rgba(79,70,229,0.15)] p-6 sm:p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6 backdrop-blur-md">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full text-indigo-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>ProctorTab Student Hub</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
              Welcome Back, <span className="bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">{studentName}</span>!
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-lg">
              Manage your academic records, check syllabus modules, and view graded results in one clean interface.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            <div className="rounded-2xl border border-slate-700/80 bg-white/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-2xl font-black text-white">{myCoursesList.length}</p>
              <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider mt-0.5">Enrolled Courses</p>
            </div>
          </div>
        </section>

        {/* Header Search Bar */}
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Search dashboard announcements..."
            className="pl-10 pr-4 py-5 bg-slate-950/40 border-slate-800/80 text-white placeholder-slate-500 rounded-full focus-visible:ring-indigo-500/50 backdrop-blur-sm text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Dashboard Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Main Area: Join Session Centerpiece (2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Centerpiece Join Card */}
            <div className="border border-slate-800 bg-[#070420]/30 backdrop-blur-xl rounded-[2rem] shadow-2xl relative overflow-hidden group p-6 sm:p-8 space-y-6">
              
              {/* Outer Neon Glow Borders */}
              <div className="absolute inset-0 border border-transparent rounded-[2rem] group-hover:border-indigo-500/20 transition-all duration-500 pointer-events-none" />
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 to-indigo-500 opacity-60 group-hover:opacity-100 transition-opacity" />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <Badge className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                    Syllabus Portal
                  </Badge>
                  <h2 className="text-xl sm:text-2xl font-black text-white mt-1">Join Academic Session</h2>
                  <p className="text-xs text-slate-400">Enroll in a new course or launch a secure online exam.</p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center text-xs text-slate-500">
                  <Laptop className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Secure environment active</span>
                </div>
              </div>

              {/* Code Inputs & CTAs */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-stretch">
                <div className="relative">
                  <Plus className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    type="text"
                    placeholder="Enter course or exam join code..."
                    className="pl-10 h-12 bg-slate-900/40 border-slate-800 text-white placeholder-slate-600 rounded-xl focus-visible:ring-indigo-500/50 text-sm tracking-wider uppercase"
                    value={joinCode}
                    onChange={(e) => setJoinCode(formatJoinCodeInput(e.target.value))}
                    onKeyDown={handleKeyPress}
                    disabled={joinLoading}
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => handleJoinByCode()}
                    disabled={joinLoading}
                    className="flex-1 md:flex-initial h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs px-6 rounded-xl shadow-lg shadow-indigo-600/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {joinLoading ? 'Joining...' : 'Join Session'}
                  </Button>
                  <Button 
                    onClick={startQrScanner}
                    disabled={joinLoading}
                    variant="outline"
                    className="h-12 border-slate-800 hover:border-slate-700 bg-slate-900/20 hover:bg-slate-900/40 text-indigo-400 hover:text-indigo-300 rounded-xl px-3.5"
                    title="Scan QR Code to Join"
                  >
                    <QrCode className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* Recently Joined Shortcuts */}
              {myCoursesList.length > 0 && (
                <div className="space-y-2.5 pt-4 border-t border-slate-900">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Recently Enrolled Courses</p>
                  <div className="flex flex-wrap gap-2">
                    {myCoursesList.slice(0, 3).map((course) => (
                      <button
                        key={course.id}
                        onClick={() => handleOpenCourse(course.id)}
                        className="flex items-center gap-2 px-3.5 py-2 bg-slate-900/30 border border-slate-900 hover:border-slate-800 rounded-xl text-slate-300 text-xs font-semibold hover:text-white transition-all"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        {course.title}
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Sidebar Area: Announcements (1 Col) */}
          <div className="space-y-6">
            
            {/* Announcements */}
            <div className="border border-slate-800 bg-[#070420]/30 backdrop-blur-xl rounded-3xl shadow-xl p-5 space-y-4">
              <div className="pb-3 border-b border-slate-900/80">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-indigo-400" />
                  Course Announcements
                </h3>
              </div>
              <div className="pt-2">
                {filteredAnnouncements.length === 0 ? (
                  <p className="text-slate-500 text-xs py-8 text-center">
                    No announcements matching.
                  </p>
                ) : (
                  <div className="max-h-[360px] overflow-y-auto space-y-2.5 pr-1.5">
                    {filteredAnnouncements.map((item) => (
                      <div key={item.key} className="border border-slate-800 bg-slate-900/20 shadow-sm rounded-2xl p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-white text-xs font-bold truncate">{item.courseTitle}</h4>
                          <span className="text-slate-500 text-[10px] shrink-0 tabular-nums">
                            {item.date ? new Date(item.date).toLocaleDateString() : ''}
                          </span>
                        </div>
                        <p className="text-slate-300 text-xs leading-normal line-clamp-3">
                          {item.text}
                        </p>
                        <button
                          type="button"
                          className="text-indigo-300 text-[10px] font-bold hover:underline hover:text-indigo-200 transition-colors flex items-center gap-0.5 mt-1"
                          onClick={() => handleOpenCourseAnnouncements(item.courseId)}
                        >
                          Open in course
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>

        {/* ESP32 Hardware LED Tester */}
        <section className="border border-indigo-500/20 bg-slate-950/40 rounded-3xl p-6 backdrop-blur-md shadow-xl mt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Laptop className="w-5 h-5 text-indigo-400" />
            <h3 className="text-lg font-bold text-white uppercase tracking-wider">ESP32 Hardware LED & Alert Tester</h3>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed max-w-xl">
            Test the physical LEDs and Buzzer on your ESP32 board in real-time. Clicking each button below writes the corresponding alert event code to your Firebase Realtime Database path.
          </p>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => sendTestEvent('tab_switch_1')}
              className="px-4 py-3 rounded-xl border border-emerald-500/30 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 text-xs font-bold text-left transition-all"
            >
              <div className="font-mono text-[9px] text-emerald-500/80 mb-0.5">PIN 12 (WHITE LED)</div>
              <span>Tab Switch 1 (White LED)</span>
            </button>
            <button
              onClick={() => sendTestEvent('tab_switch_2')}
              className="px-4 py-3 rounded-xl border border-yellow-500/30 text-yellow-400 bg-yellow-500/5 hover:bg-yellow-500/10 text-xs font-bold text-left transition-all"
            >
              <div className="font-mono text-[9px] text-yellow-500/80 mb-0.5">PIN 15 (YELLOW LED)</div>
              <span>Tab Switch 2 (Yellow LED)</span>
            </button>
            <button
              onClick={() => sendTestEvent('tab_switch_3')}
              className="px-4 py-3 rounded-xl border border-rose-500/30 text-rose-400 bg-rose-500/5 hover:bg-rose-500/10 text-xs font-bold text-left transition-all"
            >
              <div className="font-mono text-[9px] text-rose-500/80 mb-0.5">PIN 18 (RED LED 1)</div>
              <span>Tab Switch 3 (Red LED 1)</span>
            </button>
            <button
              onClick={() => sendTestEvent('screen_shot')}
              className="px-4 py-3 rounded-xl border border-rose-500/30 text-rose-400 bg-rose-500/5 hover:bg-rose-500/10 text-xs font-bold text-left transition-all"
            >
              <div className="font-mono text-[9px] text-rose-500/80 mb-0.5">PIN 22 (RED LED 2)</div>
              <span>Screenshot (Red LED 2)</span>
            </button>
            <button
              onClick={() => sendTestEvent('mouse_leave')}
              className="px-4 py-3 rounded-xl border border-rose-500/30 text-rose-450 bg-rose-500/5 hover:bg-rose-500/10 text-xs font-bold text-left transition-all"
            >
              <div className="font-mono text-[9px] text-rose-500/80 mb-0.5">PIN 25 (RED LED 3)</div>
              <span>Mouse Exit (Red LED 3)</span>
            </button>
            <button
              onClick={() => sendTestEvent('full_screen_exit')}
              className="px-4 py-3 rounded-xl border border-rose-500/30 text-rose-450 bg-rose-500/5 hover:bg-rose-500/10 text-xs font-bold text-left transition-all"
            >
              <div className="font-mono text-[9px] text-rose-500/80 mb-0.5">PIN 28 (RED LED 4)</div>
              <span>Fullscreen Exit (Red LED 4)</span>
            </button>
            <button
              onClick={() => sendTestEvent('full_screen_exit')}
              className="px-4 py-3 rounded-xl border border-rose-500/30 text-rose-450 bg-rose-500/10 hover:bg-rose-500/15 text-xs font-bold text-left transition-all"
            >
              <div className="font-mono text-[9px] text-rose-500/80 mb-0.5">PIN 23 (BUZZER + ALL)</div>
              <span>Buzzer Trigger</span>
            </button>
            <button
              onClick={() => sendTestEvent('')}
              className="px-4 py-3 rounded-xl border border-slate-700 text-slate-300 bg-slate-900/50 hover:bg-slate-800 text-xs font-bold text-left transition-all"
            >
              <div className="font-mono text-[9px] text-slate-500 mb-0.5">RESET ALL</div>
              <span>Clear / Reset RTDB</span>
            </button>
          </div>
          
          {testLog && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-900 font-mono text-[10px] text-indigo-300">
              <span className="text-slate-500">Live Log:</span> {testLog}
            </div>
          )}
        </section>

      </div>

      {/* WEBCAM QR SCANNER MODAL */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md border border-slate-800 bg-slate-950 text-white rounded-3xl overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200 p-6 flex flex-col gap-4">
            <button 
              onClick={async () => {
                await stopQrScanner();
                setShowQrModal(false);
              }}
              className="absolute top-4 right-4 p-1.5 bg-slate-900 border border-slate-850 hover:bg-slate-850 rounded-full text-slate-400 hover:text-white transition-all z-20"
              aria-label="Close scanner modal"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="border-b border-slate-900/80 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-indigo-400" />
                Scan Session QR Code
              </h3>
              <p className="text-slate-400 text-xs mt-1">
                Point your webcam at a course or exam join code.
              </p>
            </div>
            <div className="flex flex-col items-center gap-4">
              
              {cameras.length > 1 && (
                <div className="w-full flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Camera:</span>
                  <select
                    value={selectedCameraId}
                    onChange={async (e) => {
                      const id = e.target.value;
                      setSelectedCameraId(id);
                      if (scannerInstance) {
                        await stopQrScanner();
                        const scanner = new Html5Qrcode(QR_SCANNER_ELEMENT_ID, { verbose: false });
                        setScannerInstance(scanner);
                        await scanner.start(
                          id,
                          { fps: 10, qrbox: 230 },
                          (decodedText) => void handleJoinByCode(decodedText),
                          () => {}
                        );
                      }
                    }}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-slate-300 flex-1 focus:outline-none"
                  >
                    {cameras.map((d) => (
                      <option key={d.id} value={d.id}>{d.label || `Camera ${d.id.slice(0, 5)}`}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Scanner Viewport */}
              <div className="relative w-full aspect-square border border-slate-800 bg-slate-950/60 rounded-2xl overflow-hidden flex items-center justify-center">
                {joinLoading && (
                  <div className="absolute inset-0 bg-slate-950/80 z-10 flex flex-col items-center justify-center gap-2">
                    <Clock className="w-8 h-8 text-indigo-400 animate-spin" />
                    <p className="text-xs text-slate-400">Verifying session scan...</p>
                  </div>
                )}
                <div id={QR_SCANNER_ELEMENT_ID} className="w-full h-full [&_video]:!block [&_video]:w-full [&_video]:h-full [&_img]:hidden" />
              </div>

              <div className="flex gap-2 w-full mt-2">
                <Button 
                  onClick={async () => {
                    await stopQrScanner();
                    setShowQrModal(false);
                  }}
                  variant="outline" 
                  className="flex-1 border-slate-800 text-slate-300 hover:text-white rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MotionBackground>
  );
};
