\# Fleet ERP - Project Plan



\## Architecture

\- Backend: Node.js + Express + better-sqlite3

\- Frontend: React + Vite

\- Database: SQLite (fleet.db)

\- Ports: 3000 (backend), 5173 (frontend)



\## Structure

C:\\Fleet-ERP\\

├── PLAN.md

├── server\\

│   ├── package.json

│   ├── server.js

│   ├── database.js

│   └── fleet.db

└── client\\

&#x20;   ├── package.json

&#x20;   ├── vite.config.js

&#x20;   ├── index.html

&#x20;   └── src\\

&#x20;       ├── App.jsx

&#x20;       ├── main.jsx

&#x20;       ├── api\\

&#x20;       ├── components\\

&#x20;       └── pages\\

&#x20;           ├── GMDashboard.jsx

&#x20;           ├── DriverPortal.jsx

&#x20;           ├── ReportIssue.jsx

&#x20;           └── VoiceAssistant.jsx



\## Database Tables

1\. vehicles (id, plate\_number, plate\_code, make, model, year, location, driver, phone, current\_km, last\_oil\_km, oil\_change\_interval, last\_oil\_change\_date, status, meter\_updated\_at, created\_at, updated\_at)

2\. km\_records (id, vehicle\_id, plate, current\_km, location, date, is\_oil\_change, notes, created\_at)

3\. oil\_changes (id, vehicle\_id, oil\_change\_km, oil\_change\_date, changed\_by, notes, created\_at)

4\. tickets (id, title, location, priority, status, description, vehicle\_id, reported\_by, opened\_at, closed\_at)

5\. work\_orders (id, wo\_no, site, category, priority, description, assigned\_to, status, reported\_date, completed\_date, final\_cost, month, year, created\_at)



\## Features

1\. Voice input → auto-create ticket (Web Speech API, AR + EN)

2\. Oil change alerts (5000 km threshold)

3\. Daily km readings

4\. Work orders

5\. GM Dashboard with stats



\## Colors

\- Primary: #1e3a8a (dark blue)

\- Danger: #dc2626 (red)

\- Success: #16a34a (green)

\- Warning: #f59e0b (amber)



\## How to Run

Terminal 1: cd C:\\Fleet-ERP\\server \&\& node server.js

Terminal 2: cd C:\\Fleet-ERP\\client \&\& npm run dev

Open: http://localhost:5173



\## APIs

\- GET  /api/vehicles

\- GET  /api/vehicles/:id/details

\- POST /api/vehicles/:id/reading

\- POST /api/vehicles/:id/oil-change

\- GET  /api/alerts

\- POST /api/tickets

\- GET  /api/work-orders

\- POST /api/work-orders

\- GET  /api/dashboard

