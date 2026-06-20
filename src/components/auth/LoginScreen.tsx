import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "@/firebase";
import { doc, getDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserRole } from '@/types';
import { isValidStudentNumber } from '@/utils/generateStudentNumber';

interface LoginScreenProps {
  onLogin: (username: string, role: UserRole) => void;
  onSwitchToRegister: () => void;
}

export const LoginScreen = ({ onLogin, onSwitchToRegister }: LoginScreenProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('student');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const normalizeRole = (role: unknown): UserRole => {
    const r = String(role || '').toLowerCase().trim();
    if (r === 'prof' || r === 'professor' || r === 'teacher' || r === 'instructor') return 'professor';
    return 'student';
  };

  /**
   * Looks up email by student number from Firestore
   */
  const getEmailByStudentNumber = async (studentNumber: string): Promise<string | null> => {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('studentNumber', '==', studentNumber));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        return querySnapshot.docs[0].data().email;
      }
      return null;
    } catch (error) {
      console.error('Error looking up student number:', error);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let emailToUse = username;

      // Check if input is a student number instead of email
      if (isValidStudentNumber(username)) {
        const lookedUpEmail = await getEmailByStudentNumber(username);
        if (!lookedUpEmail) {
          setError('Student number not found');
          setLoading(false);
          return;
        }
        emailToUse = lookedUpEmail;
      }

      const userCredential = await signInWithEmailAndPassword(
        auth,
        emailToUse,
        password
      );

      const uid = userCredential.user.uid;

      const userDoc = await getDoc(doc(db, "users", uid));
      if (!userDoc.exists()) {
        setError("User profile not found in database");
        setLoading(false);
        return;
      }

      const userData = userDoc.data();
      const actualRole = normalizeRole(userData.role || "student");

      // Enforce "login portal" selection:
      // If user picked Student login, they can't login with a Professor account (and vice versa).
      if (actualRole !== selectedRole) {
        setError(
          `Wrong account type selected. This account is a ${actualRole}. Please select ${actualRole} login.`
        );
        try {
          await signOut(auth);
        } catch {
          // ignore
        }
        setLoading(false);
        return;
      }

      const safeUser = {
        uid: uid,
        name: userData.name || userCredential.user.displayName || userCredential.user.email,
        email: userCredential.user.email,
        studentNumber: userData.studentNumber || '',
        course: userData.course || '',
        year: userData.year || '',
        role: actualRole
      };

      // SAVE COMPLETE USER DATA LOCALLY (with all profile info)
      // This ensures profile pages load correctly without additional Firestore calls
      localStorage.setItem("user", JSON.stringify(safeUser));
      
      // CLEAR OLD CACHED PROFILE DATA - always use data from Firestore via the 'user' object
      localStorage.removeItem("userProfile");

      // FIREBASE LOG (PERMANENT LOGS)
      await addDoc(collection(db, "tab_logs"), {
        userId: uid,
        user: safeUser.name,
        role: safeUser.role,
        event: "login",
        timestamp: serverTimestamp(),
      });

      console.log("LOCALSTORAGE USER:", JSON.parse(localStorage.getItem("user") || "{}"));
      // send to app
      onLogin(safeUser.name, safeUser.role);

    } catch (error: any) {
      console.error('Login error:', error);
      
      // Handle specific Firebase errors
      if (error.code === 'auth/user-not-found') {
        setError('Invalid email or student number');
      } else if (error.code === 'auth/wrong-password') {
        setError('Invalid password');
      } else if (error.code === 'auth/invalid-email') {
        setError('Invalid email or student number format');
      } else if (error.code === 'auth/too-many-requests') {
        setError('Too many failed login attempts. Please try again later.');
      } else {
        setError(error.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-100 bg-cover bg-center bg-no-repeat overflow-x-hidden" style={{ backgroundImage: "url('/3.png')" }}>
      {/* Top Header Logos */}
      <div className="w-full bg-white/90 backdrop-blur-sm p-4 shadow-sm z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
             <div className="bg-white p-2 border border-gray-200 shadow-sm rounded">
               <div className="text-[#1a237e] font-black text-lg leading-none">ICCT</div>
               <div className="text-[#1a237e] font-bold text-[8px] leading-tight uppercase">Colleges</div>
               <div className="bg-red-600 text-white text-[6px] px-1 py-0.5 mt-0.5 text-center">www.icct.edu.ph</div>
             </div>
             <div className="hidden sm:block">
               <div className="text-blue-900 font-bold text-sm uppercase">ICCT COLLEGES</div>
               <div className="text-gray-500 text-[10px]">A Global Pinoy Distinction</div>
             </div>
          </div>

          <div className="text-center">
            <div className="text-[10px] font-bold text-blue-900 uppercase tracking-wider">A Tertiary Education Provider with Campuses Located in Rizal</div>
            <div className="text-sm font-black text-blue-900 uppercase">ICCT Colleges</div>
            <div className="text-[10px] font-bold text-gray-700">ACADEMIC 2025 - 2026</div>
          </div>

          <div className="flex space-x-2">
            <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center p-1 border border-gray-100">
              <img src="/favicon.svg" alt="ICCT" className="w-8 h-8 object-contain" />
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-900 shadow-sm flex items-center justify-center text-white text-[8px] font-bold border border-blue-800">
              LOGO
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-6xl flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-24">

          {/* Login Card */}
          <div className="w-full max-w-[420px] order-2 lg:order-1">
            <div className="bg-white/80 backdrop-blur-md rounded-[2.5rem] shadow-2xl p-8 sm:p-10 border border-white/50 flex flex-col items-center">

              {/* Central Seal Logo */}
              <div className="w-28 h-28 mb-6 relative">
                <div className="absolute inset-0 rounded-full border-4 border-blue-900 bg-white shadow-inner flex items-center justify-center p-1">
                   <div className="w-full h-full rounded-full border-2 border-red-600 flex flex-col items-center justify-center text-center p-1 overflow-hidden">
                      <div className="text-[7px] font-black text-blue-900 leading-none">ICCT COLLEGES</div>
                      <div className="text-[12px] font-black text-red-600 my-0.5">ICCT</div>
                      <div className="text-[5px] font-bold text-blue-900 leading-tight uppercase">A Global Pinoy<br/>Distinction</div>
                   </div>
                </div>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-center mb-8 tracking-tight">
                <span className="text-blue-900 uppercase">Assessment </span>
                <span className="text-yellow-500 uppercase">Monitoring </span>
                <span className="text-blue-900 uppercase">System</span>
              </h2>

              <form onSubmit={handleSubmit} className="w-full space-y-5">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-bold text-center animate-pulse">
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-blue-900 ml-1 uppercase tracking-wider">Username</label>
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(''); }}
                    disabled={loading}
                    required
                    placeholder="Enter Username"
                    className="bg-[#1a233a] text-white border-none h-12 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-400 placeholder:text-gray-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-blue-900 ml-1 uppercase tracking-wider">Password</label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    disabled={loading}
                    required
                    placeholder="Enter Password"
                    className="bg-[#1a233a] text-white border-none h-12 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-400 placeholder:text-gray-500"
                  />
                </div>

                <div className="pt-2">
                  <div className="flex items-center justify-center space-x-3 mb-5">
                    <span className="text-[11px] font-bold text-gray-500 uppercase">Login as:</span>
                    <button
                      type="button"
                      onClick={() => setSelectedRole('student')}
                      className={`text-[11px] font-black px-4 py-1.5 rounded-full border-2 transition-all ${selectedRole === 'student' ? 'bg-blue-900 text-white border-blue-900 shadow-md' : 'bg-transparent text-gray-400 border-gray-300 hover:border-blue-900 hover:text-blue-900'}`}
                    >
                      STUDENT
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRole('professor')}
                      className={`text-[11px] font-black px-4 py-1.5 rounded-full border-2 transition-all ${selectedRole === 'professor' ? 'bg-blue-900 text-white border-blue-900 shadow-md' : 'bg-transparent text-gray-400 border-gray-300 hover:border-blue-900 hover:text-blue-900'}`}
                    >
                      PROFESSOR
                    </button>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-900 to-indigo-800 hover:from-blue-800 hover:to-indigo-700 text-white font-black h-12 rounded-xl shadow-xl transition-all active:scale-[0.98] uppercase tracking-widest"
                    disabled={loading}
                  >
                    {loading ? 'Processing...' : 'Sign in'}
                  </Button>
                </div>

                <div className="flex flex-col gap-3 text-center mt-2">
                  <button type="button" className="text-[11px] font-bold text-gray-500 hover:text-blue-900 transition-colors uppercase">
                    Forgot Password?
                  </button>
                  <div className="h-px bg-gray-200 w-1/2 mx-auto"></div>
                  <button
                    type="button"
                    onClick={onSwitchToRegister}
                    className="text-[11px] font-bold text-blue-900 hover:underline uppercase tracking-tighter"
                    disabled={loading}
                  >
                    Don't have an account? Register Now
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Welcome Text Section */}
          <div className="hidden lg:flex flex-col items-start select-none order-1 lg:order-2">
            <h1 className="text-6xl xl:text-8xl font-black text-blue-900 leading-[0.85] tracking-tighter italic drop-shadow-sm uppercase">
              Welcome<br />Back,
            </h1>
            <div className="flex items-center mt-6 space-x-2">
              {['A', 'I', 'M', 'S'].map((char, index) => (
                <div
                  key={char}
                  className={`bg-white text-blue-900 text-5xl xl:text-7xl font-black px-5 py-3 rounded-2xl shadow-2xl border-b-8 border-gray-200 transition-transform hover:-translate-y-2 cursor-default`}
                  style={{ transform: `rotate(${index % 2 === 0 ? '-4deg' : '4deg'})` }}
                >
                  {char}
                </div>
              ))}
              <div
                className="bg-yellow-400 text-blue-900 text-5xl xl:text-7xl font-black px-5 py-3 rounded-2xl shadow-2xl border-b-8 border-yellow-600 transform rotate-12 transition-transform hover:rotate-0 cursor-default"
              >
                !
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Footer Bar */}
      <div className="bg-[#1a233a] text-white py-5 px-6 sm:px-12 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center">
            <span className="text-xs font-black tracking-widest text-yellow-400 uppercase">TAYTAY CAMPUS</span>
            <span className="text-white/40 mx-3 font-light text-xl">|</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Assessment Monitoring System</span>
          </div>

          <div className="flex-1 max-w-md hidden sm:block mx-8">
            <div className="relative h-[3px] bg-white/10 rounded-full w-full">
              <div className="absolute top-1/2 right-0 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.6)] animate-pulse"></div>
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent to-white/40 w-full rounded-full"></div>
            </div>
          </div>

          <div className="text-[9px] font-medium text-gray-500 uppercase tracking-tighter text-right">
            © 2025 ICCT COLLEGES FOUNDATION INC.
          </div>
        </div>
      </div>
    </div>
  );
};


