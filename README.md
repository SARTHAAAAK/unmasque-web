# UNMASQUE Web 🕵️‍♂️

**UNMASQUE Web** is a production-grade, full-stack application designed to provide a modern graphical interface for the UNMASQUE extraction engine. It allows researchers and database administrators to configure, execute, monitor, and analyze hidden database architectures securely from any browser.

---

## 🌟 Key Features

- **Real-Time Monitoring:** Live WebSocket integration streams extraction logs and progress instantly to the UI without polling.
- **Mandatory 2FA Security:** Enterprise-grade security enforcing Email-based One-Time Passwords (OTP) for all users upon login.
- **Cloud-Native Database:** Fully integrated with Neon Serverless PostgreSQL for permanent, secure data persistence.
- **Microservice Architecture:** A robust Node.js backend seamlessly orchestrating a dedicated Python FastAPI extraction engine.
- **Dynamic Configuration:** Interactive wizards for setting up extraction jobs, connection limits, and performance timeouts.

---

## 🏗️ Technology Stack

* **Frontend:** React, Vite, Vanilla CSS (Custom Design System)
* **Backend:** Node.js, Express, Socket.io
* **Core Engine:** Python, FastAPI
* **Database:** Prisma ORM, Neon PostgreSQL
* **Infrastructure:** Docker, Render

---

## 🚀 Live Deployment

The application is fully deployed and accessible here:
👉 **[https://unmasque-web.onrender.com](https://unmasque-web.onrender.com)**

*(Note: The application is hosted on Render's Free Tier and monitored via UptimeRobot to prevent cold-starts).*

---

## 💻 Local Development

To run UNMASQUE Web locally on your machine, you must have [Docker](https://www.docker.com/) installed.

### 1. Clone the repository
```bash
git clone https://github.com/SARTHAAAAK/unmasque-web.git
cd unmasque-web
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory and add the required variables:
```env
# Database Configuration (Use a local Postgres or Neon URL)
DATABASE_URL="postgresql://user:password@host/db?sslmode=require"

# Security Secrets
JWT_SECRET="your-super-secret-jwt-key"

# SMTP Email Configuration (For Mandatory 2FA)
EMAIL_USER="your-email@gmail.com"
EMAIL_PASS="your-google-app-password"
```

### 3. Build and Run via Docker Compose
```bash
docker compose up --build
```
This single command will spin up the Node.js API, the Python Extraction Engine, and serve the React frontend automatically.

---

## 🛡️ Security Notes
This project strictly enforces **Email Verification (2FA)** for all dashboard access. You must provide a valid SMTP configuration in your environment variables, otherwise, users will not be able to receive their 6-digit login codes.

---
*Built for Database Systems Labs.*
