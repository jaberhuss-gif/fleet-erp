# Fleet ERP

Fleet ERP is an enterprise resource planning and management platform designed for managing fleet operations, building maintenance, projects, warehouse operations, and purchase requests. It provides role-based access control (RBAC), financial reporting, and operational dashboards.

## What It Does

- **Fleet Management**: Track vehicle usage, daily kilometer logs, driver details, and fleet maintenance.
- **Operations Hub**: Dedicated management for building maintenance, project tracking, warehouse inventory, and purchase requests.
- **Financial Reporting & Baselines**: Monitor operational expenses, contractor costs, and savings calculations against financial baselines.
- **Role-Based Access Control (RBAC)**: Fine-grained access permissions and role presets for modular user access across different operational areas.

## Folder Structure

- `client/`: React + Vite frontend application containing user interfaces, pages, components, and asset management.
- `server/`: Node.js + Express backend API providing database integrations (PostgreSQL), authentication, authorization (RBAC), and business logic.
- `tools/`: Utility scripts and tools, including PowerShell automation scripts for integrations (e.g., Outlook integration).

## Environment Variables

Copy `.env.example` to `.env` in your local environment or configure them in your hosting provider settings.

| Variable Name | Description | Required / Optional |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | Secret key for signing authentication tokens | Required |
| `RESET_OWNER_PASSWORD` | Set only when intentionally performing a controlled owner-password reset | Optional |

> **Note**: Do not commit actual secrets or credentials to source control.

## Running Locally

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [PostgreSQL](https://www.postgresql.org/) database instance

### 2. Installation

Install dependencies for the root, frontend, and backend packages:

```bash
# Install root dependencies
npm install

# Install client dependencies
cd client && npm install

# Install server dependencies
cd ../server && npm install
```

### 3. Environment Setup

Create a `.env` file in the `server/` directory or root environment based on `.env.example`:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/fleet_erp
JWT_SECRET=your-random-jwt-secret
```

### 4. Running the Application

**Building Frontend & Running Production Server:**

```bash
# Build client and start server from root
npm run build
npm start
```

**Development Mode:**

To run the frontend dev server with hot module replacement (HMR):

```bash
# Start frontend client
cd client
npm run dev

# In another terminal, start backend server
cd server
npm start
```
