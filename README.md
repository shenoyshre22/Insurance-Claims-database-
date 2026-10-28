# DBMS SEM 5 MINI PROJECT

## Project Details

| Field | Details |
|---|---|
| **Project Title** | Insurance Claims Database |
| **Course** | Database Management Systems (DBMS) |
| **Semester** | 5 |
| **Project Type** | Mini Project |

## Team Members

| Sl. No. | Name | USN |
|---|---|---|
| 1 | Shreya Shenoy | PES2UG24CS487 |
| 2 | Shreya Patil | PES2UG24CS484 |

---

## 1. Project Overview

The **Insurance Claims Processing System** is a database-driven application designed to manage and streamline the insurance claims process.

The system maintains information about customers, insurance policies, insured assets, incidents, claims, assessors, claim assessments, settlements and payments.

It aims to provide an organized way to manage insurance-related records, track claims and maintain consistency across related database entities.

## 2. Project Objectives

- Design and implement a relational database for insurance claim management.
- Maintain customer and insurance policy information.
- Record incidents and manage associated claims.
- Manage claim assessments and settlement details.
- Maintain payment records.
- Implement SQL queries, stored procedures, functions, triggers, views, indexes and transactions.
- Develop a web-based interface to interact with the database.

## 3. Database Design

The relational database consists of the following 10 tables:

| Sl. No. | Table Name | Description |
|---|---|---|
| 1 | CUSTOMER | Stores customer information. |
| 2 | POLICY_TYPE | Stores different insurance policy categories. |
| 3 | INSURANCE_POLICY | Maintains insurance policy details. |
| 4 | INSURED_ASSET | Stores details of insured assets. |
| 5 | INCIDENT | Records incidents associated with claims. |
| 6 | CLAIM | Maintains insurance claim information. |
| 7 | ASSESSOR | Stores information about claim assessors. |
| 8 | CLAIM_ASSESSMENT | Maintains claim assessment records. |
| 9 | CLAIM_SETTLEMENT | Stores claim settlement details. |
| 10 | PAYMENT | Maintains payment information. |

## 4. Technology Stack

| Technology | Purpose |
|---|---|
| MySQL | Relational database management |
| MongoDB Atlas | NoSQL database component |
| Next.js | Frontend application framework |
| React | User interface development |
| TypeScript | Application development |
| Tailwind CSS | Interface styling |
| Node.js | JavaScript runtime |
| mysql2 | MySQL connectivity |

## 5. Project Structure

```text
Insurance-Claims-database-/
│
├── database/
│   └── insurance_claims.sql
│
├── frontend/
│   ├── src/
│   │   └── app/
│   ├── package.json
│   └── package-lock.json
│
├── backend/
│
├── documentation/
│
├── screenshots/
│
├── .gitignore
└── README.md
```

## 6. Application Features

- Admin dashboard with database statistics.
- Customer record management.
- Insurance policy management.
- Claim management.
- Claim assessment and settlement management.
- Payment record management.
- Search and retrieval of database records.

*Features are being implemented as part of the application development phase.*

## 7. Setup and Installation

### Prerequisites

- Node.js and npm
- MySQL Server
- MongoDB Atlas
- Git

### Step 1: Clone the Repository

```bash
git clone https://github.com/shenoyshre22/Insurance-Claims-database-.git
```

### Step 2: Set Up the MySQL Database

1. Open MySQL Command Line Client.
2. Execute the SQL script available in the `database/` directory.
3. Ensure the database `insurance_claims_db` is created successfully.

### Step 3: Install Frontend Dependencies

```bash
cd frontend
npm install
```

### Step 4: Configure Environment Variables

Create a `.env.local` file inside the `frontend/` directory.

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD (your local system's pw as the user accessing this project)
DB_NAME=insurance_claims_db
DB_PORT=3306
```

Replace `YOUR_MYSQL_PASSWORD` with your local MySQL password.

### Step 5: Run the Application

```bash
npm run dev
```

Open the application at:

```text
http://localhost:3000
```

## 8. Repository

GitHub: [Insurance Claims Database](https://github.com/shenoyshre22/Insurance-Claims-database-)

---

**Database Management Systems | Semester 5 | Mini Project**
