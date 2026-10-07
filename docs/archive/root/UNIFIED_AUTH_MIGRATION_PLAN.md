# Unified Authentication System Migration Plan

## Executive Summary

Migrate from dual authentication system (admin_users + users) to single unified RBAC-based authentication system. Estimated timeline: 2-3 sprints (4-6 weeks).

---

## Current State Analysis

### System Architecture
```
┌─────────────────┐         ┌──────────────────┐
│  Admin Panel    │         │  Main Application│
│  /api/auth/login│         │  /api/rbac/auth  │
└────────┬────────┘         └────────┬─────────┘
         │                           │
         ▼                           ▼
┌─────────────────┐         ┌──────────────────┐
│  admin_users    │         │     users        │
│  - username     │         │  - username      │
│  - email        │         │  - email         │
│  - password_hash│         │  - hashed_pass   │
│  - salt         │◄────────┤  - role_id       │
│  - role (enum)  │  sync!  │  - permissions   │
│  - organization │         │  - profile fields│
└─────────────────┘         └──────────────────┘
```

### Tables Comparison

| Feature | admin_users | users (RBAC) | Decision |
|---------|-------------|--------------|----------|
| Primary Key | UUID | UUID | ✓ Compatible |
| Username | string | string | ✓ Keep |
| Email | string | string (unique) | ✓ Keep |
| Password | bcrypt+salt | bcrypt | → Migrate to bcrypt only |
| Roles | Enum (SUPER_ADMIN, ADMIN, VIEWER) | FK to roles table | → Use RBAC roles |
| Permissions | Role-based | Role + custom | → Use RBAC (richer) |
| Profile | organization, position | full_name, bio, avatar, department | → Use RBAC (richer) |
| Sessions | user_sessions table | JWT-based | → Keep JWT |
| Audit | user_audit_log | - | → Migrate to unified audit |

**Winner: RBAC `users` table** - More feature-rich, extensible, already integrated

---

## Target Architecture

### Unified User Model
```python
# models/rbac.py - Enhanced unified user model

class User(Base):
    """Unified user model with admin capabilities"""
    __tablename__ = "users"
    
    # Core identity
    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    username = Column(String(100), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    
    # Authentication
    hashed_password = Column(String(255), nullable=True)  # Nullable for SSO
    sso_provider = Column(String(50), nullable=True)
    sso_provider_id = Column(String(255), nullable=True)
    
    # Authorization
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    custom_permissions = Column(ARRAY(String), default=[])  # NEW: For granular control
    
    # Admin-specific fields (NEW)
    is_super_admin = Column(Boolean, default=False)  # NEW: Replaces SUPER_ADMIN role
    can_access_admin_panel = Column(Boolean, default=False)  # NEW: Admin panel access
    organization = Column(String(255), nullable=True)  # MIGRATED from admin_users
    
    # Profile
    full_name = Column(String(255), nullable=True)
    position = Column(String(100), nullable=True)
    department = Column(String(100), nullable=True)
    bio = Column(Text, nullable=True)
    avatar_url = Column(String(500), nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    is_locked = Column(Boolean, default=False)
    
    # Security
    failed_login_attempts = Column(Integer, default=0)  # MIGRATED
    lockout_until = Column(DateTime(timezone=True), nullable=True)  # MIGRATED
    last_password_change = Column(DateTime(timezone=True), nullable=True)  # MIGRATED
    email_verification_token = Column(String(255), nullable=True)  # MIGRATED
    
    # Timestamps
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    role = relationship("Role", back_populates="users")
    audit_logs = relationship("AuditLog", back_populates="user")  # MIGRATED
```

### Role Mapping Strategy
```python
# Migration mapping
ADMIN_ROLE_TO_RBAC = {
    "SUPER_ADMIN": ("admin", {"is_super_admin": True, "can_access_admin_panel": True}),
    "ADMIN": ("admin", {"is_super_admin": False, "can_access_admin_panel": True}),
    "VIEWER": ("viewer", {"is_super_admin": False, "can_access_admin_panel": True}),
}
```

---

## Migration Phases

### **Phase 1: Preparation** (Week 1)
**Goal**: Set up migration infrastructure without breaking production

#### Tasks:
1. **Add migration tracking columns to users table**
   ```sql
   ALTER TABLE users ADD COLUMN migrated_from_admin BOOLEAN DEFAULT FALSE;
   ALTER TABLE users ADD COLUMN migration_date TIMESTAMP;
   ALTER TABLE users ADD COLUMN legacy_admin_id UUID;
   ```

