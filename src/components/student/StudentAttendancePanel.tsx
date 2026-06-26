import { useEffect, useMemo, useState, isValidElement, cloneElement, Children, ReactNode } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { QrCode, Download, FileText, Search, Filter, CalendarDays, CheckCircle, Clock, XCircle, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import { subscribeGlobalAttendanceLogs } from '@/utils/attendanceFirestore';
import type { AttendanceLog, AttendanceStatus } from '@/types/attendance';
import { MotionBackground } from '@/components/shared/MotionBackground';
import { buildAttendanceQrPayload, serializeAttendanceQrPayload } from '@/utils/attendanceQr';

type ActiveTabType = 'qr' | 'history';

export function StudentAttendancePanel() {
  const { user } = useAuth();
  const studentId = resolveEnrollmentStudentId(user);
  const userProfile = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('userProfile') || '{}');
    } catch {
      return {};
    }
  }, []);

  const [activeSubTab, setActiveSubTab] = useState<ActiveTabType>('qr');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [allLogs, setAllLogs] = useState<AttendanceLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<'date' | 'time'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const itemsPerPage = 8;

  // Filter logs for this student only
  const studentLogs = useMemo(() => {
    return allLogs.filter((log) => String(log.studentId) === String(studentId));
  }, [allLogs, studentId]);

  // Generate QR Code Payload on Mount & Rotate every 30s to prevent screenshot sharing
  useEffect(() => {
    if (!studentId) return;

    const generatePass = () => {
      const profile = {
        name: userProfile.name || user?.name || 'Student',
        studentNumber: userProfile.studentNumber || 'N/A',
        email: userProfile.email || user?.email || '',
        course: userProfile.course || 'N/A',
        program: userProfile.program || (userProfile.course === 'BSIT' ? 'Bachelor of Science in Information Technology' : 'Academic Program'),
        year: userProfile.year || 'N/A',
      };
      
      const payload = buildAttendanceQrPayload(studentId, profile);
      const serialized = serializeAttendanceQrPayload(payload);

      QRCode.toDataURL(serialized, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => {
          console.error('Failed to generate QR Code:', err);
        });
    };

    generatePass();
    const interval = setInterval(generatePass, 30000); // 30s auto rotation

    return () => clearInterval(interval);
  }, [studentId, user, userProfile]);

  // Subscribe to logs
  useEffect(() => {
    const unsubscribe = subscribeGlobalAttendanceLogs(
      setAllLogs,
      () => toast.error('Could not load your attendance history.')
    );
    return unsubscribe;
  }, []);

  // Filter and Sort logs
  const processedLogs = useMemo(() => {
    let result = [...studentLogs];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (log) =>
          (log.courseName || log.course || '').toLowerCase().includes(q) ||
          log.date.includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((log) => log.status === statusFilter);
    }

    result.sort((a, b) => {
      const fieldA = a[sortField];
      const fieldB = b[sortField];
      return sortOrder === 'asc'
        ? fieldA.localeCompare(fieldB)
        : fieldB.localeCompare(fieldA);
    });

    return result;
  }, [studentLogs, searchQuery, statusFilter, sortField, sortOrder]);

  // Pagination
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return processedLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [processedLogs, currentPage]);

  const totalPages = Math.max(1, Math.ceil(processedLogs.length / itemsPerPage));

  const handleDownloadPng = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `proctortab-attendance-qr-${userProfile.studentNumber || 'student'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('QR Code downloaded as PNG.');
  };

  const handleDownloadPdf = () => {
    if (!qrDataUrl) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Pop-up blocked. Please allow pop-ups to print PDF.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(`
      <html>
        <head>
          <title>Student QR Attendance Card - ${userProfile.name || user?.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap');
            body {
              font-family: 'Outfit', sans-serif;
              margin: 0;
              padding: 40px;
              background-color: #ffffff;
              color: #0f172a;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 80vh;
            }
            .card-container {
              border: 2px solid #0f172a;
              border-radius: 24px;
              padding: 40px;
              max-width: 450px;
              width: 100%;
              text-align: center;
              box-shadow: 0 10px 30px rgba(0,0,0,0.05);
            }
            .header {
              font-weight: 800;
              font-size: 24px;
              letter-spacing: 1px;
              color: #1e3a8a;
              margin-bottom: 5px;
            }
            .subtitle {
              font-size: 12px;
              color: #0284c7;
              text-transform: uppercase;
              font-weight: 600;
              letter-spacing: 2px;
              margin-bottom: 25px;
            }
            .qr-image {
              width: 240px;
              height: 240px;
              margin: 20px auto;
              border: 1px solid #e2e8f0;
              padding: 10px;
              border-radius: 16px;
            }
            .details {
              margin-top: 25px;
              text-align: left;
              background: #f8fafc;
              padding: 20px;
              border-radius: 16px;
              border: 1px solid #edf2f7;
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #edf2f7;
              font-size: 14px;
            }
            .detail-row:last-child {
              border-bottom: none;
            }
            .label {
              color: #64748b;
              font-weight: 500;
            }
            .val {
              color: #0f172a;
              font-weight: 600;
            }
            .footer {
              margin-top: 30px;
              font-size: 11px;
              color: #94a3b8;
            }
            @media print {
              body { padding: 0; }
              .card-container { box-shadow: none; border-color: #000; }
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="card-container">
            <div class="header">ProctorTab</div>
            <div class="subtitle">Student Attendance Pass</div>
            <img class="qr-image" src="${qrDataUrl}" alt="Student QR Code" />
            <div class="details">
              <div class="detail-row">
                <span class="label">Name:</span>
                <span class="val">${userProfile.name || user?.name || 'Student'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Student ID:</span>
                <span class="val">${userProfile.studentNumber || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Course:</span>
                <span class="val">${userProfile.course || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Academic Year:</span>
                <span class="val">${userProfile.year || 'N/A'}</span>
              </div>
            </div>
            <div class="footer">Generated on ${new Date().toLocaleDateString()}</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const toggleSort = (field: 'date' | 'time') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getStatusBadge = (status: AttendanceStatus) => {
    switch (status) {
      case 'present':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 capitalize font-medium">
            <CheckCircle className="w-3.5 h-3.5 mr-1" />
            Present
          </Badge>
        );
      case 'late':
        return (
          <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 capitalize font-medium">
            <Clock className="w-3.5 h-3.5 mr-1" />
            Late
          </Badge>
        );
      case 'absent':
        return (
          <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/20 capitalize font-medium">
            <XCircle className="w-3.5 h-3.5 mr-1" />
            Absent
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <MotionBackground>
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Attendance Center</h1>
          <p className="text-slate-400 text-sm">
            Generate your personal QR pass and monitor your session logs in real time.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex gap-2 p-1 bg-slate-900/60 border border-slate-800/80 rounded-2xl w-fit backdrop-blur-md">
          <Button
            variant="ghost"
            onClick={() => setActiveSubTab('qr')}
            className={`rounded-xl px-5 h-10 text-sm font-semibold transition-all ${
              activeSubTab === 'qr'
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/10'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <QrCode className="w-4 h-4 mr-2" />
            My QR Code
          </Button>
          <Button
            variant="ghost"
            onClick={() => setActiveSubTab('history')}
            className={`rounded-xl px-5 h-10 text-sm font-semibold transition-all ${
              activeSubTab === 'history'
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/10'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <CalendarDays className="w-4 h-4 mr-2" />
            Attendance History
          </Button>
        </div>

        {/* QR Code view */}
        {activeSubTab === 'qr' && (
          <div className="grid gap-6 md:grid-cols-[380px_1fr] items-start animate-in fade-in duration-300">
            {/* Card Left: QR Render */}
            <div className="border border-slate-800 bg-slate-950/40 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl flex flex-col items-center p-6 text-center">
              <div className="p-0 mb-4 w-full text-center">
                <h3 className="text-xl font-bold text-white uppercase tracking-wide">My Attendance Pass</h3>
                <p className="text-slate-400 text-xs mt-1">Present this code to your instructor</p>
              </div>
              <div className="p-0 flex flex-col items-center w-full">
                <div className="bg-white p-4 rounded-3xl border border-slate-700 shadow-xl relative group">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="Student QR Code" className="w-56 h-56 object-contain" />
                  ) : (
                    <div className="w-56 h-56 flex items-center justify-center bg-slate-900 rounded-2xl">
                      <span className="text-slate-500 text-xs animate-pulse">Generating code…</span>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 font-mono mt-4 uppercase">Dynamic Token ID: {studentId.slice(0, 16)}...</p>

                <div className="flex gap-2 w-full mt-6">
                  <Button onClick={handleDownloadPng} className="flex-1 bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl gap-2 font-semibold">
                    <Download className="w-4 h-4 text-blue-400" />
                    PNG Image
                  </Button>
                  <Button onClick={handleDownloadPdf} className="flex-1 bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl gap-2 font-semibold">
                    <FileText className="w-4 h-4 text-sky-400" />
                    PDF Card
                  </Button>
                </div>
              </div>
            </div>

            {/* Card Right: Instructions & Profile Details */}
            <div className="border border-slate-800 bg-slate-950/20 backdrop-blur-xl rounded-3xl shadow-xl p-6 space-y-6">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-blue-400" />
                Information details
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 bg-slate-900/30 border border-slate-800/60 rounded-2xl">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Student Name</p>
                  <p className="text-base font-bold text-white mt-1">{userProfile.name || user?.name || 'N/A'}</p>
                </div>
                <div className="p-4 bg-slate-900/30 border border-slate-800/60 rounded-2xl">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Student ID</p>
                  <p className="text-base font-bold text-white mt-1">{userProfile.studentNumber || 'N/A'}</p>
                </div>
                <div className="p-4 bg-slate-900/30 border border-slate-800/60 rounded-2xl">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Course</p>
                  <p className="text-base font-bold text-white mt-1">{userProfile.course || 'N/A'}</p>
                </div>
                <div className="p-4 bg-slate-900/30 border border-slate-800/60 rounded-2xl">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Program</p>
                  <p className="text-base font-bold text-white mt-1">
                    {userProfile.program || (userProfile.course === 'BSIT' ? 'Bachelor of Science in Information Technology' : 'Academic Program')}
                  </p>
                </div>
                <div className="p-4 bg-slate-900/30 border border-slate-800/60 rounded-2xl sm:col-span-2">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Academic Year</p>
                  <p className="text-base font-bold text-white mt-1">{userProfile.year || 'N/A'}</p>
                </div>
              </div>

              <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 text-xs text-slate-400 leading-relaxed space-y-2">
                <p className="font-semibold text-blue-400 text-sm">💡 Quick attendance guide:</p>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  <li>Open this QR code tab on your smartphone/device or print the PDF card.</li>
                  <li>Let your instructor scan the code during check-in.</li>
                  <li>Check-in records will immediately sync and register under the "Attendance History" tab.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Attendance History view */}
        {activeSubTab === 'history' && (
          <div className="border border-slate-800 bg-slate-950/20 backdrop-blur-xl rounded-3xl overflow-hidden shadow-xl animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 p-6 gap-4">
              <div>
                <h3 className="text-xl font-bold text-white">My Attendance History</h3>
                <p className="text-slate-400 text-xs mt-1">Review all checked-in attendance records.</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="Search by course..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-slate-900/60 border-slate-800 rounded-xl h-9 text-xs w-full sm:w-48 placeholder:text-slate-600 focus-visible:ring-blue-500"
                  />
                </div>

                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val)}>
                    <SelectTrigger className="bg-slate-900/60 border-slate-800 rounded-xl h-9 text-xs w-28 text-slate-300 focus:ring-blue-500">
                      <Filter className="w-3 h-3 mr-1" />
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-300 rounded-xl">
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="present">Present</SelectItem>
                      <SelectItem value="late">Late</SelectItem>
                      <SelectItem value="absent">Absent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="p-6">
              {paginatedLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  {studentLogs.length === 0 ? 'No attendance check-ins recorded yet.' : 'No records match search parameters.'}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto border border-slate-800/60 rounded-2xl bg-slate-950/20">
                    <Table>
                      <TableHeader className="bg-slate-900/40">
                        <TableRow className="border-b border-slate-800">
                          <TableHead className="py-4 font-semibold text-slate-400">Course</TableHead>
                          <TableHead className="py-4 font-semibold text-slate-400 cursor-pointer hover:text-white" onClick={() => toggleSort('date')}>
                            <div className="flex items-center gap-1.5">
                              Date
                              <ArrowUpDown className="w-3.5 h-3.5" />
                            </div>
                          </TableHead>
                          <TableHead className="py-4 font-semibold text-slate-400 cursor-pointer hover:text-white" onClick={() => toggleSort('time')}>
                            <div className="flex items-center gap-1.5">
                              Time In
                              <ArrowUpDown className="w-3.5 h-3.5" />
                            </div>
                          </TableHead>
                          <TableHead className="py-4 font-semibold text-slate-400">Status</TableHead>
                          <TableHead className="py-4 font-semibold text-slate-400">Remarks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedLogs.map((log) => (
                          <TableRow key={log.id} className="border-b border-slate-800 hover:bg-slate-900/20 transition-colors">
                            <TableCell className="font-semibold text-slate-200 py-4">{log.courseName || log.course || '—'}</TableCell>
                            <TableCell className="text-slate-300 py-4">{log.date}</TableCell>
                            <TableCell className="text-slate-300 py-4">{log.time || '—'}</TableCell>
                            <TableCell className="py-4">{getStatusBadge(log.status)}</TableCell>
                            <TableCell className="text-slate-400 text-xs max-w-[200px] truncate py-4" title={log.remarks || '—'}>
                              {log.remarks || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination Footer */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t border-slate-900">
                      <span className="text-xs text-slate-500">
                        Page {currentPage} of {totalPages}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          className="h-8 rounded-lg border-slate-800 text-slate-300 bg-slate-950/20 hover:bg-slate-900"
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage === totalPages}
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          className="h-8 rounded-lg border-slate-800 text-slate-300 bg-slate-950/20 hover:bg-slate-900"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </MotionBackground>
  );
}

// Minimal select dropdown replacement to avoid complex imports if not fully available in UI framework
function Select({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (val: string) => void }) {
  const [open, setOpen] = useState(false);

  const activeLabel = useMemo(() => {
    let label = 'All Statuses';
    Children.forEach(children, (child) => {
      if (isValidElement(child) && child.props.value === value) {
        label = child.props.children;
      }
    });
    return label;
  }, [children, value]);

  return (
    <div className="relative inline-block text-left select-none">
      <Button
        variant="outline"
        onClick={() => setOpen(!open)}
        className="bg-slate-900/60 border-slate-800 rounded-xl h-9 text-xs px-3 text-slate-300 hover:text-white"
      >
        <Filter className="w-3.5 h-3.5 mr-1 text-slate-400" />
        {activeLabel}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-32 rounded-xl bg-slate-950 border border-slate-850 shadow-2xl z-20 overflow-hidden">
            <div className="py-1">
              {Children.map(children, (child) => {
                if (isValidElement(child)) {
                  return cloneElement(child, {
                    onClick: () => {
                      onValueChange(child.props.value);
                      setOpen(false);
                    },
                  } as any);
                }
                return child;
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SelectContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

function SelectItem({ children, value, onClick }: { children: ReactNode; value: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-900 hover:text-white transition-colors"
    >
      {children}
    </button>
  );
}

function SelectTrigger({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

function SelectValue({ placeholder }: { placeholder?: string }) {
  return <span>{placeholder}</span>;
}
