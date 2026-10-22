# VISTAAR — SEO Measurement, Analytics & 30-Day Execution Plan

**Production Canonical Domain**: `https://www.vistaarone.com/`  
**Purpose**: Establish rigorous, privacy-compliant tracking of organic search discovery, Google Search Console indexing, Core Web Vitals, and conversion funnel milestones.

---

## 1. Google Search Console (GSC) Setup & Verification

Google Search Console is the authoritative source of organic search health, indexation status, search queries, and Core Web Vitals field data.

### Step-by-Step Setup Instructions

1. **Access Google Search Console**:
   - Navigate to [https://search.google.com/search-console/](https://search.google.com/search-console/) using the official company Google account.
2. **Add Property Type**:
   - Choose **Domain Property** (Recommended): Enter `vistaarone.com`. This captures all subdomains, protocols, and variations (`https://www.vistaarone.com`, `https://vistaarone.com`, etc.).
   - Alternatively, add **URL Prefix Property**: `https://www.vistaarone.com/`.
3. **Verify Ownership**:
   - **Method A: DNS TXT Record (Preferred)**:
     - Copy the TXT verification string provided by Google (e.g., `google-site-verification=...`).
     - In your domain DNS manager (e.g., Cloudflare, GoDaddy, Namecheap), add a `TXT` record at root (`@`) with this value.
   - **Method B: HTML Meta Tag**:
     - If using URL Prefix, add the verification meta tag to `index.html`:
       `<meta name="google-site-verification" content="YOUR_VERIFICATION_CODE" />`
4. **Submit Canonical XML Sitemap**:
   - In GSC left navigation, click **Sitemaps**.
   - Under "Add a new sitemap", enter: `sitemap.xml`.
   - Click **Submit**.
   - Expected status: **Success** with 14 discovered URLs.
5. **Initial URL Inspection**:
   - Use the URL Inspection tool at the top of GSC on `https://www.vistaarone.com/`.
   - Click **Test Live URL** to confirm Googlebot smartphone crawls the rendered HTML, discovers the JSON-LD structured data, and identifies no indexing blocks.
   - Click **Request Indexing**.

---

## 2. Analytics & Conversion Event Instrumentation

### Safety & Privacy Rules (Non-Negotiable)
- **Zero Sensitive Data Logging**: Never send customer phone numbers, GST numbers, customer names, passwords, OTPs, or invoice values to analytics tools.
- Track strictly behavioral, privacy-preserving event names.

### Core Conversion Event Taxonomy

| Event Name | Trigger Condition | Parameters | Business Meaning |
|---|---|---|---|
| `public_page_view` | User or bot loads a public route | `page_path`, `page_title` | Measures content reach and landing page traffic |
| `click_cta_start_free` | User clicks "Start Free" button in header or hero | `location` ('header', 'hero', 'footer', 'pricing_card') | High-intent registration interest |
| `click_cta_pricing` | User clicks "Pricing" nav or "Compare Plans" | `source_page` | Mid-funnel commercial evaluation |
| `click_feature_item` | User navigates to a feature landing page | `feature_slug` ('billing-invoicing', etc.) | Feature interest discovery |
| `signup_started` | User enters email in registration modal | `method` ('email_otp') | Top of signup funnel |
| `signup_completed` | User completes business profile creation | `plan_selected` | **Primary Business Conversion (North Star)** |
| `contact_form_submitted` | User submits inquiry on `/contact` | `topic` | Inbound enterprise / high-touch lead |

---

## 3. SEO Performance Metrics & Baseline KPIs

When Search Console access is verified, establish the following 90-day baseline dashboard:

| Metric | Target (Month 1) | Target (Month 3) | Primary Source |
|---|---|---|---|
| **Indexed Pages** | 100% of sitemap (14/14) | 100% of sitemap + new guides | GSC Indexing Report |
| **Organic Search Impressions** | Establish Baseline | +150% growth | GSC Performance |
| **Non-Branded Clicks** | Establish Baseline | +100% growth | GSC Performance |
| **Average Organic CTR** | $> 2.5\%$ for branded; $> 1.5\%$ for generic | $> 3.5\%$ | GSC Performance |
| **Mobile Core Web Vitals (CrUX)** | LCP $\le 2.5\text{s}$, INP $\le 200\text{ms}$, CLS $\le 0.1$ | Good (Green status across all URLs) | GSC Core Web Vitals |
| **Free Signups from Organic** | Baseline | Steady compounding growth | Analytics Funnel |

---

## 4. Reporting Cadence & Decision Rules

### Review Cadence
- **Weekly**: Monitor GSC for crawl errors, 404s, mobile usability warnings, and sitemap status.
- **Bi-Weekly**: Analyze query clicks, impressions, and CTR movements.
- **Monthly**: Review conversion rates from landing pages to free registrations.

### Decision Rules for Optimization
1. **High Impressions, Low CTR ($< 1.5\%$) on a Target Keyword**:
   - *Action*: Rewrite title tag and meta description to be more compelling, direct, and benefit-driven. Test inclusion of active verbs (e.g., "Start Free", "1-Click GST Bills").
2. **High CTR, High Bounce, Low Registration Conversion**:
   - *Action*: Improve above-the-fold relevance. Ensure the direct answer passage immediately matches the search query and the "Start Free" CTA is clear and frictionless.
3. **Keyword Ranking on Page 2 (Positions 11–20)**:
   - *Action*: Add depth to the corresponding feature page. Create 2 supporting educational cluster articles linking directly to the feature page using contextual anchor text.
4. **Crawl Budget / Indexing Delay**:
   - *Action*: Check server response times, ensure no accidental noindex tags, verify internal links from the homepage, and re-request indexing in GSC.

---

## 5. Prioritized Next-30-Days Execution Plan

### Week 1: Production Deployment & Foundation Verification
- [ ] Obtain user authorization to commit and push changes to production repository.
- [ ] Verify live deployment of `robots.txt`, `sitemap.xml`, `llms.txt`, and public routes on `https://www.vistaarone.com/`.
- [ ] Complete Google Search Console DNS/HTML ownership verification.
- [ ] Submit `https://www.vistaarone.com/sitemap.xml` in GSC.
- [ ] Test live URLs in Google Rich Results Test to confirm valid `Organization`, `WebSite`, and `SoftwareApplication` JSON-LD structured data.

### Week 2: Local & Business Entity Signals
- [ ] If eligible, claim and verify the official Google Business Profile for VISTAAR.
- [ ] Align NAP (Name, Address, Phone) consistently with `/contact` and `/about` pages.
- [ ] Audit social profiles (LinkedIn, X, YouTube) to link back to canonical `https://www.vistaarone.com/`.
- [ ] Add Bing Webmaster Tools verification and submit XML sitemap to Bing IndexNow.

### Week 3: Content Expansion (Spoke Articles)
- [ ] Author Article 1: *"How to Track Customer Udhaari and Reduce Uncollected Debts in Small Business"* (`/resources/how-to-manage-customer-udhari`).
- [ ] Author Article 2: *"How Billing Software and Real-Time Inventory Sync in Retail Counters"* (`/resources/how-billing-and-inventory-sync`).
- [ ] Add contextual internal links from articles back to `/features/udhari-management` and `/features/billing-invoicing`.

### Week 4: Analytics Review & Conversion Optimization
- [ ] Review first 14 days of Search Console impressions and indexing reports.
- [ ] Inspect mobile viewport performance on Indian 4G connections.
- [ ] Run heatmaps / scroll-depth analysis on `/` and `/pricing` to refine CTA placement.
- [ ] Formulate month-2 expansion plan based on verified search query data.