2. **Add admin fields to users table**
   ```sql
   ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE;
   ALTER TABLE users ADD COLUMN can_access_admin_panel BOOLEAN DEFAULT FALSE;
   ALTER TABLE users ADD COLUMN organization VARCHAR(255);
   ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
   ALTER TABLE users ADD COLUMN lockout_until TIMESTAMP WITH TIME ZONE;
   ALTER TABLE users ADD COLUMN last_password_change TIMESTAMP WITH TIME ZONE;
   ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(255);
   ```

3. **Create migration audit table**
   ```sql
   CREATE TABLE auth_migration_log (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     admin_user_id UUID,
     rbac_user_id UUID,
     migration_type VARCHAR(50), -- 'initial', 'update', 'conflict_resolved'
     status VARCHAR(50), -- 'success', 'failed', 'skipped'
     conflicts JSONB,
     migrated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );
   ```

4. **Create UnifiedUserService** (abstraction layer)
   ```python
   # app/services/unified_user_service.py
   class UnifiedUserService:
       """Temporary service to abstract dual-system during migration"""
       
       def __init__(self, db: Session):
           self.db = db
           self.use_legacy = os.getenv("USE_LEGACY_AUTH", "false").lower() == "true"
       
       def get_user(self, identifier: str) -> User:
           """Get user from primary system (RBAC users)"""
           pass
       
       def authenticate(self, username: str, password: str) -> Optional[User]:
           """Unified authentication"""
           pass
       
       def create_user(self, data: UserCreate) -> User:
           """Create user in primary system, optionally sync to legacy"""
           pass
   ```

**Deliverables**:
- [ ] Database schema updated
- [ ] Migration infrastructure code
- [ ] UnifiedUserService implemented
- [ ] Unit tests for service layer

---

### **Phase 2: Data Migration** (Week 2)
**Goal**: Migrate existing admin_users to users table

#### Tasks:

1. **Pre-migration validation script**
   ```python
   # scripts/validate_pre_migration.py
   def validate_admin_users():
       """Check for data quality issues before migration"""
       issues = []
       
       # Check for duplicate emails
       duplicates = db.query(AdminUser.email).group_by(AdminUser.email).having(count() > 1)
       
       # Check for username conflicts
       conflicts = check_username_conflicts_with_rbac()
       
       # Check for invalid roles
       invalid_roles = check_invalid_roles()
       
       return issues
   ```

2. **Migration script with rollback capability**
   ```python
   # scripts/migrate_admin_to_rbac.py
   
   def migrate_admin_user_to_rbac(admin_user: AdminUser, dry_run=False):
       """Migrate single admin user to RBAC system"""
       
       # Check if already migrated
       existing = db.query(User).filter(User.email == admin_user.email).first()
       if existing:
           if existing.legacy_admin_id == admin_user.id:
               log_migration(admin_user.id, existing.id, 'skipped', 'already_migrated')
               return existing
           else:
               # Conflict: user exists but not from migration
               return handle_conflict(admin_user, existing)
       
       # Map role
       rbac_role_name, admin_flags = ADMIN_ROLE_TO_RBAC[admin_user.role]
       rbac_role = db.query(Role).filter(Role.name == rbac_role_name).first()
       
       # Create RBAC user
       new_user = User(
           id=uuid.uuid4(),
           username=admin_user.username,
           email=admin_user.email,
           hashed_password=admin_user.password_hash,  # Direct copy (bcrypt compatible)
           full_name=admin_user.full_name,
           role_id=rbac_role.id,
           is_super_admin=admin_flags["is_super_admin"],
           can_access_admin_panel=admin_flags["can_access_admin_panel"],
           organization=admin_user.organization,
           position=admin_user.position,
           is_active=admin_user.is_active,
           is_verified=admin_user.is_verified,
           is_locked=admin_user.is_locked,
           failed_login_attempts=admin_user.failed_login_attempts,
           lockout_until=admin_user.lockout_until,
           last_password_change=admin_user.last_password_change,
           email_verification_token=admin_user.email_verification_token,
           last_login=admin_user.last_login,
           created_at=admin_user.created_at,
           updated_at=admin_user.updated_at,
           # Migration tracking
           migrated_from_admin=True,
           migration_date=datetime.now(timezone.utc),
           legacy_admin_id=admin_user.id,
       )
       
       if not dry_run:
           db.add(new_user)
           db.commit()
           log_migration(admin_user.id, new_user.id, 'success', None)
       
       return new_user
   
   def migrate_all_admin_users(dry_run=True):
       """Migrate all admin users with progress tracking"""
       admin_users = db.query(AdminUser).all()
       results = {"success": 0, "failed": 0, "skipped": 0, "conflicts": []}
       
       for admin_user in admin_users:
           try:
               result = migrate_admin_user_to_rbac(admin_user, dry_run)
               results["success"] += 1
           except ConflictError as e:
               results["conflicts"].append({
                   "admin_user_id": admin_user.id,
                   "email": admin_user.email,
                   "conflict": str(e)
               })
               results["failed"] += 1
           except Exception as e:
               logger.error(f"Migration failed for {admin_user.email}: {e}")
               results["failed"] += 1
       
       return results
   ```

