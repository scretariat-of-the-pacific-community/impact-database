'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Mail } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const supportEmail =
    process.env.NEXT_PUBLIC_EMAIL_FROM_ADDRESS || 'noreply@oceanportal.io';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Reset your password
            </h1>
            <p className="text-gray-600 mt-2">
              Enter your email and we will help you recover access to your
              account.
            </p>
          </div>

          <form
            onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              setIsSending(true);

              const subject = 'Password reset request';
              const body = `Hello Support,%0D%0A%0D%0AI need to reset my password for ${encodeURIComponent(
                email.trim()
              )}.%0D%0A%0D%0AThank you.`;
              const mailto = `mailto:${encodeURIComponent(
                supportEmail
              )}?subject=${encodeURIComponent(subject)}&body=${body}`;

              window.location.href = mailto;
              toast.success('Opening your email client', {
                description: 'Complete the message to request a reset.',
              });
              setIsSending(false);
            }}
            className="space-y-4"
          >
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEmail(e.target.value)
                }
                required
                placeholder="your.email@example.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={isSending}
              className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <Mail className="w-5 h-5 mr-2" />
                  Email Support
                </>
              )}
            </button>
          </form>

          <div className="text-center mt-6">
            <button
              onClick={() => router.push('/auth/login')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Back to sign in
            </button>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-gray-500">
          We will never ask for your password by email.
        </div>
      </div>
    </div>
  );
}
