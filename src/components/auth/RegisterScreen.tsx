import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/firebase';
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { isValidStudentNumber } from '@/utils/generateStudentNumber';

interface RegisterScreenProps {
  onSwitchToLogin: () => void;
  onRegisterSuccess?: (
    uid: string,
    name: string,
    role: string,
    profileData: {
      email: string;
      studentNumber: string;
      course: string;
      year: string;
    }
  ) => void;
}

type RegisterRole = 'student' | 'professor';

export const RegisterScreen = ({ onSwitchToLogin, onRegisterSuccess }: RegisterScreenProps) => {
  const [selectedRole, setSelectedRole] = useState<RegisterRole>('student');
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    studentNumber: '',
    course: '',
    year: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError('');
  };

  const validateForm = (): boolean => {
    if (!formData.fullName.trim()) {
      setError('Full name is required');
      return false;
    }
    if (!formData.email.trim()) {
      setError('Email is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('Please enter a valid email');
      return false;
    }
    if (selectedRole === 'student') {
      if (!formData.studentNumber.trim()) {
        setError('Student number is required');
        return false;
      }
      if (!isValidStudentNumber(formData.studentNumber.trim())) {
        setError('Please enter a valid student number');
        return false;
      }
      if (!formData.course.trim()) {
        setError('Course is required');
        return false;
      }
      if (formData.course !== 'BSIT') {
        setError('Only BSIT course is allowed to register');
        return false;
      }
      if (!formData.year.trim()) {
        setError('Year is required');
        return false;
      }
      if (formData.year !== '1st Year') {
        setError('Only 1st Year level is allowed to register');
        return false;
      }
    }
    if (!formData.password) {
      setError('Password is required');
      return false;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    return true;
  };

  const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
    let timeoutId: number;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      window.clearTimeout(timeoutId);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const studentNumber = formData.studentNumber.trim();

      if (selectedRole === 'student') {
        const usersRef = collection(db, 'users');
        const existingSnap = await withTimeout(
          getDocs(query(usersRef, where('studentNumber', '==', studentNumber))),
          4000,
          'Connection timeout checking student number. Please try again.'
        );
        if (!existingSnap.empty) {
          setError('Student number is already registered');
          setLoading(false);
          return;
        }
      }

      const userCredential = await withTimeout(
        createUserWithEmailAndPassword(auth, formData.email, formData.password),
        6000,
        'Connection timeout creating account. Please try again.'
      );

      const uid = userCredential.user.uid;

      await withTimeout(
        setDoc(doc(db, 'users', uid), {
          uid,
          name: formData.fullName,
          email: formData.email,
          studentNumber: selectedRole === 'student' ? studentNumber : '',
          course: selectedRole === 'student' ? formData.course : '',
          year: selectedRole === 'student' ? formData.year : '',
          role: selectedRole,
          createdAt: serverTimestamp(),
        }),
        4000,
        'Connection timeout saving user profile. Please try again.'
      );

      localStorage.removeItem('userProfile');

      if (onRegisterSuccess) {
        onRegisterSuccess(uid, formData.fullName, selectedRole, {
          email: formData.email,
          studentNumber: selectedRole === 'student' ? studentNumber : '',
          course: selectedRole === 'student' ? formData.course : '',
          year: selectedRole === 'student' ? formData.year : '',
        });
      } else {
        alert('Registration successful! Please log in.');
        onSwitchToLogin();
      }
    } catch (error: any) {
      console.error('Registration error:', error);

      if (error.code === 'auth/email-already-in-use') {
        setError('This email is already registered');
      } else if (error.code === 'auth/weak-password') {
        setError('Password is too weak');
      } else if (error.code === 'auth/invalid-email') {
        setError('Invalid email address');
      } else {
        setError(error.message || 'Registration failed. Please try again.');
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
      <div className="w-full max-w-[550px]">
        <div className="bg-white/90 backdrop-blur-md rounded-[2.5rem] shadow-2xl p-5 sm:p-8 border border-white/50 flex flex-col items-center">

          {/* Central Seal Logo */}
          <div className="w-16 h-16 mb-3 rounded-full overflow-hidden shadow-md border-4 border-blue-900 bg-white flex items-center justify-center">
            <img src="/icct_logo.jpg" alt="ICCT Colleges" className="w-full h-full object-cover" />
          </div>

          <h2 className="text-lg sm:text-xl font-black text-center mb-1 tracking-tight">
            <span className="text-blue-900 uppercase">{selectedRole === 'student' ? 'Student' : 'Professor'} </span>
            <span className="text-yellow-500 uppercase">Registration</span>
          </h2>

          <div className="flex items-center justify-center space-x-3 mb-4">
            <span className="text-[11px] font-bold text-gray-500 uppercase">Register as:</span>
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

          <form onSubmit={handleSubmit} className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
            {error && (
              <div className="sm:col-span-2 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-bold text-center">
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-black text-blue-900 ml-1 uppercase tracking-wider">Full Name</label>
              <Input
                name="fullName"
                value={formData.fullName}
                onChange={handleInputChange}
                required
                placeholder="Juan Dela Cruz"
                className="!bg-white !text-gray-900 border border-gray-300 h-10 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-400 text-xs placeholder:!text-gray-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-blue-900 ml-1 uppercase tracking-wider">Email Address</label>
              <Input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                placeholder="email@example.com"
                className="!bg-white !text-gray-900 border border-gray-300 h-10 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-400 text-xs placeholder:!text-gray-400"
              />
            </div>

            {selectedRole === 'student' && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-blue-900 ml-1 uppercase tracking-wider">Student Number</label>
                  <Input
                    name="studentNumber"
                    value={formData.studentNumber}
                    onChange={handleInputChange}
                    required
                    placeholder="2023-XXXXX"
                    className="!bg-white !text-gray-900 border border-gray-300 h-10 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-400 text-xs placeholder:!text-gray-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-blue-900 ml-1 uppercase tracking-wider">Course</label>
                  <select
                    name="course"
                    value={formData.course}
                    onChange={handleInputChange}
                    className="w-full bg-[#1a233a] text-white border-none h-10 rounded-xl px-3 text-xs focus:ring-2 focus:ring-blue-400 outline-none"
                    required
                  >
                    <option value="">Select Course</option>
                    <option value="BSIT">BSIT</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-blue-900 ml-1 uppercase tracking-wider">Year Level</label>
                  <select
                    name="year"
                    value={formData.year}
                    onChange={handleInputChange}
                    className="w-full bg-[#1a233a] text-white border-none h-10 rounded-xl px-3 text-xs focus:ring-2 focus:ring-blue-400 outline-none"
                    required
                  >
                    <option value="">Select Year</option>
                    <option value="1st Year">1st Year</option>
                  </select>
                </div>
              </>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-black text-blue-900 ml-1 uppercase tracking-wider">Password</label>
              <Input
                name="password"
                type="password"
                value={formData.password}
                onChange={handleInputChange}
                required
                placeholder="••••••••"
                className="!bg-white !text-gray-900 border border-gray-300 h-10 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-400 text-xs placeholder:!text-gray-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-blue-900 ml-1 uppercase tracking-wider">Confirm Password</label>
              <Input
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                required
                placeholder="••••••••"
                className="!bg-white !text-gray-900 border border-gray-300 h-10 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-400 text-xs placeholder:!text-gray-400"
              />
            </div>

            <div className="sm:col-span-2 pt-2">
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-900 to-indigo-800 hover:from-blue-800 hover:to-indigo-700 text-white font-black h-11 rounded-xl shadow-xl transition-all active:scale-[0.98] uppercase tracking-widest"
                disabled={loading}
              >
                {loading ? 'Creating Account...' : 'Register'}
              </Button>
            </div>

            <div className="sm:col-span-2 text-center mt-1">
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="text-[11px] font-bold text-blue-900 hover:underline uppercase"
                disabled={loading}
              >
                Already have an account? Sign in
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};  