3. **Run migration**
   ```bash
   # Dry run first
   python scripts/migrate_admin_to_rbac.py --dry-run
   
   # Review results, resolve conflicts
   
   # Execute migration
   python scripts/migrate_admin_to_rbac.py --execute
   ```

4. **Migrate audit logs**
   ```python
   # Link old admin audit logs to new RBAC users
   UPDATE user_audit_log
   SET user_id = (
     SELECT rbac_user_id FROM auth_migration_log
     WHERE admin_user_id = user_audit_log.user_id
   )
   WHERE user_id IN (SELECT id FROM admin_users);
   ```

**Deliverables**:
- [ ] Migration scripts tested in staging
- [ ] All admin_users migrated to users table
- [ ] Audit logs linked to new users
- [ ] Migration report with conflicts resolved

---

### **Phase 3: Code Migration** (Week 3-4)
**Goal**: Update all endpoints to use unified system

#### Tasks:

1. **Update authentication endpoints**
   ```python
   # app/api/auth.py - Consolidate into single auth system
   
   @router.post("/login")  # Unified endpoint
   async def login(
       credentials: OAuth2PasswordRequestForm = Depends(),
       db: Session = Depends(get_db)
   ):
       """Unified login for both admin panel and main app"""
       user_service = UnifiedUserService(db)
       user = user_service.authenticate(credentials.username, credentials.password)
       
       if not user:
           raise HTTPException(401, "Invalid credentials")
       
       # Single JWT token works for both systems
       token = create_access_token(data={"sub": user.username})
       
       return {
           "access_token": token,
           "token_type": "bearer",
           "user": {
               "id": str(user.id),
               "username": user.username,
               "email": user.email,
               "role": user.role.name,
               "can_access_admin": user.can_access_admin_panel,
               "is_super_admin": user.is_super_admin,
           }
       }
   ```

2. **Update admin panel endpoints**
   ```python
   # app/api/admin.py - Use unified User model
   
   @router.post("/users/invite")
   async def invite_user(
       invite_data: InviteUserRequest,
       current_user: User = Depends(require_admin_access),  # Updated dependency
       db: Session = Depends(get_db)
   ):
       """Invite user - now creates only RBAC user"""
       user_service = UnifiedUserService(db)
       
       # Map admin role to RBAC role
       rbac_role_name, admin_flags = ADMIN_ROLE_TO_RBAC[invite_data.role]
       
       new_user = user_service.create_user(
           username=generate_username(invite_data.email),
           email=invite_data.email,
           password=generate_password(),
           role_name=rbac_role_name,
           is_super_admin=admin_flags["is_super_admin"],
           can_access_admin_panel=admin_flags["can_access_admin_panel"],
           organization=invite_data.organization,
           full_name=invite_data.full_name,
       )
       
       # Send invitation email (unchanged)
       send_invitation_email(new_user, temp_password)
       
       return {"user_id": str(new_user.id)}
   ```

3. **Update dependencies**
   ```python
   # app/api/dependencies.py - Unified user lookup
   
   async def get_current_user(
       token: str = Depends(oauth2_scheme),
       db: Session = Depends(get_db)
   ) -> User:
       """Get current user - now only checks RBAC users table"""
       payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
       username = payload.get("sub")
       
       user = db.query(User).filter(User.username == username).first()
       if not user:
           raise HTTPException(401, "User not found")
       
       return user
   
   def require_admin_access(user: User = Depends(get_current_user)) -> User:
       """Require admin panel access"""
       if not user.can_access_admin_panel:
           raise HTTPException(403, "Admin access required")
       return user
   
   def require_super_admin(user: User = Depends(get_current_user)) -> User:
       """Require super admin privileges"""
       if not user.is_super_admin:
           raise HTTPException(403, "Super admin access required")
       return user
   ```

4. **Update all endpoint imports**
   ```bash
   # Find and replace across codebase
   grep -r "from services.admin_service import AdminUser" app/
   grep -r "admin_users" app/
   
   # Replace with:
   from models.rbac import User
   # And update queries to use User model
   ```

