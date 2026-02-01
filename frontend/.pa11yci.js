/**
 * Pa11y Configuration
 * Comprehensive accessibility auditing
 */

module.exports = {
  urls: [
    'http://localhost:3100',
    'http://localhost:3100/search',
    'http://localhost:3100/map',
    'http://localhost:3100/upload',
    'http://localhost:3100/profile',
  ],
  runners: ['htmlcs', 'axe'],
  standard: 'WCAG2AA',
  wait: 3000,
  timeout: 10000,
  chromeLaunchConfig: {
    args: ['--no-sandbox'],
  },
  ignore: [
    'notice',
    'warning',
  ],
};
