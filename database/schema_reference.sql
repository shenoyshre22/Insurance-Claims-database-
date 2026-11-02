-- =====================================================================
-- Reference DDL for the 10 core tables + sample data.
--
-- The original insurance_claims.sql contains queries, routines, views,
-- indexes and transactions but not the CREATE TABLE statements. This file
-- reconstructs the tables from the columns the application and queries use,
-- so a FRESH database can be created for development/testing.
--
-- DO NOT run this against your existing insurance_claims_db — your live
-- schema is authoritative. The app reads column metadata from
-- information_schema, so extra columns in your real tables are respected.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS insurance_claims_db;
USE insurance_claims_db;

CREATE TABLE CUSTOMER (
  customer_id    INT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  date_of_birth  DATE,
  gender         ENUM('Male', 'Female', 'Other'),
  phone          VARCHAR(20) UNIQUE,
  email          VARCHAR(120) UNIQUE,
  address        VARCHAR(255)
);

CREATE TABLE POLICY_TYPE (
  policy_type_id INT PRIMARY KEY,
  policy_name    VARCHAR(60) NOT NULL UNIQUE,
  description    VARCHAR(255)
);

CREATE TABLE INSURANCE_POLICY (
  policy_id       INT PRIMARY KEY,
  customer_id     INT NOT NULL,
  policy_type_id  INT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  premium_amount  DECIMAL(12,2) NOT NULL CHECK (premium_amount > 0),
  coverage_amount DECIMAL(15,2) NOT NULL CHECK (coverage_amount > 0),
  policy_status   VARCHAR(20) NOT NULL DEFAULT 'Active',
  CONSTRAINT chk_policy_dates CHECK (end_date > start_date),
  FOREIGN KEY (customer_id) REFERENCES CUSTOMER(customer_id),
  FOREIGN KEY (policy_type_id) REFERENCES POLICY_TYPE(policy_type_id)
);

CREATE TABLE INSURED_ASSET (
  asset_id      INT PRIMARY KEY,
  policy_id     INT NOT NULL,
  asset_type    VARCHAR(50) NOT NULL,
  asset_description VARCHAR(255),
  asset_value   DECIMAL(15,2),
  FOREIGN KEY (policy_id) REFERENCES INSURANCE_POLICY(policy_id)
);

CREATE TABLE INCIDENT (
  incident_id   INT PRIMARY KEY,
  incident_type VARCHAR(50) NOT NULL,
  incident_date DATE NOT NULL,
  location      VARCHAR(150),
  description   VARCHAR(500)
);

CREATE TABLE CLAIM (
  claim_id          INT PRIMARY KEY,
  policy_id         INT NOT NULL,
  incident_id       INT NOT NULL,
  claim_date        DATE NOT NULL,
  claimed_amount    DECIMAL(15,2) NOT NULL CHECK (claimed_amount > 0),
  claim_status      VARCHAR(20) NOT NULL DEFAULT 'Pending',
  claim_description VARCHAR(500),
  FOREIGN KEY (policy_id) REFERENCES INSURANCE_POLICY(policy_id),
  FOREIGN KEY (incident_id) REFERENCES INCIDENT(incident_id)
);

CREATE TABLE ASSESSOR (
  assessor_id    INT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  specialization VARCHAR(60),
  phone          VARCHAR(20)
);

CREATE TABLE CLAIM_ASSESSMENT (
  assessment_id   INT PRIMARY KEY,
  claim_id        INT NOT NULL,
  assessor_id     INT NOT NULL,
  assessment_date DATE NOT NULL,
  assessed_amount DECIMAL(15,2) NOT NULL CHECK (assessed_amount >= 0),
  recommendation  VARCHAR(30),
  remarks         VARCHAR(500),
  FOREIGN KEY (claim_id) REFERENCES CLAIM(claim_id),
  FOREIGN KEY (assessor_id) REFERENCES ASSESSOR(assessor_id)
);

CREATE TABLE CLAIM_SETTLEMENT (
  settlement_id     INT PRIMARY KEY,
  claim_id          INT NOT NULL,
  settlement_date   DATE NOT NULL,
  settlement_amount DECIMAL(15,2) NOT NULL CHECK (settlement_amount > 0),
  settlement_status VARCHAR(20) NOT NULL DEFAULT 'Approved',
  FOREIGN KEY (claim_id) REFERENCES CLAIM(claim_id)
);

