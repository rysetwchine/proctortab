import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/firebase';
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { isValidStudentNumber } from '@/utils/generateStudentNumber';

interface RegisterScreenProps {
  onSwitchToLogin: () => void;
  onRegisterSuccess?: (uid: string, name: string, role: string) => void;
}

export const RegisterScreen = ({ onSwitchToLogin, onRegisterSuccess }: RegisterScreenProps) => {
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
    if (!formData.year.trim()) {
      setError('Year is required');
      return false;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      // Check if student number is already registered (prevents duplicates).
      const studentNumber = formData.studentNumber.trim();
      const usersRef = collection(db, 'users');
      const existingSnap = await getDocs(query(usersRef, where('studentNumber', '==', studentNumber)));
      if (!existingSnap.empty) {
        setError('Student number is already registered');
        return;
      }

      // Create Firebase Authentication user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );

      const uid = userCredential.user.uid;

      // Create Firestore user document with complete profile data
      await setDoc(doc(db, 'users', uid), {
        uid,
        name: formData.fullName,
        email: formData.email,
        studentNumber,
        course: formData.course,
        year: formData.year,
        role: 'student',
        createdAt: serverTimestamp(),
      });

      // CLEAR OLD CACHED PROFILE DATA to prevent wrong user data being shown
      localStorage.removeItem('userProfile');

      // Notify parent component of successful registration
      if (onRegisterSuccess) {
        onRegisterSuccess(uid, formData.fullName, 'student');
      } else {
        // Fallback: switch to login
        alert('Registration successful! Please log in.');
        onSwitchToLogin();
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      
      // Handle specific Firebase errors
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
        <div className="w-full max-w-6xl flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-20">

          {/* Register Card */}
          <div className="w-full max-w-[550px] order-2 lg:order-1">
            <div className="bg-white/80 backdrop-blur-md rounded-[2.5rem] shadow-2xl p-6 sm:p-10 border border-white/50 flex flex-col items-center">

              {/* Central Seal Logo */}
              <div className="w-20 h-20 mb-4 relative">
                <div className="absolute inset-0 rounded-full border-2 border-blue-900 bg-white shadow-sm flex items-center justify-center p-0.5">
                   <div className="w-full h-full rounded-full border border-red-600 flex flex-col items-center justify-center text-center p-1 overflow-hidden">
                      <div className="text-[5px] font-black text-blue-900 leading-none">ICCT COLLEGES</div>
                      <div className="text-[8px] font-black text-red-600 my-0.5">ICCT</div>
                      <div className="text-[4px] font-bold text-blue-900 leading-tight uppercase">A Global Pinoy Distinction</div>
                   </div>
                </div>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-center mb-6 tracking-tight">
                <span className="text-blue-900 uppercase">Student </span>
                <span className="text-yellow-500 uppercase">Registration </span>
              </h2>

              <form onSubmit={handleSubmit} className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                {error && (
                  <div className="sm:col-span-2 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-bold text-center">
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
                    className="bg-[#1a233a] text-white border-none h-10 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-400 text-xs"
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
                    className="bg-[#1a233a] text-white border-none h-10 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-400 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-blue-900 ml-1 uppercase tracking-wider">Student Number</label>
                  <Input
                    name="studentNumber"
                    value={formData.studentNumber}
                    onChange={handleInputChange}
                    required
                    placeholder="2023-XXXXX"
                    className="bg-[#1a233a] text-white border-none h-10 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-400 text-xs"
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
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-blue-900 ml-1 uppercase tracking-wider">Password</label>
                  <Input
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                    placeholder="••••••••"
                    className="bg-[#1a233a] text-white border-none h-10 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-400 text-xs"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-blue-900 ml-1 uppercase tracking-wider">Confirm Password</label>
                  <Input
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    required
                    placeholder="••••••••"
                    className="bg-[#1a233a] text-white border-none h-10 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-400 text-xs"
                  />
                </div>

                <div className="sm:col-span-2 pt-4">
                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-900 to-indigo-800 hover:from-blue-800 hover:to-indigo-700 text-white font-black h-12 rounded-xl shadow-xl transition-all active:scale-[0.98] uppercase tracking-widest"
                    disabled={loading}
                  >
                    {loading ? 'Creating Account...' : 'Register'}
                  </Button>
                </div>

                <div className="sm:col-span-2 text-center mt-2">
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

          {/* Welcome Text Section */}
          <div className="hidden lg:flex flex-col items-start select-none order-1 lg:order-2">
            <h1 className="text-5xl xl:text-7xl font-black text-blue-900 leading-[0.85] tracking-tighter italic drop-shadow-sm uppercase">
              Join Our<br />Community
            </h1>
            <div className="flex items-center mt-6 space-x-2">
              {['I', 'C', 'C', 'T'].map((char, index) => (
                <div
                  key={char}
                  className={`bg-white text-blue-900 text-4xl xl:text-6xl font-black px-4 py-2 rounded-2xl shadow-2xl border-b-8 border-gray-200 transition-transform hover:-translate-y-2 cursor-default`}
                  style={{ transform: `rotate(${index % 2 === 0 ? '-3deg' : '3deg'})` }}
                >
                  {char}
                </div>
              ))}
              <div
                className="bg-yellow-400 text-blue-900 text-4xl xl:text-6xl font-black px-4 py-2 rounded-2xl shadow-2xl border-b-8 border-yellow-600 transform rotate-12 transition-transform hover:rotate-0 cursor-default"
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

          <div className="text-[9px] font-medium text-gray-500 uppercase tracking-tighter text-right">
            © 2025 ICCT COLLEGES FOUNDATION INC.
          </div>
        </div>
      </div>
    </div>
  );
};


