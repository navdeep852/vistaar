// Indian GST Master Template Helpers
// Statutory state codes, GST routing, and Indian currency number-to-words engine

export const INDIAN_STATE_CODES: Record<string, string> = {
  'JAMMU AND KASHMIR': '01',
  'HIMACHAL PRADESH': '02',
  'PUNJAB': '03',
  'CHANDIGARH': '04',
  'UTTARAKHAND': '05',
  'HARYANA': '06',
  'DELHI': '07',
  'RAJASTHAN': '08',
  'UTTAR PRADESH': '09',
  'BIHAR': '10',
  'SIKKIM': '11',
  'ARUNACHAL PRADESH': '12',
  'NAGALAND': '13',
  'MANIPUR': '14',
  'MIZORAM': '15',
  'TRIPURA': '16',
  'MEGHALAYA': '17',
  'ASSAM': '18',
  'WEST BENGAL': '19',
  'JHARKHAND': '20',
  'ODISHA': '21',
  'CHHATTISGARH': '22',
  'MADHYA PRADESH': '23',
  'GUJARAT': '24',
  'DAMAN AND DIU': '26',
  'DADRA AND NAGAR HAVELI': '26',
  'DADRA AND NAGAR HAVELI AND DAMAN AND DIU': '26',
  'MAHARASHTRA': '27',
  'ANDHRA PRADESH': '37',
  'KARNATAKA': '29',
  'GOA': '30',
  'LAKSHADWEEP': '31',
  'KERALA': '32',
  'TAMIL NADU': '33',
  'PUDUCHERRY': '34',
  'ANDAMAN AND NICOBAR ISLANDS': '35',
  'TELANGANA': '36',
  'ANDHRA PRADESH (NEW)': '37',
  'LADAKH': '38',
  'OTHER TERRITORY': '97',
};

export interface StateInfo {
  state: string;
  code: string;
}

/**
 * Extracts 2-digit Indian GST State Code and State Name
 * using either the 15-character GSTIN prefix or state name lookup.
 */
export function extractStateInfo(stateName?: string, gstin?: string): StateInfo {
  const cleanGstin = (gstin || '').trim().toUpperCase();
  const cleanState = (stateName || '').trim();

  // If GSTIN begins with 2 digits, those 2 digits are the authoritative GST State Code
  if (cleanGstin.length >= 2 && /^\d{2}/.test(cleanGstin)) {
    const code = cleanGstin.substring(0, 2);
    if (!cleanState) {
      for (const [sName, sCode] of Object.entries(INDIAN_STATE_CODES)) {
        if (sCode === code) {
          return { state: sName, code };
        }
      }
    }
    return { state: cleanState || 'N/A', code };
  }

  // Look up by state name in INDIAN_STATE_CODES
  if (cleanState) {
    const upper = cleanState.toUpperCase();
    if (INDIAN_STATE_CODES[upper]) {
      return { state: cleanState, code: INDIAN_STATE_CODES[upper] };
    }
    for (const [sName, sCode] of Object.entries(INDIAN_STATE_CODES)) {
      if (upper.includes(sName) || sName.includes(upper)) {
        return { state: cleanState, code: sCode };
      }
    }
  }

  return { state: cleanState || '-', code: '-' };
}

/**
 * Determines statutory GST routing:
 * - Intra-State: Seller State Code == Buyer / Place of Supply State Code -> CGST + SGST (50/50 split), IGST = 0
 * - Inter-State: Seller State Code != Buyer / Place of Supply State Code -> IGST (100%), CGST = 0, SGST = 0
 */
export function determineGstRouting(
  seller: StateInfo,
  buyer: StateInfo,
  placeOfSupply?: string
): { isIntraState: boolean; isInterState: boolean } {
  // If Place of Supply is specified, evaluate against seller
  if (placeOfSupply && placeOfSupply.trim()) {
    const pos = extractStateInfo(placeOfSupply);
    if (pos.code !== '-' && seller.code !== '-') {
      const isIntra = pos.code === seller.code;
      return { isIntraState: isIntra, isInterState: !isIntra };
    }
    if (pos.state !== '-' && seller.state !== '-') {
      const isIntra = pos.state.toUpperCase() === seller.state.toUpperCase();
      return { isIntraState: isIntra, isInterState: !isIntra };
    }
  }

  // Compare 2-digit state codes
  if (seller.code !== '-' && buyer.code !== '-') {
    const isIntra = seller.code === buyer.code;
    return { isIntraState: isIntra, isInterState: !isIntra };
  }

  // Compare state names if codes unavailable
  if (seller.state && buyer.state && seller.state !== '-' && buyer.state !== '-') {
    const isIntra = seller.state.toUpperCase() === buyer.state.toUpperCase();
    return { isIntraState: isIntra, isInterState: !isIntra };
  }

  // Default to Intra-State (CGST + SGST) for domestic billing
  return { isIntraState: true, isInterState: false };
}

/**
 * Converts any number to Indian numbering words (Rupees and Paise)
 * Supporting Crores, Lakhs, Thousands, Hundreds, Units, and Paise.
 * Example: 27140 -> "Twenty Seven Thousand One Hundred Forty Rupees Only"
 */
