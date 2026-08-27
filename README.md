# 🚀 Vistaar — Enterprise Business & Inventory Management Platform

**Vistaar** is a modern, high-performance ERP and multi-workspace business management platform designed for inventory tracking, customer relationships, dynamic analytics, and seamless data sync via Supabase.

---

## ✨ Features

- 🏢 **Multi-Workspace Operations**: Manage multiple business environments effortlessly.
- 📦 **Smart Inventory & Stock Management**: Real-time stock receipts, low-stock alerts, product categorization, and bulk XLSX import/export.
- 👥 **Customer Relationship Management**: Complete customer records, purchase histories, and contact management.
- 📊 **Real-Time Analytics & Reporting**: Interactive sales, stock value, and customer retention metrics.
- ⚡ **Supabase Backend Integration**: Secure cloud storage, real-time database synchronization, and role-based data isolation.
- 🎨 **Modern Sleek UI**: Responsive, fluid interface built with React 19, Tailwind CSS v4, Lucide Icons, and smooth animations.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS v4, Lucide React Icons
- **Backend & Database**: Supabase (`@supabase/supabase-js`)
- **Data Export/Import**: SheetJS (`xlsx`)
- **Tooling**: Oxlint

---

## 🚀 Quick Start

### 1. Prerequisites
Ensure you have **Node.js** (v18+) and **npm** installed.

### 2. Installation
Clone the repository and install dependencies:

```bash
git clone https://github.com/navdeep852/vistaar.git
cd vistaar
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Development Server
Start the local development server:

```bash
npm run dev
```

The application will be running at `http://localhost:3005` (or default port `http://localhost:5173`).

---

## 📦 Scripts

- `npm run dev` — Start Vite development server
- `npm run build` — Compile TypeScript and build production assets
- `npm run preview` — Preview production build locally
- `npm run lint` — Lint codebase using Oxlint

---

## 📄 License

This project is licensed under the MIT License.
