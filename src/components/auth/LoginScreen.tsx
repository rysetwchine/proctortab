import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "@/firebase";
import { doc, getDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

      localStorage.setItem("user", JSON.stringify(safeUser));
      localStorage.removeItem("userProfile");

      await addDoc(collection(db, "tab_logs"), {
        userId: uid,
        user: safeUser.name,
        role: safeUser.role,
        event: "login",
        timestamp: serverTimestamp(),
      });

      console.log("LOCALSTORAGE USER:", JSON.parse(localStorage.getItem("user") || "{}"));
      onLogin(safeUser.name, safeUser.role);

    } catch (error: any) {
      console.error('Login error:', error);

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
    <div
      className="min-h-screen w-full flex flex-col items-center justify-start bg-slate-100 bg-cover bg-center bg-no-repeat overflow-x-hidden p-4 sm:p-8 pt-12 sm:pt-16"
      style={{ backgroundImage: "url('/3.png')" }}
    >
      <div className="w-full max-w-[420px]">
        <div className="bg-white/90 backdrop-blur-md rounded-[2.5rem] shadow-2xl p-6 sm:p-8 border border-white/50 flex flex-col items-center">

          {/* Central Seal Logo */}
          <div className="w-16 h-16 mb-3 rounded-full overflow-hidden shadow-md border-4 border-blue-900 bg-white flex items-center justify-center">
            <img src="/icct_logo.jpg" alt="ICCT Colleges" className="w-full h-full object-cover" />
          </div>

          <h2 className="text-lg sm:text-xl font-black text-center mb-4 tracking-tight">
            <span className="text-blue-900 uppercase">Assessment </span>
            <span className="text-yellow-500 uppercase">Monitoring </span>
            <span className="text-blue-900 uppercase">System</span>
          </h2>

          <form onSubmit={handleSubmit} className="w-full space-y-3">
            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-bold text-center animate-pulse">
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-blue-900 ml-1 uppercase tracking-wider">Username</label>
              <Input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(''); }}
                disabled={loading}
                required
                placeholder="Enter Username"
                className="!bg-white !text-gray-900 border border-gray-300 h-11 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-400 placeholder:!text-gray-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-blue-900 ml-1 uppercase tracking-wider">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                disabled={loading}
                required
                placeholder="Enter Password"
                className="!bg-white !text-gray-900 border border-gray-300 h-11 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-400 placeholder:!text-gray-400"
              />
            </div>

            <div className="pt-1">
              <div className="flex items-center justify-center space-x-3 mb-3">
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
                className="w-full bg-gradient-to-r from-blue-900 to-indigo-800 hover:from-blue-800 hover:to-indigo-700 text-white font-black h-11 rounded-xl shadow-xl transition-all active:scale-[0.98] uppercase tracking-widest"
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Sign in'}
              </Button>
            </div>

            <div className="flex flex-col gap-2 text-center mt-1">
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
    </div>
  );
};