**Deliverables**:
- [ ] All endpoints updated to use unified User model
- [ ] admin_users table references removed
- [ ] Integration tests passing
- [ ] API documentation updated

---

### **Phase 4: Testing & Validation** (Week 5)
**Goal**: Ensure system works correctly before deprecating old system

#### Tasks:

1. **Automated test suite**
   ```python
   # tests/test_unified_auth.py
   
   def test_unified_login():
       """Test login works for migrated users"""
       
   def test_admin_panel_access():
       """Test admin panel access control"""
       
   def test_super_admin_privileges():
       """Test super admin can perform privileged operations"""
       
   def test_role_based_permissions():
       """Test RBAC permissions work correctly"""
       
   def test_password_change():
       """Test password change updates correctly"""
       
   def test_user_invite():
       """Test new user invitation creates correct user"""
   ```

2. **Manual testing checklist**
   - [ ] Login with migrated admin user
   - [ ] Access admin panel
   - [ ] Invite new user
   - [ ] Update user profile
   - [ ] Change password
   - [ ] Delete user
   - [ ] Lock/unlock user
   - [ ] View audit logs
   - [ ] Test super admin operations
   - [ ] Test role-based access control

3. **Performance testing**
   ```python
   # Verify no performance degradation
   - Login latency: < 200ms
   - User list query: < 500ms
   - Permission checks: < 50ms
   ```

4. **Data validation**
   ```python
   # scripts/validate_migration.py
   
   def validate_all_users_migrated():
       """Ensure all admin users have corresponding RBAC users"""
       admin_count = db.query(AdminUser).count()
       migrated_count = db.query(User).filter(User.migrated_from_admin == True).count()
       assert admin_count == migrated_count
   
   def validate_no_orphaned_sessions():
       """Ensure no sessions reference deleted admin_users"""
       
   def validate_audit_logs_linked():
       """Ensure audit logs link to correct users"""
   ```

**Deliverables**:
- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Data validation successful
- [ ] UAT sign-off

---

### **Phase 5: Deprecation & Cleanup** (Week 6)
**Goal**: Remove legacy system safely

#### Tasks:

1. **Deprecate admin_users table (soft deprecation first)**
   ```sql
   -- Rename table to indicate deprecation
   ALTER TABLE admin_users RENAME TO admin_users_deprecated;
   
   -- Add deprecation notice
   COMMENT ON TABLE admin_users_deprecated IS 
     'DEPRECATED: Migrated to users table on 2026-01-26. Safe to drop after 2026-04-26';
   ```

2. **Remove code references**
   ```bash
   # Remove unused imports and models
   rm app/services/admin_service.py
   rm app/models/admin_user.py  # If separate file
   
   # Update alembic migrations to skip admin_users
   ```

3. **Archive audit data**
   ```sql
   -- Move old audit logs to archive table
   CREATE TABLE user_audit_log_archive AS 
   SELECT * FROM user_audit_log WHERE created_at < '2026-01-26';
   ```

4. **Update documentation**
   - [ ] API documentation
   - [ ] Developer onboarding docs
   - [ ] Database schema docs
   - [ ] Architecture diagrams

5. **Schedule table drop** (90 days after migration)
   ```sql
   -- After 3 months with no issues
   DROP TABLE admin_users_deprecated;
   DROP TABLE user_sessions;  -- If no longer needed
   ```

**Deliverables**:
- [ ] Legacy code removed
- [ ] Documentation updated
- [ ] Monitoring shows stable system
- [ ] Table drop scheduled

---

## Risk Mitigation

### Risk Matrix

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|------------|
| Data loss during migration | Critical | Low | Dry run + backups + rollback plan |
| Username conflicts | High | Medium | Conflict resolution in migration script |
| Password hash incompatibility | High | Low | Test bcrypt compatibility first |
| Downtime during migration | Medium | Low | Migrate data offline, switch atomically |
| Permission errors post-migration | High | Medium | Comprehensive test suite + UAT |
| Audit trail broken | Medium | Low | Validate audit log links |

### Rollback Plan

**If issues discovered within 24 hours**:
```bash
# 1. Stop application
docker-compose stop api

# 2. Restore database backup
pg_restore -U postgres -d impact_db backup_pre_migration.dump

# 3. Revert code to previous commit
git revert <migration_commit_hash>

# 4. Restart with legacy system
docker-compose up -d
```

**If issues discovered after 24-48 hours**:
```python
# 1. Keep new system running
# 2. Re-sync from admin_users_deprecated to users
# 3. Fix issues in place
# 4. Continue forward with fixes
```

---

## Testing Strategy

