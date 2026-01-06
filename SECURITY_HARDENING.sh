#!/bin/bash
# Security Hardening Script - Remove Sensitive Files from Git History
# 
# WARNING: This script rewrites git history. All team members must re-clone.
# Run this ONLY after coordinating with your team and backing up the repository.

set -e

echo "========================================="
echo "Security Hardening: Git History Cleanup"
echo "========================================="
echo ""
echo "⚠️  WARNING: This will rewrite git history!"
echo "⚠️  All team members must re-clone the repository after this runs."
echo ""
read -p "Have you backed up the repository and coordinated with your team? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborting. Please backup and coordinate before proceeding."
    exit 1
fi

echo ""
echo "Step 1: Installing git-filter-repo (if not already installed)..."
echo "-------------------------------------------------------------"

# Check if git-filter-repo is available
if ! command -v git-filter-repo &> /dev/null; then
    echo "git-filter-repo not found. Installing..."
    
    # Try pip install
    if command -v pip3 &> /dev/null; then
        pip3 install --user git-filter-repo
    elif command -v pip &> /dev/null; then
        pip install --user git-filter-repo
    else
        echo "ERROR: Could not install git-filter-repo. Please install manually:"
        echo "  pip install git-filter-repo"
        echo "  or download from: https://github.com/newren/git-filter-repo"
        exit 1
    fi
fi

echo "✓ git-filter-repo is available"
echo ""

echo "Step 2: Creating backup branch..."
echo "-------------------------------------------------------------"
git branch backup-before-filter-$(date +%Y%m%d-%H%M%S) || true
echo "✓ Backup branch created"
echo ""

echo "Step 3: Removing sensitive files from git history..."
echo "-------------------------------------------------------------"
echo "Removing:"
echo "  - .env.production"
echo "  - .env.production.example"
echo ""

# Remove the sensitive files from all commits
git filter-repo --invert-paths \
    --path .env.production \
    --path .env.production.example \
    --force

echo "✓ Files removed from git history"
echo ""

echo "Step 4: Verifying removal..."
echo "-------------------------------------------------------------"
if git log --all --full-history -- .env.production | grep -q "commit"; then
    echo "⚠️  WARNING: .env.production still found in history"
    echo "Manual verification needed"
else
    echo "✓ .env.production successfully removed from history"
fi

if git log --all --full-history -- .env.production.example | grep -q "commit"; then
    echo "⚠️  WARNING: .env.production.example still found in history"
    echo "Manual verification needed"
else
    echo "✓ .env.production.example successfully removed from history"
fi

echo ""
echo "========================================="
echo "NEXT STEPS:"
echo "========================================="
echo ""
echo "1. Force push to remote (DESTRUCTIVE):"
echo "   git push origin --force --all"
echo "   git push origin --force --tags"
echo ""
echo "2. Notify all team members to:"
echo "   - Delete their local clones"
echo "   - Re-clone the repository: git clone <repo-url>"
echo ""
echo "3. Regenerate ALL production secrets:"
echo "   - Run: python3 scripts/generate_secrets.py"
echo "   - Update production deployment with new secrets"
echo ""
echo "4. Rotate compromised credentials immediately:"
echo "   - Change database passwords"
echo "   - Regenerate MinIO keys"
echo "   - Create new SECRET_KEY"
echo ""
echo "========================================="
echo "Script completed. Repository history has been rewritten."
echo "========================================="
