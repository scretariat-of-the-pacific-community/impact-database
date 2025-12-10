import Link from 'next/link';

export default function TestPage() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>✅ Frontend is Working!</h1>
      <p>If you can see this page, the Next.js server is running correctly.</p>
      <p>The issue is with the home page compilation.</p>
      <Link href="/">Try Home Page (may crash)</Link>
    </div>
  );
}
