-- Initialize PostGIS extension for the Impact Database
-- This script is run when the PostgreSQL container starts for the first time

-- Create the PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Verify PostGIS installation
SELECT PostGIS_Version();

-- Create any additional spatial reference systems if needed
-- EPSG:4326 (WGS84) is included by default