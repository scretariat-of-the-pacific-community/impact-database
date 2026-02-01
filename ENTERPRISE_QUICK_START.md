# Enterprise Testing & CI/CD Quick Start Guide

## 🚀 For New Developers

### 1. Running Tests Locally

**Run all new enterprise tests:**
```bash
cd frontend
npm test -- src/__tests__/auth.test.ts src/__tests__/api.test.ts src/__tests__/validation.test.ts
```

**Run individual test files:**
```bash
npm test -- src/__tests__/auth.test.ts      # Authentication tests
npm test -- src/__tests__/api.test.ts       # API client tests  
npm test -- src/__tests__/validation.test.ts # Input validation tests
```

**Run with coverage:**
```bash
npm test -- --coverage --coverageReporters="text-summary"
```

**Watch mode (re-run on file changes):**
```bash
npm test -- --watch
```

---

### 2. Using Validation Functions

**Form Validation:**
```typescript
import { 
  validateTitle, 
  validateCountry, 
  validateCoordinates,
  validateFormData 
} from '@/lib/validation'

// Single field validation
if (!validateTitle(formData.title)) {
  console.error('Invalid title')
}

// Complete form validation
const result = validateFormData({
  title: 'Ocean Impact Study',
  description: 'A comprehensive analysis...',
  country: 'FJ',
  latitude: -18.14,
  longitude: 178.07
})

if (!result.valid) {
  console.error('Validation errors:', result.errors)
}
```

**XSS Prevention:**
```typescript
import { sanitizeXSS, detectSQLInjection } from '@/lib/validation'

// Sanitize user input
const cleanInput = sanitizeXSS(userInput)

// Detect injection attacks
if (detectSQLInjection(userInput)) {
  console.warn('Potential SQL injection detected')
}
```

---

### 3. Using Authentication Functions

**Token Validation:**
```typescript
import { 
  validateToken, 
  isTokenExpired, 
  validateCredentials 
} from '@/lib/auth'

// Check token format
try {
  if (validateToken(jwtToken)) {
    console.log('Valid token format')
  }
} catch (e) {
  console.error('Invalid token:', e.message)
}

// Check expiration
if (isTokenExpired(jwtToken)) {
  console.log('Token has expired, please login again')
}

// Validate login credentials
const { valid, errors } = validateCredentials(email, password)
if (!valid) {
  console.error('Credential errors:', errors)
}
```

---

### 4. GitHub Actions CI/CD

**Workflow Location:**
```
.github/workflows/ci-cd.yml
```

**Workflow Jobs:**
1. **Frontend Test & Build** - Jest + ESLint + Turbopack
2. **Backend Test** - pytest with PostgreSQL + Redis
3. **Docker Build** - Build and push images to GHCR
4. **Security Scan** - Trivy vulnerability scanning
5. **Code Quality** - SonarCloud analysis
6. **Status Check** - Composite result

**Triggers:**
- Push to `main`, `develop`, `upgrade/*` branches
- All pull requests
- Manual dispatch (optional)

**View Results:**
1. Push code to GitHub
2. Go to Actions tab
3. Click latest workflow run
4. View job results and logs

---

### 5. Setting Up Sentry Error Tracking

**Get Sentry DSN:**
1. Visit https://sentry.io
2. Create free account
3. Create new project (select "Next.js" for frontend)
4. Copy your Project DSN

**Add to Environment:**

**For Development (.env.local):**
```bash
NEXT_PUBLIC_SENTRY_DSN=https://your_key@your_org.ingest.sentry.io/project_id
```

**For Production (GitHub Secrets):**
```
Name: NEXT_PUBLIC_SENTRY_DSN
Value: https://your_key@your_org.ingest.sentry.io/project_id
```

**For Backend (.env):**
```bash
SENTRY_DSN_API=https://backend_key@your_org.ingest.sentry.io/backend_project_id
```

**Test Sentry Integration:**
```typescript
import * as Sentry from '@sentry/nextjs'

// Capture an error
try {
  throw new Error('Test error')
} catch (e) {
  Sentry.captureException(e)
}

// Send a message
Sentry.captureMessage('Test message', 'info')
```

---

### 6. Test File Structure

Each test file has this pattern:

```typescript
describe('Feature Name', () => {
  describe('Subcategory', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test'
      
      // Act
      const result = myFunction(input)
      
      // Assert
      expect(result).toBe(expected)
    })
  })
})
```

**Test Naming Convention:**
- Start with "should"
- Describe expected behavior
- Be specific about what's being tested

Example:
```typescript
it('should validate email format correctly')
it('should reject passwords shorter than 8 characters')
it('should sanitize HTML script tags')
```

---

### 7. Common Test Patterns

**Testing Functions:**
```typescript
expect(func()).toBe(expectedValue)
expect(func()).toThrow()
expect(func()).toHaveLength(3)
expect(array).toContain(item)
```

**Testing Async Functions:**
```typescript
it('should wait for async operation', async () => {
  const result = await asyncFunc()
  expect(result).toBe(expected)
})
```

**Mocking:**
```typescript
jest.mock('@/lib/api')
// Use mock instead of actual implementation
```

---

### 8. Build & Deploy Pipeline

**Local Development:**
```bash
cd frontend
npm run dev          # Start dev server on :3100
npm test             # Run tests
npm run build        # Build production
npm start            # Run production build
```

**GitHub Actions (Automatic):**
1. Push code → GitHub
2. Actions workflow starts
3. Runs: tests → lint → build → Docker build → security scan
4. Results posted to PR or branch

**Success Criteria:**
- ✅ All tests pass
- ✅ No linting errors
- ✅ Build completes
- ✅ Docker images created
- ✅ No critical vulnerabilities

---

### 9. Troubleshooting

**Tests not running:**
```bash
# Clear cache and reinstall
rm -rf node_modules .next
npm install
npm test
```

**Build fails with missing modules:**
```bash
npm install
cd frontend && npm install @sentry/nextjs @sentry/react
```

**Type errors:**
```bash
npm run build  # Full TypeScript check
npx tsc --noEmit  # Just type checking
```

---

### 10. Resources

- **Testing:** Jest docs - https://jestjs.io/
- **Validation:** Form validation best practices
- **Sentry:** https://docs.sentry.io/product/
- **GitHub Actions:** https://docs.github.com/actions
- **Next.js:** https://nextjs.org/docs

---

## 📞 Support

For issues with:
- **Tests:** Check test files in `frontend/src/__tests__/`
- **Validation:** See `frontend/src/lib/validation.ts`
- **CI/CD:** View `.github/workflows/ci-cd.yml`
- **Sentry:** Check `frontend/src/lib/sentry.ts`

---

**Last Updated:** February 2, 2026
