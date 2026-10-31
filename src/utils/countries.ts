export interface CountryOption {
  code: string;
  name: string;
  timezone: string;
}

/**
 * Complete alphabetical list of sovereign countries and major regions.
 * Displays ONLY country names (never city names) in the UI while mapping
 * internally to a valid IANA timezone for accurate .ics calendar exports.
 */
export const ALL_COUNTRIES: CountryOption[] = [
  { code: "AF", name: "Afghanistan", timezone: "Asia/Kabul" },
  { code: "AL", name: "Albania", timezone: "Europe/Tirane" },
  { code: "DZ", name: "Algeria", timezone: "Africa/Algiers" },
  { code: "AD", name: "Andorra", timezone: "Europe/Andorra" },
  { code: "AO", name: "Angola", timezone: "Africa/Luanda" },
  { code: "AG", name: "Antigua and Barbuda", timezone: "America/Antigua" },
  { code: "AR", name: "Argentina", timezone: "America/Argentina/Buenos_Aires" },
  { code: "AM", name: "Armenia", timezone: "Asia/Yerevan" },
  { code: "AU", name: "Australia", timezone: "Australia/Sydney" },
  { code: "AT", name: "Austria", timezone: "Europe/Vienna" },
  { code: "AZ", name: "Azerbaijan", timezone: "Asia/Baku" },
  { code: "BS", name: "Bahamas", timezone: "America/Nassau" },
  { code: "BH", name: "Bahrain", timezone: "Asia/Bahrain" },
  { code: "BD", name: "Bangladesh", timezone: "Asia/Dhaka" },
  { code: "BB", name: "Barbados", timezone: "America/Barbados" },
  { code: "BY", name: "Belarus", timezone: "Europe/Minsk" },
  { code: "BE", name: "Belgium", timezone: "Europe/Brussels" },
  { code: "BZ", name: "Belize", timezone: "America/Belize" },
  { code: "BJ", name: "Benin", timezone: "Africa/Porto-Novo" },
  { code: "BT", name: "Bhutan", timezone: "Asia/Thimphu" },
  { code: "BO", name: "Bolivia", timezone: "America/La_Paz" },
  { code: "BA", name: "Bosnia and Herzegovina", timezone: "Europe/Sarajevo" },
  { code: "BW", name: "Botswana", timezone: "Africa/Gaborone" },
  { code: "BR", name: "Brazil", timezone: "America/Sao_Paulo" },
  { code: "BN", name: "Brunei", timezone: "Asia/Brunei" },
  { code: "BG", name: "Bulgaria", timezone: "Europe/Sofia" },
  { code: "BF", name: "Burkina Faso", timezone: "Africa/Ouagadougou" },
  { code: "BI", name: "Burundi", timezone: "Africa/Bujumbura" },
  { code: "CV", name: "Cabo Verde", timezone: "Atlantic/Cape_Verde" },
  { code: "KH", name: "Cambodia", timezone: "Asia/Phnom_Penh" },
  { code: "CM", name: "Cameroon", timezone: "Africa/Douala" },
  { code: "CA", name: "Canada", timezone: "America/Toronto" },
  { code: "CF", name: "Central African Republic", timezone: "Africa/Bangui" },
  { code: "TD", name: "Chad", timezone: "Africa/Ndjamena" },
  { code: "CL", name: "Chile", timezone: "America/Santiago" },
  { code: "CN", name: "China", timezone: "Asia/Shanghai" },
  { code: "CO", name: "Colombia", timezone: "America/Bogota" },
  { code: "KM", name: "Comoros", timezone: "Indian/Comoro" },
  { code: "CG", name: "Congo", timezone: "Africa/Brazzaville" },
  { code: "CR", name: "Costa Rica", timezone: "America/Costa_Rica" },
  { code: "CI", name: "Côte d'Ivoire", timezone: "Africa/Abidjan" },
  { code: "HR", name: "Croatia", timezone: "Europe/Zagreb" },
  { code: "CU", name: "Cuba", timezone: "America/Havana" },
  { code: "CY", name: "Cyprus", timezone: "Asia/Nicosia" },
  { code: "CZ", name: "Czechia", timezone: "Europe/Prague" },
  { code: "CD", name: "Democratic Republic of the Congo", timezone: "Africa/Kinshasa" },
  { code: "DK", name: "Denmark", timezone: "Europe/Copenhagen" },
  { code: "DJ", name: "Djibouti", timezone: "Africa/Djibouti" },
  { code: "DM", name: "Dominica", timezone: "America/Dominica" },
  { code: "DO", name: "Dominican Republic", timezone: "America/Santo_Domingo" },
  { code: "EC", name: "Ecuador", timezone: "America/Guayaquil" },
  { code: "EG", name: "Egypt", timezone: "Africa/Cairo" },
  { code: "SV", name: "El Salvador", timezone: "America/El_Salvador" },
  { code: "GQ", name: "Equatorial Guinea", timezone: "Africa/Malabo" },
  { code: "ER", name: "Eritrea", timezone: "Africa/Asmara" },
  { code: "EE", name: "Estonia", timezone: "Europe/Tallinn" },
  { code: "SZ", name: "Eswatini", timezone: "Africa/Mbabane" },
  { code: "ET", name: "Ethiopia", timezone: "Africa/Addis_Ababa" },
  { code: "FJ", name: "Fiji", timezone: "Pacific/Fiji" },
  { code: "FI", name: "Finland", timezone: "Europe/Helsinki" },
  { code: "FR", name: "France", timezone: "Europe/Paris" },
  { code: "GA", name: "Gabon", timezone: "Africa/Libreville" },
  { code: "GM", name: "Gambia", timezone: "Africa/Banjul" },
  { code: "GE", name: "Georgia", timezone: "Asia/Tbilisi" },
  { code: "DE", name: "Germany", timezone: "Europe/Berlin" },
  { code: "GH", name: "Ghana", timezone: "Africa/Accra" },
  { code: "GR", name: "Greece", timezone: "Europe/Athens" },
  { code: "GD", name: "Grenada", timezone: "America/Grenada" },
  { code: "GT", name: "Guatemala", timezone: "America/Guatemala" },
  { code: "GN", name: "Guinea", timezone: "Africa/Conakry" },
  { code: "GW", name: "Guinea-Bissau", timezone: "Africa/Bissau" },
  { code: "GY", name: "Guyana", timezone: "America/Guyana" },
  { code: "HT", name: "Haiti", timezone: "America/Port-au-Prince" },
  { code: "HN", name: "Honduras", timezone: "America/Tegucigalpa" },
  { code: "HU", name: "Hungary", timezone: "Europe/Budapest" },
  { code: "IS", name: "Iceland", timezone: "Atlantic/Reykjavik" },
  { code: "IN", name: "India", timezone: "Asia/Kolkata" },
  { code: "ID", name: "Indonesia", timezone: "Asia/Jakarta" },
  { code: "IR", name: "Iran", timezone: "Asia/Tehran" },
  { code: "IQ", name: "Iraq", timezone: "Asia/Baghdad" },
  { code: "IE", name: "Ireland", timezone: "Europe/Dublin" },
  { code: "IL", name: "Israel", timezone: "Asia/Jerusalem" },
  { code: "IT", name: "Italy", timezone: "Europe/Rome" },
  { code: "JM", name: "Jamaica", timezone: "America/Jamaica" },
  { code: "JP", name: "Japan", timezone: "Asia/Tokyo" },
  { code: "JO", name: "Jordan", timezone: "Asia/Amman" },
  { code: "KZ", name: "Kazakhstan", timezone: "Asia/Almaty" },
  { code: "KE", name: "Kenya", timezone: "Africa/Nairobi" },
  { code: "KI", name: "Kiribati", timezone: "Pacific/Tarawa" },
  { code: "KW", name: "Kuwait", timezone: "Asia/Kuwait" },
  { code: "KG", name: "Kyrgyzstan", timezone: "Asia/Bishkek" },
  { code: "LA", name: "Laos", timezone: "Asia/Vientiane" },
  { code: "LV", name: "Latvia", timezone: "Europe/Riga" },
  { code: "LB", name: "Lebanon", timezone: "Asia/Beirut" },
  { code: "LS", name: "Lesotho", timezone: "Africa/Maseru" },
  { code: "LR", name: "Liberia", timezone: "Africa/Monrovia" },
  { code: "LY", name: "Libya", timezone: "Africa/Tripoli" },
  { code: "LI", name: "Liechtenstein", timezone: "Europe/Vaduz" },
  { code: "LT", name: "Lithuania", timezone: "Europe/Vilnius" },
  { code: "LU", name: "Luxembourg", timezone: "Europe/Luxembourg" },
  { code: "MG", name: "Madagascar", timezone: "Indian/Antananarivo" },
  { code: "MW", name: "Malawi", timezone: "Africa/Blantyre" },
  { code: "MY", name: "Malaysia", timezone: "Asia/Kuala_Lumpur" },
  { code: "MV", name: "Maldives", timezone: "Indian/Maldives" },
  { code: "ML", name: "Mali", timezone: "Africa/Bamako" },
  { code: "MT", name: "Malta", timezone: "Europe/Malta" },
  { code: "MH", name: "Marshall Islands", timezone: "Pacific/Majuro" },
  { code: "MR", name: "Mauritania", timezone: "Africa/Nouakchott" },
  { code: "MU", name: "Mauritius", timezone: "Indian/Mauritius" },
  { code: "MX", name: "Mexico", timezone: "America/Mexico_City" },
  { code: "FM", name: "Micronesia", timezone: "Pacific/Pohnpei" },
  { code: "MD", name: "Moldova", timezone: "Europe/Chisinau" },
  { code: "MC", name: "Monaco", timezone: "Europe/Monaco" },
  { code: "MN", name: "Mongolia", timezone: "Asia/Ulaanbaatar" },
  { code: "ME", name: "Montenegro", timezone: "Europe/Podgorica" },
  { code: "MA", name: "Morocco", timezone: "Africa/Casablanca" },
  { code: "MZ", name: "Mozambique", timezone: "Africa/Maputo" },
  { code: "MM", name: "Myanmar", timezone: "Asia/Yangon" },
  { code: "NA", name: "Namibia", timezone: "Africa/Windhoek" },
  { code: "NR", name: "Nauru", timezone: "Pacific/Nauru" },
  { code: "NP", name: "Nepal", timezone: "Asia/Kathmandu" },
  { code: "NL", name: "Netherlands", timezone: "Europe/Amsterdam" },
  { code: "NZ", name: "New Zealand", timezone: "Pacific/Auckland" },
  { code: "NI", name: "Nicaragua", timezone: "America/Managua" },
  { code: "NE", name: "Niger", timezone: "Africa/Niamey" },
  { code: "NG", name: "Nigeria", timezone: "Africa/Lagos" },
  { code: "KP", name: "North Korea", timezone: "Asia/Pyongyang" },
  { code: "MK", name: "North Macedonia", timezone: "Europe/Skopje" },
  { code: "NO", name: "Norway", timezone: "Europe/Oslo" },
  { code: "OM", name: "Oman", timezone: "Asia/Muscat" },
  { code: "PK", name: "Pakistan", timezone: "Asia/Karachi" },
  { code: "PW", name: "Palau", timezone: "Pacific/Palau" },
  { code: "PS", name: "Palestine", timezone: "Asia/Hebron" },
  { code: "PA", name: "Panama", timezone: "America/Panama" },
  { code: "PG", name: "Papua New Guinea", timezone: "Pacific/Port_Moresby" },
  { code: "PY", name: "Paraguay", timezone: "America/Asuncion" },
  { code: "PE", name: "Peru", timezone: "America/Lima" },
  { code: "PH", name: "Philippines", timezone: "Asia/Manila" },
  { code: "PL", name: "Poland", timezone: "Europe/Warsaw" },
  { code: "PT", name: "Portugal", timezone: "Europe/Lisbon" },
  { code: "QA", name: "Qatar", timezone: "Asia/Qatar" },
  { code: "RO", name: "Romania", timezone: "Europe/Bucharest" },
  { code: "RU", name: "Russia", timezone: "Europe/Moscow" },
  { code: "RW", name: "Rwanda", timezone: "Africa/Kigali" },
  { code: "KN", name: "Saint Kitts and Nevis", timezone: "America/St_Kitts" },
  { code: "LC", name: "Saint Lucia", timezone: "America/St_Lucia" },
  { code: "VC", name: "Saint Vincent and the Grenadines", timezone: "America/St_Vincent" },
  { code: "WS", name: "Samoa", timezone: "Pacific/Apia" },
  { code: "SM", name: "San Marino", timezone: "Europe/San_Marino" },
  { code: "ST", name: "Sao Tome and Principe", timezone: "Africa/Sao_Tome" },
  { code: "SA", name: "Saudi Arabia", timezone: "Asia/Riyadh" },
  { code: "SN", name: "Senegal", timezone: "Africa/Dakar" },
  { code: "RS", name: "Serbia", timezone: "Europe/Belgrade" },
  { code: "SC", name: "Seychelles", timezone: "Indian/Mahe" },
  { code: "SL", name: "Sierra Leone", timezone: "Africa/Freetown" },
  { code: "SG", name: "Singapore", timezone: "Asia/Singapore" },
  { code: "SK", name: "Slovakia", timezone: "Europe/Bratislava" },
  { code: "SI", name: "Slovenia", timezone: "Europe/Ljubljana" },
  { code: "SB", name: "Solomon Islands", timezone: "Pacific/Guadalcanal" },
  { code: "SO", name: " Somalia".trim(), timezone: "Africa/Mogadishu" },
  { code: "ZA", name: "South Africa", timezone: "Africa/Johannesburg" },
  { code: "KR", name: "South Korea", timezone: "Asia/Seoul" },
  { code: "SS", name: "South Sudan", timezone: "Africa/Juba" },
  { code: "ES", name: "Spain", timezone: "Europe/Madrid" },
  { code: "LK", name: "Sri Lanka", timezone: "Asia/Colombo" },
  { code: "SD", name: "Sudan", timezone: "Africa/Khartoum" },
  { code: "SR", name: "Suriname", timezone: "America/Paramaribo" },
  { code: "SE", name: "Sweden", timezone: "Europe/Stockholm" },
  { code: "CH", name: "Switzerland", timezone: "Europe/Zurich" },
  { code: "SY", name: "Syria", timezone: "Asia/Damascus" },
  { code: "TW", name: "Taiwan", timezone: "Asia/Taipei" },
  { code: "TJ", name: "Tajikistan", timezone: "Asia/Dushanbe" },
  { code: "TZ", name: "Tanzania", timezone: "Africa/Dar_es_Salaam" },
  { code: "TH", name: "Thailand", timezone: "Asia/Bangkok" },
  { code: "TL", name: "Timor-Leste", timezone: "Asia/Dili" },
  { code: "TG", name: "Togo", timezone: "Africa/Lome" },
  { code: "TO", name: "Tonga", timezone: "Pacific/Tongatapu" },
  { code: "TT", name: "Trinidad and Tobago", timezone: "America/Port_of_Spain" },
  { code: "TN", name: "Tunisia", timezone: "Africa/Tunis" },
  { code: "TR", name: "Turkey", timezone: "Europe/Istanbul" },
  { code: "TM", name: "Turkmenistan", timezone: "Asia/Ashgabat" },
  { code: "TV", name: "Tuvalu", timezone: "Pacific/Funafuti" },
  { code: "UG", name: "Uganda", timezone: "Africa/Kampala" },
  { code: "UA", name: "Ukraine", timezone: "Europe/Kyiv" },
  { code: "AE", name: "United Arab Emirates", timezone: "Asia/Dubai" },
  { code: "GB", name: "United Kingdom", timezone: "Europe/London" },
  { code: "US", name: "United States", timezone: "America/New_York" },
  { code: "UY", name: "Uruguay", timezone: "America/Montevideo" },
  { code: "UZ", name: "Uzbekistan", timezone: "Asia/Tashkent" },
  { code: "VU", name: "Vanuatu", timezone: "Pacific/Efate" },
  { code: "VA", name: "Vatican City", timezone: "Europe/Vatican" },
  { code: "VE", name: "Venezuela", timezone: "America/Caracas" },
  { code: "VN", name: "Vietnam", timezone: "Asia/Ho_Chi_Minh" },
  { code: "YE", name: "Yemen", timezone: "Asia/Aden" },
  { code: "ZM", name: "Zambia", timezone: "Africa/Lusaka" },
  { code: "ZW", name: "Zimbabwe", timezone: "Africa/Harare" },
];

