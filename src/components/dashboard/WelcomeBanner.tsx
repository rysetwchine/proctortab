import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebase';
import campusBanner from '@/assets/icct-campus-banner.png';

interface WelcomeBannerProps {
  studentName?: string;
}

function resolveDisplayName(studentName?: string, firebaseDisplayName?: string | null): string {
  if (studentName?.trim()) return studentName.trim();
  if (firebaseDisplayName?.trim()) return firebaseDisplayName.trim();

  try {
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    if (storedUser?.name?.trim()) return storedUser.name.trim();
  } catch {
    // ignore malformed localStorage
  }

  return 'Student';
}

function IcctLogoMark() {
  return (
    <div
      className="shrink-0 rounded border border-gray-200/80 bg-white p-1.5 shadow-sm sm:p-2"
      aria-hidden
    >
      <div className="text-icct-navy text-sm font-black leading-none sm:text-base md:text-lg">ICCT</div>
      <div className="text-icct-navy text-[6px] font-bold uppercase leading-tight sm:text-[7px] md:text-[8px]">
        Colleges
      </div>
      <div className="mt-0.5 bg-red-600 px-1 py-0.5 text-center text-[5px] text-white sm:text-[6px]">
        www.icct.edu.ph
      </div>
    </div>
  );
}

function YellowAccentStrokes({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <span className="block h-3 w-0.5 rounded-full bg-icct-yellow sm:h-4 sm:w-1" />
      <span className="block h-5 w-0.5 rounded-full bg-icct-yellow sm:h-6 sm:w-1" />
      <span className="block h-7 w-0.5 rounded-full bg-icct-yellow sm:h-8 sm:w-1" />
    </div>
  );
}

export const WelcomeBanner = ({ studentName }: WelcomeBannerProps) => {
  const [firebaseDisplayName, setFirebaseDisplayName] = useState<string | null>(
    auth.currentUser?.displayName ?? null
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseDisplayName(user?.displayName ?? null);
    });
    return unsubscribe;
  }, []);

  const displayName = resolveDisplayName(studentName, firebaseDisplayName);

  return (
    <section
      className="relative h-[300px] w-full overflow-hidden rounded-3xl shadow-[0_8px_30px_rgba(16,42,114,0.12)] sm:h-[340px] md:h-[360px] lg:h-[380px]"
      aria-label="Welcome banner"
    >
      <img
        src={campusBanner}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover object-center"
      />

      <div className="welcome-banner-overlay absolute inset-0" />

      <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-6 md:p-8 lg:p-10">
        <div className="flex max-w-2xl flex-col gap-1 sm:gap-1.5 md:gap-2">
          <h2 className="text-[1.75rem] font-extrabold leading-[0.95] text-icct-navy sm:text-4xl md:text-5xl lg:text-[3.25rem]">
            Welcome back,
          </h2>

          <div className="relative mt-0.5 inline-flex w-fit max-w-full items-end gap-2 sm:mt-1 sm:gap-3">
            <YellowAccentStrokes className="mb-2 hidden flex-col items-center gap-1 sm:flex" />

            <div className="relative min-w-0">
              <p className="font-script text-[2.5rem] leading-none text-icct-blue sm:text-5xl md:text-6xl lg:text-7xl">
                {displayName}!
              </p>
              <span className="absolute -bottom-0.5 left-0 h-[3px] w-[88%] rounded-full bg-icct-blue md:h-1" />
            </div>

            <YellowAccentStrokes className="mb-1 hidden flex-col-reverse items-center gap-1 sm:flex" />
          </div>

          <p className="mt-2 max-w-md text-xs leading-relaxed text-gray-700 sm:mt-3 sm:text-sm md:text-base lg:max-w-lg">
            Welcome to ProctorTab Student Portal.
            <br />
            Access your assessments, courses,
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>
            and account information in one place.
          </p>
        </div>

        <div className="flex items-center gap-2.5 md:gap-3">
          <IcctLogoMark />
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-wide text-icct-navy md:text-base lg:text-lg">
              ICCT COLLEGES
            </p>
            <p className="text-[10px] font-medium text-gray-600 md:text-xs lg:text-sm">
              Global Pinoy Distinction
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
