import React, { useState } from 'react';
import { ShieldCheck, Lock } from 'lucide-react';
import { signInAsAdmin } from '../lib/firebase';

interface LoginScreenProps {
  onSuccess: () => void;
  authError: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onSuccess, authError }) => {
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setLocalError(null);
    try {
      await signInAsAdmin();
      onSuccess();
    } catch (err: any) {
      setLocalError(err?.message || 'Google sign-in was cancelled or failed.');
    } finally {
      setLoading(false);
    }
  };

  const errorMessage = localError || authError;

  return (
    <div className="min-h-screen bg-[#FAF8F4] flex flex-col lg:flex-row">
      <div className="lg:w-7/12 bg-[#1B4332] text-[#FAF8F4] p-8 lg:p-16 flex flex-col justify-between relative overflow-hidden">
        <div>
          <div className="text-xs tracking-[0.18em] text-[#D4AF6A] font-medium mb-4">
            TREEWALLEY FURNITURE · INTERNAL OPERATIONS
          </div>
          <h1 className="font-display text-4xl lg:text-5xl font-bold leading-tight max-w-xl text-balance">
            TreeWalley SEO Command Center
          </h1>
          <p className="mt-5 text-[#D8E2DC] text-base max-w-lg leading-relaxed">
            Private single-administrator platform for Search Console analytics, multilingual solid-wood editorial publishing, Blogger automation, and monthly SEO audits.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-[#2D5A45] pt-8">
          <div>
            <div className="text-xs text-[#D4AF6A] font-medium mb-1">Brand Focus</div>
            <p className="text-sm text-[#E9EFEA] leading-relaxed">
              Solid Sheesham wood beds, king &amp; queen beds, wooden wardrobes, almari, coffee tables, dining sets, and TV units.
            </p>
          </div>
          <div>
            <div className="text-xs text-[#D4AF6A] font-medium mb-1">Security Boundary</div>
            <p className="text-sm text-[#E9EFEA] leading-relaxed">
              Restricted to one allowlisted administrator account. All Google API calls and OAuth tokens remain encrypted server-side.
            </p>
          </div>
        </div>
      </div>

      <div className="lg:w-5/12 flex items-center justify-center p-8 lg:p-14 bg-[#FAF8F4]">
        <div className="w-full max-w-md bg-white border border-[#E6E0D6] rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-md bg-[#1B4332] text-[#D4AF6A] flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-[#1D221F]">
                Administrator Sign-In
              </h2>
              <p className="text-xs text-[#5C635E]">
                Private workspace · No public registration
              </p>
            </div>
          </div>

          <p className="text-sm text-[#49504B] leading-relaxed mb-6">
            Authenticate with your authorized Google account to access Search Console metrics, Blogger publishing controls, and the AI editorial studio.
          </p>

          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] text-[#991B1B] text-xs leading-relaxed">
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="w-full h-11 px-4 rounded-md border border-[#D4CFC5] bg-white hover:bg-[#FAF8F4] text-[#1D221F] font-medium text-sm flex items-center justify-center gap-3 transition-colors cursor-pointer disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            <span className="whitespace-nowrap">
              {loading ? 'Verifying Administrator...' : 'Sign in with Google'}
            </span>
          </button>

          <div className="mt-6 pt-5 border-t border-[#E6E0D6] flex items-center gap-2 text-xs text-[#5C635E]">
            <ShieldCheck className="w-4 h-4 text-[#1B4332] shrink-0" />
            <span>Single-admin allowlist enforced on every API route.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