export function getCountryByCode(code: string): CountryOption {
  const upper = (code || "").toUpperCase();
  return (
    ALL_COUNTRIES.find((c) => c.code === upper) ??
    ALL_COUNTRIES.find((c) => c.code === "US") ??
    ALL_COUNTRIES[0]
  );
}

export function detectDefaultCountry(): CountryOption {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz) {
      const exactTzMatch = ALL_COUNTRIES.find(
        (c) => c.timezone.toLowerCase() === tz.toLowerCase()
      );
      if (exactTzMatch) return exactTzMatch;

      if (tz === "Asia/Calcutta") return getCountryByCode("IN");
      if (tz.startsWith("America/") && (tz.includes("Los_Angeles") || tz.includes("Chicago") || tz.includes("Denver") || tz.includes("New_York") || tz.includes("Phoenix"))) {
        return getCountryByCode("US");
      }
      if (tz.startsWith("Australia/")) return getCountryByCode("AU");
      if (tz.startsWith("Canada/")) return getCountryByCode("CA");
    }

    const lang = typeof navigator !== "undefined" ? navigator.language || "" : "";
    const parts = lang.split(/[-_]/);
    if (parts.length > 1 && parts[1] && parts[1].length === 2) {
      const matched = ALL_COUNTRIES.find(
        (c) => c.code === parts[1].toUpperCase()
      );
      if (matched) return matched;
    }
  } catch {
    // Fallback below
  }
  return getCountryByCode("US");
}
