/**
 * ISO 3166-1 alpha-2 country code to name mapping
 * Focused on Pacific Island countries and common regions
 */

export const COUNTRY_CODES: Record<string, string> = {
  // Pacific Island Countries (primary focus)
  FJ: 'Fiji',
  TO: 'Tonga',
  WS: 'Samoa',
  AS: 'American Samoa',
  VU: 'Vanuatu',
  SB: 'Solomon Islands',
  PG: 'Papua New Guinea',
  NC: 'New Caledonia',
  PF: 'French Polynesia',
  GU: 'Guam',
  FM: 'Federated States of Micronesia',
  MH: 'Marshall Islands',
  PW: 'Palau',
  KI: 'Kiribati',
  NR: 'Nauru',
  TV: 'Tuvalu',
  TK: 'Tokelau',
  NU: 'Niue',
  CK: 'Cook Islands',
  WF: 'Wallis and Futuna',
  MP: 'Northern Mariana Islands',
  NF: 'Norfolk Island',
  PN: 'Pitcairn Islands',
  
  // Nearby major countries
  AU: 'Australia',
  NZ: 'New Zealand',
  ID: 'Indonesia',
  PH: 'Philippines',
  JP: 'Japan',
  TW: 'Taiwan',
  MY: 'Malaysia',
  TH: 'Thailand',
  VN: 'Vietnam',
  
  // Other common countries
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  DE: 'Germany',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  CN: 'China',
  IN: 'India',
  BR: 'Brazil',
  MX: 'Mexico',
  ZA: 'South Africa',
  NG: 'Nigeria',
  EG: 'Egypt',
  KE: 'Kenya',
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  SG: 'Singapore',
  HK: 'Hong Kong',
  KR: 'South Korea',
};

/**
 * Get the full country name from an ISO 3166-1 alpha-2 code
 * @param code - Two-letter country code (e.g., 'FJ', 'TO')
 * @returns Full country name or the original code if not found
 */
export function getCountryName(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  const upperCode = code.toUpperCase();
  return COUNTRY_CODES[upperCode] || code;
}

/**
 * Get country code from name (reverse lookup)
 * @param name - Country name
 * @returns Two-letter country code or undefined if not found
 */
export function getCountryCode(name: string): string | undefined {
  const lowerName = name.toLowerCase();
  return Object.entries(COUNTRY_CODES).find(
    ([, countryName]) => countryName.toLowerCase() === lowerName
  )?.[0];
}

/**
 * Format country for display - shows both name and code
 * @param code - Two-letter country code
 * @returns Formatted string like "Fiji (FJ)"
 */
export function formatCountryDisplay(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  const upperCode = code.toUpperCase();
  const name = COUNTRY_CODES[upperCode];
  return name ? `${name} (${upperCode})` : code;
}
