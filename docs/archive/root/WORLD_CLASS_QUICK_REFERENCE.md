# 🎯 World-Class Assessment Quick Reference

## Assessment Commands

### Run All Assessments
```bash
cd frontend
npm run audit:all          # Run complete audit suite with report
```

### Individual Assessments
```bash
npm run lighthouse:ci      # Performance audit (3 runs averaged)
npm run audit:pa11y         # Accessibility audit (WCAG 2.1 AA)
npm run audit:axe           # Axe core tests (component level)
npm run test               # All tests (includes accessibility)
```

### Local Development
```bash
npm run lighthouse:local   # Single Lighthouse audit on localhost:3100
npm run dev               # Start development server
npm run build             # Build for production
npm run lint              # ESLint code quality
```

---

## Performance Targets

| Metric | Target | Status | Threshold |
|--------|--------|--------|-----------|
| **Performance** | 85%+ | ✅ | Error if < 85 |
| **Accessibility** | 95%+ | ✅ | Error if < 95 |
| **Best Practices** | 90%+ | ✅ | Error if < 90 |
| **SEO** | 90%+ | ✅ | Error if < 90 |
| **CLS** | ≤ 0.1 | ✅ | Error if > 0.08 |
| **FID** | ≤ 100ms | ✅ | Good if < 100ms |
| **FCP** | ≤ 1800ms | ✅ | Good if < 1800ms |
| **LCP** | ≤ 2400ms | ✅ | Good if < 2400ms |
| **TTFB** | ≤ 600ms | ✅ | Good if < 600ms |

---

## Assessment Tools Overview

### Lighthouse 🚀
- **What:** Performance, accessibility, best practices, SEO
- **Standard:** Google Web Vitals
- **Runs:** 3 audits (scores averaged)
- **Output:** `./lighthouse-reports/`

**Key Metrics:**
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Cumulative Layout Shift (CLS)
- Time to Interactive (TTI)
- Speed Index

### Pa11y ♿
- **What:** Accessibility compliance
- **Standard:** WCAG 2.1 AA
- **Runners:** htmlcs + axe
- **Output:** `./pa11y-audit-report.json`

**Tests:**
- Color contrast
- Image alt text
- Form labels
- Heading hierarchy
- ARIA attributes
- Keyboard navigation

### Axe Core 🛡️
- **What:** Detailed accessibility violations
- **Framework:** Jest + jest-axe
- **File:** `src/__tests__/accessibility.test.ts`
- **Coverage:** Component-level testing

**Standards:**
- WCAG 2.1 Level A (Critical)
- WCAG 2.1 Level AA (Target)
- Best practices

### Web Vitals 📊
- **What:** Real user monitoring
- **Integration:** Sentry + Analytics
- **File:** `src/lib/web-vitals.ts`
- **Metrics:** CLS, FID, FCP, LCP, TTFB

---

## Quick Troubleshooting

### Port Already in Use
```bash
# Kill process on port 3100
lsof -ti:3100 | xargs kill -9

# Or use different port
PORT=3200 npm start
```

### Pa11y Reporting Issues
```bash
# Debug with verbose output
npx pa11y-ci --reporter=json

# Test single URL
npx pa11y http://localhost:3100/search
```

### Lighthouse Headless Chrome Issues
```bash
# Install Chrome
# Mac: brew install google-chrome
# Linux: sudo apt install google-chrome-stable
# Windows: Download from google.com/chrome

# Run with debug flags
npm run lighthouse:local -- --verbose
```

### Accessibility Tests Failing
```bash
# Run tests with coverage
npm test -- --coverage src/__tests__/accessibility.test.ts

# Watch mode for development
npm test -- --watch src/__tests__/accessibility.test.ts
```

---

## Common Accessibility Fixes

| Issue | Solution | Example |
|-------|----------|---------|
| **Low Color Contrast** | Use 4.5:1+ ratio | `#000` text on `#FFF` bg |
| **Missing Alt Text** | Add descriptive alt | `<img alt="description" />` |
| **No Form Labels** | Add label or aria-label | `<label htmlFor="id">Label</label>` |
| **Skip Heading Levels** | Use proper hierarchy | `<h1> → <h2> → <h3>` |
| **No Focus Indicator** | Add visible outline | `:focus { outline: 3px solid; }` |
| **Missing ARIA** | Use proper roles | `<div role="button">` |
| **Keyboard Trap** | Allow escape key | Handle Esc in onKeyDown |
| **Unlabeled Icon** | Add aria-label | `<button aria-label="Close">×</button>` |

