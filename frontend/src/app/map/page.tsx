'use client';

import Link from 'next/link';

export default function MapPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Map View</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-gray-600 mb-4">
            Interactive map functionality coming soon!
          </p>
          <p className="text-gray-600">
            For now, please use the{' '}
            <Link href="/search" className="text-blue-600 hover:text-blue-800">
              Search
            </Link>
            {' '}or{' '}
            <Link href="/images" className="text-blue-600 hover:text-blue-800">
              Images
            </Link>
            {' '}pages to browse the database.
          </p>
        </div>
      </div>
    </div>
  );
}