### Unit Tests
```python
# tests/test_unified_user_service.py
- test_create_user()
- test_authenticate()
- test_update_password()
- test_role_permissions()
```

### Integration Tests
```python
# tests/test_auth_endpoints.py
- test_login_endpoint()
- test_admin_endpoints()
- test_permission_checks()
```

### End-to-End Tests
```python
# tests/e2e/test_user_flows.py
- test_complete_user_lifecycle()
- test_admin_user_management()
- test_permission_inheritance()
```

---

## Success Metrics

### Functional Metrics
- [ ] 100% of admin users migrated successfully
- [ ] 0 authentication failures due to migration
- [ ] All admin panel features working
- [ ] All permission checks working correctly

### Performance Metrics
- [ ] Login latency: < 200ms (baseline: 180ms)
- [ ] User queries: < 500ms (baseline: 450ms)
- [ ] No increase in database CPU usage

### Code Quality Metrics
- [ ] Test coverage: > 85%
- [ ] 0 references to admin_users in codebase
- [ ] Reduced code complexity (fewer LOC)

---

## Timeline Summary

```
Week 1: Preparation
  ├── Database schema updates
  ├── Migration infrastructure
  └── UnifiedUserService

Week 2: Data Migration
  ├── Pre-migration validation
  ├── Execute migration
  └── Migrate audit logs

Week 3-4: Code Migration
  ├── Update auth endpoints
  ├── Update admin endpoints
  ├── Update dependencies
  └── Remove legacy references

Week 5: Testing & Validation
  ├── Automated tests
  ├── Manual testing
  ├── Performance testing
  └── UAT

Week 6: Deprecation & Cleanup
  ├── Soft deprecation
  ├── Remove code
  ├── Update docs
  └── Schedule table drop
```

---

## Implementation Commands

### Phase 1 - Database Setup
```bash
# Create migration branch
git checkout -b feature/unified-auth-migration

# Run database migration
python scripts/add_migration_fields.py

# Run tests
pytest tests/test_unified_user_service.py
```

### Phase 2 - Data Migration
```bash
# Backup database
pg_dump -U postgres impact_db > backup_pre_migration.dump

# Dry run
python scripts/migrate_admin_to_rbac.py --dry-run

# Execute
python scripts/migrate_admin_to_rbac.py --execute

# Validate
python scripts/validate_migration.py
```

### Phase 3 - Code Migration
```bash
# Update code
git add app/api/ app/services/
git commit -m "Migrate to unified authentication system"

# Run tests
pytest

# Deploy to staging
./deploy_staging.sh
```

### Phase 4 - Testing
```bash
# Run full test suite
pytest --cov=app tests/

# Run E2E tests
pytest tests/e2e/

# Performance tests
python scripts/benchmark_auth.py
```

### Phase 5 - Cleanup
```bash
# Deprecate table
psql -U postgres impact_db -f scripts/deprecate_admin_users.sql

# Remove code
git rm app/services/admin_service.py

# Deploy to production
./deploy_production.sh
```

---

## Resources Required

### Team
- 1 Backend Developer (full-time, 6 weeks)
- 1 QA Engineer (half-time, weeks 4-6)
- 1 DevOps Engineer (as needed for deployments)

### Infrastructure
- Staging environment for testing
- Database backup storage (extra 50GB)
- CI/CD pipeline updates

### Tools
- Alembic for database migrations
- pytest for testing
- Load testing tools (Locust/k6)

---

## Post-Migration Monitoring

### Metrics to Track (30 days)
```python
# app/monitoring/auth_metrics.py

metrics = {
    "login_success_rate": target >= 99.5%,
    "login_latency_p95": target < 300ms,
    "auth_errors": target < 0.1%,
    "permission_check_latency": target < 50ms,
}
```

### Alerts
- Authentication failure rate > 1%
- Login latency > 500ms
- Database connection errors
- Any reference to admin_users in logs

---

## Questions & Decisions Needed

1. **When to schedule migration?**
   - Recommended: Weekend with low traffic
   - Maintenance window: 2-4 hours

2. **Keep admin_users_deprecated for how long?**
   - Recommended: 90 days
   - Can be extended if needed

3. **Migrate all users at once or gradually?**
   - Recommended: All at once (simpler)
   - Alternative: Gradual (less risky but more complex)

4. **Handle SSO users?**
   - Currently no SSO users in admin_users
   - Future SSO integration will use unified system

---

## Appendix: SQL Migration Scripts

See separate files:
- `scripts/add_migration_fields.sql`
- `scripts/migrate_admin_to_rbac.py`
- `scripts/validate_migration.py`
- `scripts/deprecate_admin_users.sql`
