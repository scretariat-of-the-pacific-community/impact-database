'use client';

import { useQuery } from '@tanstack/react-query';
import { imageApi } from '@/lib/api';
import { 
  Upload, 
  MapPin, 
  Calendar, 
  Image, 
  Search, 
  Filter,
  Globe,
  Waves,
  Shield,
  TrendingUp,
  Users,
  Database
} from 'lucide-react';
import Link from 'next/link';

export default function OceanPortalDashboard() {
  const { data: images, isLoading, error } = useQuery({
    queryKey: ['images'],
    queryFn: () => imageApi.getAll().then(res => res.data),
  });

  const stats = {
    total: images?.length || 0,
    hazardTypes: new Set(images?.map(img => img.hazard_type)).size || 0,
    organizations: new Set(images?.map(img => img.contact?.organisation_name).filter(Boolean)).size || 0,
    withCoordinates: images?.filter(img => img.latitude && img.longitude).length || 0,
  };

  const recentImages = images?.slice(0, 6) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50">
      {/* Hero Header */}
      <header className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-3">
              <Waves className="w-8 h-8" />
              <div>
                <h1 className="text-3xl font-bold">SPC Ocean Portal</h1>
                <p className="text-blue-100 text-sm">Impact Assessment Database</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link 
                href="/search" 
                className="bg-white/10 text-white px-4 py-2 rounded-md hover:bg-white/20 flex items-center gap-2 transition-colors"
              >
                <Search className="w-4 h-4" />
                Search Catalog
              </Link>
              <Link 
                href="/upload" 
                className="bg-white text-blue-600 px-4 py-2 rounded-md hover:bg-gray-50 flex items-center gap-2 font-medium transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload Image
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Welcome Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Pacific Islands Impact Assessment Portal
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Discover, search, and analyze disaster and hazard impact images from across the Pacific Island region. 
            Our comprehensive database supports evidence-based decision making for resilience and adaptation planning.
          </p>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Database className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Records</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString()}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-green-100 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-lg">
                <Shield className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Hazard Types</p>
                <p className="text-2xl font-bold text-gray-900">{stats.hazardTypes}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-purple-100 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Globe className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Organizations</p>
                <p className="text-2xl font-bold text-gray-900">{stats.organizations}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-orange-100 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="p-3 bg-orange-100 rounded-lg">
                <MapPin className="w-6 h-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Geolocated</p>
                <p className="text-2xl font-bold text-gray-900">{stats.withCoordinates}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <Link href="/search" className="group">
            <div className="bg-white p-8 rounded-xl shadow-sm border hover:shadow-lg transition-all duration-300 group-hover:border-blue-300">
              <div className="flex items-center mb-4">
                <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                  <Search className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 ml-4">Search & Browse</h3>
              </div>
              <p className="text-gray-600 mb-4">
                Search the comprehensive catalog with advanced filters by hazard type, location, time range, and metadata criteria.
              </p>
              <div className="flex items-center text-blue-600 font-medium group-hover:text-blue-700">
                Explore Catalog
                <Filter className="w-4 h-4 ml-2" />
              </div>
            </div>
          </Link>
          
          <Link href="/map" className="group">
            <div className="bg-white p-8 rounded-xl shadow-sm border hover:shadow-lg transition-all duration-300 group-hover:border-green-300">
              <div className="flex items-center mb-4">
                <div className="p-3 bg-green-50 rounded-lg group-hover:bg-green-100 transition-colors">
                  <MapPin className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 ml-4">Interactive Map</h3>
              </div>
              <p className="text-gray-600 mb-4">
                Explore geolocated impact images on an interactive map with spatial search and filtering capabilities.
              </p>
              <div className="flex items-center text-green-600 font-medium group-hover:text-green-700">
                View Map
                <Globe className="w-4 h-4 ml-2" />
              </div>
            </div>
          </Link>
          
          <Link href="/analytics" className="group">
            <div className="bg-white p-8 rounded-xl shadow-sm border hover:shadow-lg transition-all duration-300 group-hover:border-purple-300">
              <div className="flex items-center mb-4">
                <div className="p-3 bg-purple-50 rounded-lg group-hover:bg-purple-100 transition-colors">
                  <TrendingUp className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 ml-4">Analytics & Insights</h3>
              </div>
              <p className="text-gray-600 mb-4">
                Analyze hazard patterns, trends, and impacts across the Pacific region with data visualization tools.
              </p>
              <div className="flex items-center text-purple-600 font-medium group-hover:text-purple-700">
                View Analytics
                <TrendingUp className="w-4 h-4 ml-2" />
              </div>
            </div>
          </Link>
        </div>

        {/* Recent Additions */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="px-8 py-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-gray-900">Recent Additions</h2>
              <Link 
                href="/search?sort=newest" 
                className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
              >
                View All
                <Search className="w-4 h-4" />
              </Link>
            </div>
          </div>
          <div className="p-8">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">Loading recent images...</span>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <p className="text-red-600 font-medium">Error loading recent images</p>
                <p className="text-gray-500 text-sm mt-2">Please try refreshing the page</p>
              </div>
            ) : recentImages.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {recentImages.map((image) => (
                  <Link key={image.filename} href={`/images/${image.id}`} className="group">
                    <div className="border border-gray-200 rounded-lg p-6 hover:border-blue-300 hover:shadow-md transition-all duration-200">
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                          {image.title || image.filename}
                        </h4>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                          {image.hazard_type}
                        </span>
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                        {image.abstract || image.purpose || 'No description available'}
                      </p>
                      
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <div className="flex items-center">
                          <MapPin className="w-3 h-3 mr-1" />
                          {image.latitude && image.longitude ? (
                            <span>{image.latitude.toFixed(2)}, {image.longitude.toFixed(2)}</span>
                          ) : (
                            <span>Location not specified</span>
                          )}
                        </div>
                        <div className="flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          <span>{new Date(image.upload_date || Date.now()).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Image className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">No images in the database yet</p>
                <p className="text-gray-400 text-sm mt-2">
                  Start by uploading your first impact assessment image
                </p>
                <Link 
                  href="/upload" 
                  className="inline-flex items-center mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload First Image
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Quick Links Footer */}
        <div className="mt-12 bg-gray-50 rounded-xl p-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 text-center">Quick Access</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/hazards/flood" className="flex items-center p-3 bg-white rounded-lg hover:bg-blue-50 transition-colors">
              <Waves className="w-5 h-5 text-blue-600 mr-3" />
              <span className="text-sm font-medium text-gray-700">Flood Images</span>
            </Link>
            <Link href="/hazards/cyclone" className="flex items-center p-3 bg-white rounded-lg hover:bg-green-50 transition-colors">
              <Shield className="w-5 h-5 text-green-600 mr-3" />
              <span className="text-sm font-medium text-gray-700">Cyclone Data</span>
            </Link>
            <Link href="/countries" className="flex items-center p-3 bg-white rounded-lg hover:bg-purple-50 transition-colors">
              <Globe className="w-5 h-5 text-purple-600 mr-3" />
              <span className="text-sm font-medium text-gray-700">By Country</span>
            </Link>
            <Link href="/about" className="flex items-center p-3 bg-white rounded-lg hover:bg-orange-50 transition-colors">
              <Users className="w-5 h-5 text-orange-600 mr-3" />
              <span className="text-sm font-medium text-gray-700">About Portal</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