---

## Performance Optimization Checklist

- [ ] Images optimized (WebP with fallback)
- [ ] Images have dimensions (prevent CLS)
- [ ] Images lazy loaded below fold
- [ ] JavaScript code split with dynamic imports
- [ ] Non-critical JS deferred or async
- [ ] CSS minimized and prioritized
- [ ] Web fonts loaded optimally (font-display: swap)
- [ ] Third-party scripts deferred
- [ ] Caching headers configured
- [ ] CDN configured for static assets
- [ ] Minified bundles in production
- [ ] Tree-shaking enabled
- [ ] No unnecessary dependencies
- [ ] No render-blocking resources

---

## CI/CD Integration Status

| Job | Status | Artifacts |
|-----|--------|-----------|
| **Frontend Tests** | ✅ Running | coverage/ |
| **Assessment Suite** | ✅ Running | lighthouse-reports/, pa11y-audit-report.json |
| **Backend Tests** | ✅ Running | coverage.xml |
| **Docker Build** | ✅ Running | Docker images |
| **Security Scan** | ✅ Running | Trivy SARIF report |
| **Code Quality** | ✅ Running | SonarCloud report |

**PR Comments:** ✅ Automated assessment results  
**Artifact Retention:** 30 days

---

## File Locations

```
frontend/
├── lighthouserc.json              # Lighthouse config (stricter thresholds)
├── .pa11yci.js                    # Pa11y config (WCAG 2.1 AA)
├── package.json                   # npm scripts (audit commands added)
├── src/
│   ├── lib/web-vitals.ts         # Web Vitals monitoring (production RUM)
│   └── __tests__/
│       ├── accessibility.test.ts # Axe core tests
│       ├── auth.test.ts
│       ├── validation.test.ts
│       └── sentry.test.ts
├── scripts/
│   └── audit.sh                  # Full audit automation
└── lighthouse-reports/           # Generated Lighthouse reports

Root:
├── .github/workflows/ci-cd.yml   # Updated with assessment jobs
└── WORLD_CLASS_ASSESSMENT_GUIDE.md  # Complete documentation
```

---

## Metrics Dashboard

### Sentry Web Vitals
```
Dashboard → Performance → Web Vitals

Visible:
  ✓ CLS distribution
  ✓ FID percentiles (p50, p75, p90, p95)
  ✓ LCP by page
  ✓ TTFB server response
  ✓ Geographic breakdowns
  ✓ Device type comparison
```

### GitHub Actions Reports
```
Pull Request:
  ✓ Assessment results comment
  ✓ Links to artifact reports
  ✓ Status checks (pass/fail)
  ✓ Historical trend data

Artifacts (30 days):
  ✓ lighthouse-reports/ (3 HTML files)
  ✓ pa11y-audit-report.json
  ✓ test coverage reports
```

---

## Best Practices Summary

### Development
1. **Always run locally first:** `npm run audit:all`
2. **Review reports:** Check HTML reports for opportunities
3. **Fix critical issues:** Accessibility > Performance > Best Practices
4. **Test on real devices:** Desktop, tablet, mobile
5. **Use browser DevTools:** Inspect performance, accessibility

### Code Review
- [ ] No accessibility violations
- [ ] Lighthouse score maintained
- [ ] Pa11y audit passes
- [ ] All tests green
- [ ] No console errors/warnings

### Deployment
1. Merge to develop/main branch
2. GitHub Actions runs full assessment
3. All jobs must pass (or be reviewed)
4. Monitor Sentry after deployment
5. Check Web Vitals for regressions

---

## Support Resources

### Documentation
- [Complete Guide](./WORLD_CLASS_ASSESSMENT_GUIDE.md)
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)
- [Web Vitals](https://web.dev/vitals/)

### Tools
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Lighthouse Chrome Extension](https://chrome.google.com/webstore/detail/lighthouse/)
- [Axe DevTools Browser Extension](https://www.deque.com/axe/devtools/)

### Community
- [WebAIM](https://webaim.org/)
- [A11Y Project](https://www.a11yproject.com/)
- [Web.dev](https://web.dev/)

---

**Last Updated:** February 2, 2026  
**Version:** 1.0  
**Status:** ✅ Production Ready  
**Target Score:** 9.0+/10
