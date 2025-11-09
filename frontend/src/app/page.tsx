export default function Home() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ color: '#0ea5e9', marginBottom: '1rem' }}>✅ Frontend is Working!</h1>
      <p>The Next.js server is running successfully.</p>
      <p style={{ color: '#666', fontSize: '0.9rem' }}>
        Original page has been temporarily replaced with this test page.
        Check page.tsx.backup for the original content.
      </p>
    </div>
  );
}
