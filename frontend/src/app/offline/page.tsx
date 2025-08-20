import Link from "next/link";

export const metadata = {
  title: "Offline",
};

// Ensure the page is pre-rendered for PWA caching
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-bold">You are offline</h1>
      <p className="text-gray-600">Please check your internet connection.</p>
      <Link
        href="/"
        className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
      >
        Retry
      </Link>
    </div>
  );
}
