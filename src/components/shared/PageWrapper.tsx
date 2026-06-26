// src/components/dashboard/PageWrapper.tsx
import { ReactNode } from "react";

type PageWrapperProps = {
  children: ReactNode;
};

export const PageWrapper = ({ children }: PageWrapperProps) => {
  return (
    <div className="min-h-screen overflow-y-auto bg-slate-950">
      {children}
    </div>
  );
};