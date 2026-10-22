/**
 * VISTAAR BUSINESS OS — BLOG & KNOWLEDGE BASE
 * 
 * High-value educational articles for Indian small and medium businesses.
 */

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  category: 'Inventory' | 'Billing & GST' | 'Udhaari & Cashflow' | 'Business Operations';
  publishedDate: string;
  readTime: string;
  author: string;
  authorRole: string;
  coverImage?: string;
  contentHtml: string;
  tags: string[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'how-to-manage-inventory-small-business-india',
    title: 'How to Manage Inventory for a Small Business in India: Practical Guide',
    excerpt: 'Step-by-step framework for Indian retailers, distributors, and wholesalers to prevent stockouts, eliminate dead capital, and maintain accurate batch counts.',
    category: 'Inventory',
    publishedDate: 'October 15, 2026',
    readTime: '6 min read',
    author: 'VISTAAR Product Team',
    authorRole: 'Retail Operations Specialist',
    tags: ['Inventory Management', 'Stock Control', 'FIFO', 'Retail India', 'Dead Stock'],
    contentHtml: `
      <h2>Why Inventory Control Dictates Cash Flow</h2>
      <p>For most Indian trading and retail businesses, between 45% and 70% of total working capital is locked up on shelves and in godowns. When stock sits unsold, your cash is frozen. When fast-moving goods run out of stock, your customers walk across the street to a competitor.</p>
      
      <p>Effective stock management is not about buying more software—it is about following a disciplined operating system every single business day.</p>

      <h2>1. Categorize Your Stock with the 80/20 Rule (ABC Analysis)</h2>
      <p>Not every product in your store deserves equal attention. Split your catalogue into three clear buckets:</p>
      <ul>
        <li><strong>Category A (Fast Movers):</strong> The top 20% of your items that generate 80% of your total sales. These require daily stock checks and automatic reorder thresholds.</li>
        <li><strong>Category B (Steady Sellers):</strong> About 30% of your inventory that accounts for 15% of turnover. Review these weekly.</li>
        <li><strong>Category C (Slow Movers &amp; Long Tail):</strong> The remaining 50% of items that represent only 5% of sales. Keep minimal buffer stock and negotiate flexible return policies with your distributors.</li>
      </ul>

      <h2>2. Implement FIFO (First-In, First-Out) with Batch Numbers</h2>
      <p>Whether you sell packaged foods, lubricants, electronics, or building materials, older inventory must move before newer shipments. Without strict batch tracking, older goods get pushed to the back of the shelf, leading to expiration, dust accumulation, and value write-offs.</p>

      <h2>3. Establish Minimum Stock Reorder Thresholds</h2>
      <p>Never rely on visual estimates. In VISTAAR, you can assign a <em>Minimum Stock Alert</em> to every item. When stock dips below this limit during a counter sale, an instant warning appears on your dashboard and low-stock report, allowing you to generate a Purchase Order before you lose sales.</p>

      <h2>4. Perform Regular Physical Cycle Counts</h2>
      <p>Do not wait for the annual Diwali or financial year-end audit to count inventory. Conduct weekly cycle counts of 10 to 15 items. If your physical count differs from your digital ledger, investigate the root cause immediately—whether it is theft, counter billing errors, or damaged goods that were not written off.</p>
    `,
  },
  {
    slug: 'how-to-track-udhaari-customer-outstanding-payments',
    title: 'How to Track Customer Udhaari and Recover Outstanding Payments on Time',
    excerpt: 'Actionable strategies for Indian shopkeepers and suppliers to manage credit sales, automate payment reminders, and keep working capital safe.',
    category: 'Udhaari & Cashflow',
    publishedDate: 'October 10, 2026',
    readTime: '5 min read',
    author: 'VISTAAR Financial Engineering',
    authorRole: 'SME Accounting Advisor',
    tags: ['Udhaari', 'Customer Credit', 'Cash Flow', 'Receivables', 'WhatsApp Reminders'],
    contentHtml: `
      <h2>The Reality of Credit (Udhaari) in Indian Commerce</h2>
      <p>Offering credit is often mandatory to win repeat business in Indian wholesale and neighbourhood retail. However, unmonitored Udhaari is the leading cause of business failure. When credit terms are vague and payment follow-ups are manual, bad debts inevitably pile up.</p>

      <h2>1. Set Clear Credit Limits Before Handing Over Goods</h2>
      <p>Every credit customer must have an explicit credit ceiling and repayment window (e.g. 15 days or 30 days). If a customer reaches their credit limit, no further goods should be released on credit until the previous invoice is settled or partially paid.</p>

      <h2>2. Issue Itemized Invoices for Every Credit Transaction</h2>
      <p>Never record credit on informal slips of paper or loose notebooks. A formal digital invoice with serial numbering, item descriptions, and tax calculations provides clear legal and commercial proof that eliminates disputes over what was purchased and when.</p>

      <h2>3. Send Polite, Automated WhatsApp Payment Reminders</h2>
      <p>Most customers do not default deliberately; they simply lose track of multiple credit purchases across different suppliers. A professional WhatsApp summary sent 3 days before due date—complete with invoice numbers and a UPI payment QR code—dramatically speeds up collections without damaging customer relationships.</p>

      <h2>4. Review Aging Reports Weekly</h2>
      <p>Use an aging breakdown to classify outstanding receivables into 0-15 days, 16-30 days, 31-60 days, and 60+ days. Focus your collection efforts on debts approaching 30 days before they turn into doubtful recoveries.</p>
    `,
  },
  {
    slug: 'how-to-create-professional-gst-invoices',
    title: 'How to Create Professional GST & Non-GST Invoices for Indian Businesses',
    excerpt: 'Essential components of a legally compliant tax invoice in India, correct HSN/SAC codes, CGST/SGST/IGST calculation, and thermal printing best practices.',
    category: 'Billing & GST',
    publishedDate: 'October 5, 2026',
    readTime: '7 min read',
    author: 'VISTAAR Compliance Team',
    authorRole: 'Taxation & Regulatory Lead',
    tags: ['GST Invoicing', 'HSN Code', 'Tax Invoice', 'Thermal Billing', 'B2B Sales'],
    contentHtml: `
      <h2>Mandatory Fields in an Indian GST Tax Invoice</h2>
      <p>Under the Central Goods and Services Tax (CGST) Act, a valid tax invoice issued to a registered business (B2B) must contain specific statutory details to enable your customer to claim Input Tax Credit (ITC):</p>
      <ul>
        <li><strong>Supplier Details:</strong> Legal business name, registered address, GSTIN, and state code.</li>
        <li><strong>Consecutive Serial Number:</strong> Unique invoice numbering containing only alphabets, numerals, and special characters (/ or -), unique for each financial year.</li>
        <li><strong>Invoice Date:</strong> Date of supply or billing.</li>
        <li><strong>Recipient Details:</strong> Customer name, address, GSTIN (for B2B), and Place of Supply (POS).</li>
        <li><strong>Item Breakdown:</strong> Description of goods or services, HSN/SAC code, quantity, unit, rate per unit, and taxable value.</li>
        <li><strong>Tax Rate &amp; Amount:</strong> Clear bifurcation of CGST &amp; SGST for intra-state sales, or IGST for inter-state transactions.</li>
      </ul>

      <h2>Choosing Between Standard A4, A5, and Thermal 3-Inch (80mm) Bills</h2>
      <p>High-speed retail counters (such as grocery, hardware, and FMCG) benefit significantly from 3-inch (80mm) thermal receipts, which print in under 2 seconds and drastically reduce paper costs. Wholesale and B2B distributors should utilize full A4 or A5 layouts that provide ample room for banking details, terms of sale, and authorized signatory signatures.</p>

      <h2>Avoiding Common Invoicing Mistakes</h2>
      <p>The two most common invoicing errors flagged during GST audits are incorrect Place of Supply (leading to wrong CGST/SGST instead of IGST) and missing HSN codes for businesses with annual turnover exceeding the statutory threshold. Modern software like VISTAAR automatically verifies customer GSTINs and applies the correct tax bifurcation based on the shipping address.</p>
    `,
  },
  {
    slug: 'how-to-track-daily-sales-cashbook-expenses',
    title: 'How to Track Daily Sales, Cashbook, and Business Expenses Accurately',
    excerpt: 'Close your cash drawer with zero discrepancies every night. Learn how to separate counter sales, bank transfers, and operating expenses.',
    category: 'Business Operations',
    publishedDate: 'September 28, 2026',
    readTime: '5 min read',
    author: 'VISTAAR Financial Engineering',
    authorRole: 'SME Operations Specialist',
    tags: ['Daybook', 'Cashbook', 'Expense Tracking', 'Cash Reconciliation', 'Closing Balance'],
    contentHtml: `
      <h2>The Daily Cash Discrepancy Trap</h2>
      <p>At the end of a busy 12-hour trading day, many shop owners find that the physical cash in the drawer does not match the sales ledger. Unrecorded tea expenses, small supplier advances, and customer change discrepancies accumulate quickly, obscuring the true profitability of your store.</p>

      <h2>1. Maintain a Real-Time Cashbook</h2>
      <p>Every rupee that enters or leaves the cash drawer must be recorded instantly at the point of exchange. In VISTAAR, the Daybook and Cashbook automatically capture all cash receipts, counter sales, and customer payment collections, updating your net cash position in real time.</p>

      <h2>2. Separate Cash from Bank (UPI / QR / Card) Receipts</h2>
      <p>Do not lump digital UPI collections and physical currency into a single "total sales" number. Keep your UPI settlement bank account separate from counter physical cash. This ensures that bank reconciliation takes minutes instead of hours at the end of the month.</p>

      <h2>3. Categorize Overhead Expenses</h2>
      <p>Categorize everyday business outlays into clear buckets: Store Rent, Electricity, Staff Wages, Transportation, Tea &amp; Refreshments, and Miscellaneous. Reviewing categorized monthly expenses helps you identify overhead creep before it hurts your net margin.</p>

      <h2>4. Perform a 5-Minute Nightly Daybook Close</h2>
      <p>Before pulling down the shutters, count the currency notes in your drawer and reconcile them against the closing cash balance in your VISTAAR Daybook. If a difference exists, resolve it while the day's events are fresh in your memory.</p>
    `,
  },
  {
    slug: 'getting-started-with-vistaar-business-os',
    title: 'Getting Started with VISTAAR Business OS: Step-by-Step Setup Guide',
    excerpt: 'Everything you need to set up your business profile, upload inventory, configure invoice numbering, and launch your first sale in under 15 minutes.',
    category: 'Business Operations',
    publishedDate: 'September 20, 2026',
    readTime: '6 min read',
    author: 'VISTAAR Onboarding Team',
    authorRole: 'Customer Success Specialist',
    tags: ['Getting Started', 'VISTAAR Setup', 'Quick Start', 'Product Guide', 'Onboarding'],
    contentHtml: `
      <h2>Welcome to VISTAAR Business OS</h2>
      <p>VISTAAR brings your inventory, billing, customers, payments, and business performance into one unified system. Whether you run a single retail counter or a multi-branch distribution business, you can get fully operational in under 15 minutes.</p>

      <h2>Step 1: Set Up Your Company Profile and GSTIN</h2>
      <p>Navigate to <em>Settings &gt; Business Settings</em>. Enter your official company or trading name, address, phone number, and GSTIN (if registered). You can also upload your company logo and add your UPI ID or bank account details to automatically appear on printed invoices.</p>

      <h2>Step 2: Add or Import Products</h2>
      <p>You can add products individually through the quick-add modal, or bulk import your existing catalogue via an Excel spreadsheet. For each product, specify its sale price, purchase rate, HSN code, GST rate, and current stock count.</p>

      <h2>Step 3: Create Your First Counter Sale or Invoice</h2>
      <p>Head to the <em>Counter Sales</em> or <em>Invoices</em> tab. Search for an item using name, SKU, or barcode. Select a customer or leave as "Counter Cash", choose cash or UPI, and click <em>Finalize &amp; Print</em>. Your stock balance and daybook ledger will update automatically.</p>

      <h2>Step 4: Connect Additional Devices (Android APK or Desktop)</h2>
      <p>Download the official VISTAAR Android APK from our <a href="/download">Download Center</a> to allow your counter staff to scan barcodes with their phone camera, or run the desktop app for dedicated ESC/POS thermal printing.</p>
    `,
  },
];
