import Link from "next/link";
import { WifiOff, RefreshCcw, UploadCloud } from "lucide-react";

export const metadata = {
  title: "Offline | Ocean Portal",
};

export const dynamic = "force-static";

const OfflineActions = [
  {
    title: "Browse cached data",
    description: "Previously visited pages remain available. Use the main navigation to revisit them.",
    href: "/",
  },
  {
    title: "Queue uploads",
    description: "Capture evidence in the upload form – we will automatically submit it when connectivity returns.",
    href: "/upload",
  },
  {
    title: "Review field notes",
    description: "Use the hazards or images pages to double-check already synced content.",
    href: "/images",
  },
];

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6 text-center bg-gradient-to-b from-surface-muted to-white">
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-full bg-orange-50 p-4 text-orange-600">
          <WifiOff className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-semibold text-slate-900">You are offline</h1>
        <p className="max-w-xl text-sm text-slate-600">
          No worries—anything you capture while offline will stay on this device and sync the moment we detect a
          connection again.
        </p>
      </div>

      <div className="grid w-full max-w-3xl gap-4 md:grid-cols-3">
        {OfflineActions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-200 hover:shadow-md"
          >
            <h2 className="text-base font-semibold text-slate-900">{action.title}</h2>
            <p className="text-sm text-slate-600">{action.description}</p>
          </Link>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 p-6 text-sm text-slate-700 shadow-sm">
        <RefreshCcw className="h-6 w-6 text-brand-600" />
        <p>Once you are back online, hit “Retry” and we will resume where you left off.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-500"
        >
          <UploadCloud className="h-4 w-4" />
          Retry connection
        </Link>
      </div>
    </div>
  );
}
