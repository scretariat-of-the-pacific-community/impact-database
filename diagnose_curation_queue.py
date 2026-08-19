#!/usr/bin/env python3
"""
Diagnostic script to identify why curation queue may be returning empty results.

This checks the four main causes of empty queue responses:
1. curation_queue table is empty
2. User has wrong role for viewing content
3. All items are soft-deleted
4. SQL error being silently caught
"""

import os
import sys
import json
from datetime import datetime
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import DictCursor

load_dotenv()

def get_db_connection():
    """Connect to PostgreSQL database"""
    try:
        # Try Docker Compose first
        import subprocess
        result = subprocess.run(
            ["docker-compose", "exec", "-T", "postgis_db", "psql", "-U", "postgres", "-d", "impact_db", "-c", "SELECT 1"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            # Using docker-compose for queries
            return "docker"
        
        # Fallback to direct connection
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST", "localhost"),
            port=os.getenv("DB_PORT", "5432"),
            database=os.getenv("DB_NAME", "impact_db"),
            user=os.getenv("DB_USER", "postgres"),
            password=os.getenv("DB_PASSWORD", ""),
        )
        return conn
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        return None

def exec_query(sql):
    """Execute query via docker-compose"""
    import subprocess
    result = subprocess.run(
        ["docker-compose", "exec", "-T", "postgis_db", "psql", "-U", "postgres", "-d", "impact_db", "-c", sql],
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        raise Exception(f"Query failed: {result.stderr}")
    return result.stdout

def diagnose():
    """Run diagnostics"""
    print("\n🔍 CURATION QUEUE DIAGNOSTICS\n")
    print("=" * 60)
    
    # 1. Check if curation_queue table has any data
    print("\n1️⃣  CURATION QUEUE DATA")
    print("-" * 60)
    try:
        sql = "SELECT COUNT(*) FROM curation_queue; SELECT COUNT(*) FROM curation_queue WHERE COALESCE(is_deleted, false) = false"
        output = exec_query(sql)
        lines = [l.strip() for l in output.strip().split('\n') if l.strip() and not '-' in l and not '|' in l and not 'count' in l.lower()]
        if len(lines) >= 2:
            total = int(lines[0])
            active = int(lines[1])
        else:
            total = 0
            active = 0
        
        print(f"   Total records: {total}")
        print(f"   Active (not deleted): {active}")
        
        if total == 0:
            print("   ❌ PROBLEM: Queue is empty - run populate_curation_queue.py")
        elif active == 0:
            print("   ⚠️  WARNING: All items are soft-deleted (is_deleted=true)")
        else:
            print(f"   ✅ Queue has {active} items available")
    except Exception as e:
        print(f"   ❌ Database error: {e}")
    
    # 2. Check role distribution
    print("\n2️⃣  USER ROLES")
    print("-" * 60)
    try:
        sql = """SELECT r.id, r.name, COUNT(u.id) as user_count FROM roles r LEFT JOIN users u ON r.id = u.role_id GROUP BY r.id, r.name ORDER BY r.id"""
        output = exec_query(sql)
        lines = output.strip().split('\n')
        for line in lines:
            if 'name' in line or '|' in line or '-' in line:
                continue
            parts = line.split('|')
            if len(parts) == 2:
                role = parts[0].strip()
                count = parts[1].strip()
                print(f"   {role}: {count} users")
    except Exception as e:
        print(f"   ❌ Database error: {e}")
    
    # 3. Check queue distribution by role
    print("\n3️⃣  QUEUE DISTRIBUTION BY SUBMITTER ROLE")
    print("-" * 60)
    try:
        sql = """SELECT r.name, COUNT(cq.id) as queued_items FROM curation_queue cq LEFT JOIN users u ON cq.submitted_by = u.id LEFT JOIN roles r ON u.role_id = r.id WHERE COALESCE(cq.is_deleted, false) = false GROUP BY r.name ORDER BY queued_items DESC"""
        output = exec_query(sql)
        lines = output.strip().split('\n')
        for line in lines:
            if 'name' in line or '-' in line:
                continue
            parts = line.split('|')
            if len(parts) == 2:
                role = parts[0].strip() or 'unknown'
                count = parts[1].strip()
                print(f"   {role}: {count} items")
    except Exception as e:
        print(f"   ❌ Database error: {e}")
    
    # 4. Check for soft-deleted items
    print("\n4️⃣  SOFT-DELETE STATUS")
    print("-" * 60)
    try:
        sql = """SELECT COALESCE(is_deleted, false) as is_deleted, COUNT(*) as count FROM curation_queue GROUP BY COALESCE(is_deleted, false) ORDER BY is_deleted"""
        output = exec_query(sql)
        lines = output.strip().split('\n')
        for line in lines:
            if 'is_deleted' in line or '-' in line:
                continue
            parts = line.split('|')
            if len(parts) == 2:
                status = "DELETED" if 't' in parts[0] else "ACTIVE"
                count = parts[1].strip()
                print(f"   {status}: {count} items")
    except Exception as e:
        print(f"   ❌ Database error: {e}")
    
    # 5. Sample queue items
    print("\n5️⃣  SAMPLE QUEUE ITEMS")
    print("-" * 60)
    try:
        sql = """SELECT id, content_type, status, COALESCE(is_deleted, false) as is_deleted FROM curation_queue ORDER BY created_at DESC LIMIT 3"""
        output = exec_query(sql)
        lines = output.strip().split('\n')
        count = 0
        for line in lines:
            if 'id' in line or '-' in line or '|' not in line:
                continue
            parts = [p.strip() for p in line.split('|')]
            if len(parts) >= 4:
                print(f"\n   #{count+1}")
                print(f"   ID: {parts[0][:8]}...")
                print(f"   Type: {parts[1]}, Status: {parts[2]}")
                print(f"   Deleted: {parts[3]}")
                count += 1
    except Exception as e:
        print(f"   ❌ Database error: {e}")
    
    print("\n" + "=" * 60)
    print("\n✅ RECOMMENDATIONS:")
    print("-" * 60)
    print("""
If queue shows empty in UI but diagnostics show data:
1. Verify you're logged in as an ADMIN user
2. Check browser console for JavaScript errors
3. Check API logs: docker-compose logs api | grep -i queue
4. Verify COALESCE(is_deleted, false) is in the SQL filter
5. Try with ?show_all=true parameter to bypass role filters

If queue is empty but data exists:
1. Run: python scripts/populate_curation_queue.py
2. Check: fix_database.sh (runs migration scripts)
3. Verify: docker-compose restart api
    """)

if __name__ == "__main__":
    diagnose()