CREATE TABLE PAYMENT (
  payment_id     INT PRIMARY KEY,
  settlement_id  INT NOT NULL,
  payment_date   DATE NOT NULL,
  payment_amount DECIMAL(15,2) NOT NULL CHECK (payment_amount > 0),
  payment_method VARCHAR(30),
  payment_status VARCHAR(20) DEFAULT 'Completed',
  FOREIGN KEY (settlement_id) REFERENCES CLAIM_SETTLEMENT(settlement_id)
);

-- ------------------------------ sample data ------------------------------
INSERT INTO CUSTOMER VALUES
 (101, 'Aarav Sharma', '1988-04-12', 'Male', '9876543210', 'aarav@example.com', 'Bengaluru'),
 (102, 'Diya Nair', '1992-09-30', 'Female', '9876543211', 'diya@example.com', 'Kochi'),
 (103, 'Rohan Mehta', '1979-01-05', 'Male', '9876543212', 'rohan@example.com', 'Mumbai'),
 (104, 'Ananya Rao', '1995-06-18', 'Female', '9876543213', 'ananya@example.com', 'Hyderabad');

INSERT INTO POLICY_TYPE VALUES
 (1, 'Motor Insurance', 'Vehicle damage and liability'),
 (2, 'Health Insurance', 'Hospitalisation cover'),
 (3, 'Home Insurance', 'Property damage cover');

INSERT INTO INSURANCE_POLICY VALUES
 (201, 101, 1, '2025-01-01', '2027-01-01', 12000, 500000, 'Active'),
 (202, 101, 3, '2025-03-01', '2027-03-01', 8000, 2000000, 'Active'),
 (203, 102, 2, '2025-06-01', '2027-06-01', 15000, 1000000, 'Active'),
 (204, 103, 1, '2024-01-01', '2025-01-01', 10000, 400000, 'Expired'),
 (205, 104, 2, '2026-01-01', '2028-01-01', 18000, 1500000, 'Active');

INSERT INTO INSURED_ASSET VALUES
 (301, 201, 'Car', 'Hyundai Creta', 1400000),
 (302, 202, 'House', '2BHK apartment', 6500000),
 (303, 203, 'Person', 'Self', NULL),
 (304, 204, 'Car', 'Maruti Swift', 600000),
 (305, 205, 'Person', 'Self', NULL);

INSERT INTO INCIDENT VALUES
 (401, 'Collision', '2026-02-10', 'Bengaluru', 'Rear-ended at a signal'),
 (402, 'Hospitalisation', '2026-03-05', 'Kochi', 'Appendectomy'),
 (403, 'Water Damage', '2026-04-20', 'Bengaluru', 'Pipe burst in kitchen'),
 (404, 'Hospitalisation', '2026-05-15', 'Hyderabad', 'Fracture treatment');

INSERT INTO CLAIM (claim_id, policy_id, incident_id, claim_date, claimed_amount, claim_status, claim_description) VALUES
 (501, 201, 401, '2026-02-12', 85000, 'Pending', 'Bumper and tail-light replacement'),
 (502, 203, 402, '2026-03-08', 160000, 'Pending', 'Surgery and 3-day stay'),
 (503, 202, 403, '2026-04-22', 240000, 'Pending', 'Flooring and cabinet repair'),
 (504, 205, 404, '2026-05-17', 45000, 'Pending', 'Orthopaedic treatment');

INSERT INTO ASSESSOR VALUES
 (601, 'Kiran Desai', 'Motor', '9000000001'),
 (602, 'Meera Iyer', 'Health', '9000000002'),
 (603, 'Vikram Singh', 'Property', '9000000003');

INSERT INTO CLAIM_ASSESSMENT VALUES
 (701, 501, 601, '2026-02-20', 80000, 'Approve', 'Damage consistent with report'),
 (702, 502, 602, '2026-03-15', 150000, 'Partially Approve', 'Room upgrade not covered');

INSERT INTO CLAIM_SETTLEMENT VALUES
 (801, 501, '2026-02-28', 80000, 'Approved');

INSERT INTO PAYMENT (payment_id, settlement_id, payment_date, payment_amount, payment_method, payment_status) VALUES
 (901, 801, '2026-03-02', 50000, 'NEFT', 'Completed');

UPDATE CLAIM SET claim_status = 'Settled' WHERE claim_id = 501;
UPDATE CLAIM SET claim_status = 'Approved' WHERE claim_id = 502;