export function numberToWordsIndian(num: number | undefined | null): string {
  if (num === null || num === undefined || isNaN(num)) return 'Zero Rupees Only';

  const safeNum = Math.abs(Number(num));
  const integerPart = Math.floor(safeNum);
  const decimalPart = Math.round((safeNum - integerPart) * 100);

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = [
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n: number): string {
    if (n === 0) return '';
    if (n < 10) return units[n];
    if (n < 20) return teens[n - 10];
    const t = tens[Math.floor(n / 10)];
    const u = units[n % 10];
    return u ? `${t} ${u}` : t;
  }

  function convertThreeDigits(n: number): string {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (h > 0) {
      res += `${units[h]} Hundred`;
      if (rest > 0) res += ' ';
    }
    if (rest > 0) {
      res += convertTwoDigits(rest);
    }
    return res;
  }

  if (integerPart === 0 && decimalPart === 0) return 'Zero Rupees Only';

  let words = '';

  if (integerPart > 0) {
    let rem = integerPart;

    // Crores (>= 1,00,00,000)
    const crores = Math.floor(rem / 10000000);
    rem = rem % 10000000;
    if (crores > 0) {
      words += `${convertThreeDigits(crores)} Crore `;
    }

    // Lakhs (>= 1,00,000)
    const lakhs = Math.floor(rem / 100000);
    rem = rem % 100000;
    if (lakhs > 0) {
      words += `${convertTwoDigits(lakhs)} Lakh `;
    }

    // Thousands (>= 1,000)
    const thousands = Math.floor(rem / 1000);
    rem = rem % 1000;
    if (thousands > 0) {
      words += `${convertTwoDigits(thousands)} Thousand `;
    }

    // Hundreds and below
    if (rem > 0) {
      words += `${convertThreeDigits(rem)} `;
    }

    words = words.trim() + ' Rupees';
  }

  if (decimalPart > 0) {
    const paiseWords = convertTwoDigits(decimalPart);
    if (words) {
      words += ` and ${paiseWords} Paise`;
    } else {
      words = `${paiseWords} Paise`;
    }
  }

  return `${words} Only`;
}

export type CopyType = 'Original' | 'Duplicate' | 'Triplicate' | 'Extra OC';

export interface CopyBadgeDetails {
  title: string;
  subtitle: string;
}

export const COPY_BADGE_CONFIG: Record<CopyType, CopyBadgeDetails> = {
  Original: {
    title: 'ORIGINAL COPY',
    subtitle: '(For Recipient)',
  },
  Duplicate: {
    title: 'DUPLICATE COPY',
    subtitle: '(For Transporter)',
  },
  Triplicate: {
    title: 'TRIPLICATE COPY',
    subtitle: '(For Supplier)',
  },
  'Extra OC': {
    title: 'EXTRA OC COPY',
    subtitle: '(Office Copy)',
  },
};

export interface ProcessedItem {
  sNo: number;
  description: string;
  hsn: string;
  uom: string;
  qty: number;
  rate: number;
  gross: number;
  discount: number;
  taxable: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  total: number;
}

export interface MasterTemplatePageChunk {
  pageNumber: number;
  totalPages: number;
  isFirstPage: boolean;
  isLastPage: boolean;
  items: ProcessedItem[];
  paddingRowsCount: number;
}

export function chunkMasterTemplateItems(items: ProcessedItem[]): MasterTemplatePageChunk[] {
  if (items.length <= 6) {
    return [
      {
        pageNumber: 1,
        totalPages: 1,
        isFirstPage: true,
        isLastPage: true,
        items,
        paddingRowsCount: Math.max(0, 6 - items.length),
      },
    ];
  }

  const rawChunks: {
    pageNumber: number;
    isFirstPage: boolean;
    isLastPage: boolean;
    items: ProcessedItem[];
    paddingRowsCount: number;
  }[] = [];

  let remaining = [...items];
  let pageNumber = 1;

  // Page 1 capacity: up to 8 items, but guarantee at least 1 item carries over
  const page1Count = Math.min(8, items.length - 1);
  const page1Items = remaining.slice(0, page1Count);
  remaining = remaining.slice(page1Count);

  rawChunks.push({
    pageNumber: 1,
    isFirstPage: true,
    isLastPage: false,
    items: page1Items,
    paddingRowsCount: 0,
  });

  const INTERMEDIATE_CAPACITY = 14;
  const FINAL_PAGE_MAX = 6;

  while (remaining.length > 0) {
    pageNumber++;

    if (remaining.length <= FINAL_PAGE_MAX) {
      rawChunks.push({
        pageNumber,
        isFirstPage: false,
        isLastPage: true,
        items: remaining,
        paddingRowsCount: Math.max(0, 4 - remaining.length),
      });
      break;
    }

    if (remaining.length <= INTERMEDIATE_CAPACITY) {
      const takeForThisPage = remaining.length - Math.min(FINAL_PAGE_MAX, Math.ceil(remaining.length / 2));
      const pageItems = remaining.slice(0, takeForThisPage);
      remaining = remaining.slice(takeForThisPage);

      rawChunks.push({
        pageNumber,
        isFirstPage: false,
        isLastPage: false,
        items: pageItems,
        paddingRowsCount: 0,
      });
    } else {
      const pageItems = remaining.slice(0, INTERMEDIATE_CAPACITY);
      remaining = remaining.slice(INTERMEDIATE_CAPACITY);

      rawChunks.push({
        pageNumber,
        isFirstPage: false,
        isLastPage: false,
        items: pageItems,
        paddingRowsCount: 0,
      });
    }
  }

  if (rawChunks.length > 0) {
    rawChunks[rawChunks.length - 1].isLastPage = true;
  }

  const totalPages = rawChunks.length;
  return rawChunks.map((chunk) => ({
    ...chunk,
    totalPages,
  }));
}

