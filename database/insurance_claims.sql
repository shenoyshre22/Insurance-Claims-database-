USE insurance_claims_db;
SHOW TABLES;
CREATE USER 'shreyap'@'%' IDENTIFIED BY 'shreyap170606';
GRANT ALL PRIVILEGES
ON insurance_claims_db.*
TO 'shreyap'@'%';
SHOW GRANTS FOR 'shreyap'@'%';

USE insurance_claims_db;


-- =========================================================
-- 1. POLICIES WITH CUSTOMER AND POLICY TYPE
-- =========================================================

SELECT
    p.policy_id,
    c.name AS customer_name,
    pt.policy_name,
    p.start_date,
    p.end_date,
    p.premium_amount,
    p.coverage_amount,
    p.policy_status
FROM INSURANCE_POLICY p
JOIN CUSTOMER c
    ON p.customer_id = c.customer_id
JOIN POLICY_TYPE pt
    ON p.policy_type_id = pt.policy_type_id;


-- =========================================================
-- 2. CUSTOMERS WITH MULTIPLE POLICIES
-- =========================================================

SELECT
    c.customer_id,
    c.name,
    COUNT(p.policy_id) AS number_of_policies
FROM CUSTOMER c
JOIN INSURANCE_POLICY p
    ON c.customer_id = p.customer_id
GROUP BY c.customer_id, c.name
HAVING COUNT(p.policy_id) > 1;


-- =========================================================
-- 3. AVERAGE CLAIM AMOUNT BY POLICY TYPE
-- =========================================================

SELECT
    pt.policy_name,
    AVG(cl.claimed_amount) AS average_claim_amount
FROM POLICY_TYPE pt
JOIN INSURANCE_POLICY p
    ON pt.policy_type_id = p.policy_type_id
JOIN CLAIM cl
    ON p.policy_id = cl.policy_id
GROUP BY pt.policy_type_id, pt.policy_name;


-- =========================================================
-- 4. CLAIMED AMOUNT VS ASSESSED AMOUNT
-- =========================================================

SELECT
    cl.claim_id,
    cl.claimed_amount,
    ca.assessed_amount,
    (cl.claimed_amount - ca.assessed_amount) AS difference
FROM CLAIM cl
JOIN CLAIM_ASSESSMENT ca
    ON cl.claim_id = ca.claim_id;


-- =========================================================
-- 5. CLAIMS ABOVE AVERAGE CLAIM AMOUNT
-- =========================================================

SELECT
    claim_id,
    policy_id,
    claimed_amount,
    claim_status
FROM CLAIM
WHERE claimed_amount > (
    SELECT AVG(claimed_amount)
    FROM CLAIM
);


-- =========================================================
-- 6. SETTLEMENT PERCENTAGE
-- =========================================================

SELECT
    cl.claim_id,
    cl.claimed_amount,
    cs.settlement_amount,
    ROUND(
        (cs.settlement_amount / cl.claimed_amount) * 100,
        2
    ) AS settlement_percentage
FROM CLAIM cl
JOIN CLAIM_SETTLEMENT cs
    ON cl.claim_id = cs.claim_id;


-- =========================================================
-- 7. STORED PROCEDURE - GET CLAIM DETAILS
-- =========================================================

DELIMITER //

CREATE PROCEDURE GetClaimDetails(IN p_claim_id INT)
BEGIN
    SELECT
        c.name AS customer_name,
        p.policy_id,
        pt.policy_name,
        ia.asset_type,
        i.incident_type,
        cl.claim_id,
        cl.claim_date,
        cl.claimed_amount,
        cl.claim_status,
        ca.assessed_amount,
        cs.settlement_amount,
        pay.payment_amount
    FROM CLAIM cl
    JOIN INSURANCE_POLICY p
        ON cl.policy_id = p.policy_id
    JOIN CUSTOMER c
        ON p.customer_id = c.customer_id
    JOIN POLICY_TYPE pt
        ON p.policy_type_id = pt.policy_type_id
    JOIN INSURED_ASSET ia
        ON p.policy_id = ia.policy_id
    JOIN INCIDENT i
        ON cl.incident_id = i.incident_id
    LEFT JOIN CLAIM_ASSESSMENT ca
        ON cl.claim_id = ca.claim_id
    LEFT JOIN CLAIM_SETTLEMENT cs
        ON cl.claim_id = cs.claim_id
    LEFT JOIN PAYMENT pay
        ON cs.settlement_id = pay.settlement_id
    WHERE cl.claim_id = p_claim_id;
END //

DELIMITER ;


-- TEST STORED PROCEDURE

CALL GetClaimDetails(501);


-- =========================================================
-- 8. CLAIMS ABOVE ₹1,00,000
-- =========================================================

SELECT
    claim_id,
    policy_id,
    claimed_amount,
    claim_status
FROM CLAIM
WHERE claimed_amount > 100000
ORDER BY claimed_amount DESC;


-- =========================================================
-- 9. COUNT CLAIMS BY STATUS
-- =========================================================

SELECT
    claim_status,
    COUNT(*) AS number_of_claims
FROM CLAIM
GROUP BY claim_status;


-- =========================================================
-- 10. TOTAL CLAIMED AMOUNT BY POLICY TYPE
-- =========================================================

SELECT
    pt.policy_name,
    SUM(cl.claimed_amount) AS total_claimed_amount
FROM POLICY_TYPE pt
JOIN INSURANCE_POLICY p
    ON pt.policy_type_id = p.policy_type_id
JOIN CLAIM cl
    ON p.policy_id = cl.policy_id
GROUP BY pt.policy_type_id, pt.policy_name
ORDER BY total_claimed_amount DESC;


-- =========================================================
-- 11. CLAIMS WHERE ASSESSED AMOUNT IS LOWER THAN CLAIMED
-- =========================================================

SELECT
    cl.claim_id,
    cl.claimed_amount,
    ca.assessed_amount
FROM CLAIM cl
JOIN CLAIM_ASSESSMENT ca
    ON cl.claim_id = ca.claim_id
WHERE ca.assessed_amount < cl.claimed_amount;


-- =========================================================
-- 12. CLAIMS WITHOUT SETTLEMENT
-- =========================================================

SELECT
    cl.claim_id,
    cl.policy_id,
    cl.claimed_amount,
    cl.claim_status
FROM CLAIM cl
LEFT JOIN CLAIM_SETTLEMENT cs
    ON cl.claim_id = cs.claim_id
WHERE cs.settlement_id IS NULL;


-- =========================================================
-- 13. SETTLEMENTS WITHOUT PAYMENT
-- =========================================================

SELECT
    cs.settlement_id,
    cs.claim_id,
    cs.settlement_amount,
    cs.settlement_status
FROM CLAIM_SETTLEMENT cs
LEFT JOIN PAYMENT p
    ON cs.settlement_id = p.settlement_id
WHERE p.payment_id IS NULL;


-- =========================================================
-- 14. STORED FUNCTION - CALCULATE SETTLEMENT PERCENTAGE
-- =========================================================

DELIMITER //

CREATE FUNCTION CalculateSettlementPercentage(p_claim_id INT)
RETURNS DECIMAL(5,2)
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_claimed_amount DECIMAL(15,2);
    DECLARE v_settlement_amount DECIMAL(15,2);

    SELECT
        cl.claimed_amount,
        cs.settlement_amount
    INTO
        v_claimed_amount,
        v_settlement_amount
    FROM CLAIM cl
    LEFT JOIN CLAIM_SETTLEMENT cs
        ON cl.claim_id = cs.claim_id
    WHERE cl.claim_id = p_claim_id;

    IF v_claimed_amount IS NULL
       OR v_settlement_amount IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN ROUND(
        (v_settlement_amount / v_claimed_amount) * 100,
        2
    );
END //

DELIMITER ;


-- TEST STORED FUNCTION

SELECT CalculateSettlementPercentage(501);


-- =========================================================
-- 15. TRIGGER - UPDATE CLAIM STATUS AFTER SETTLEMENT
-- =========================================================

DELIMITER //

CREATE TRIGGER after_claim_settlement
AFTER INSERT ON CLAIM_SETTLEMENT
FOR EACH ROW
BEGIN
    UPDATE CLAIM
    SET claim_status = 'Settled'
    WHERE claim_id = NEW.claim_id;
END //

DELIMITER ;


-- CHECK TRIGGER

SHOW TRIGGERS;


USE insurance_claims_db;

-- =====================================================
-- SECTION 5: DDL OPERATIONS - ALTER AND DROP
-- =====================================================

-- 5.1 Add claim priority to the CLAIM table
ALTER TABLE CLAIM
ADD COLUMN claim_priority
ENUM('Low', 'Medium', 'High', 'Critical')
DEFAULT 'Medium';

-- Verify the modified table
DESCRIBE CLAIM;

SELECT claim_id, claim_status, claim_priority
FROM CLAIM;


-- 5.2 Create a temporary claim import staging table
CREATE TABLE claim_import_staging (
    import_id INT PRIMARY KEY AUTO_INCREMENT,
    claim_reference VARCHAR(30),
    import_date DATE,
    validation_status VARCHAR(30)
);

-- Verify table creation
SHOW TABLES LIKE 'claim_import_staging';


-- =====================================================
-- SECTION 6: DML OPERATIONS - UPDATE AND DELETE
-- =====================================================

-- 6.1 Insert a sample claim into the staging table
INSERT INTO claim_import_staging
(claim_reference, import_date, validation_status)
VALUES
('CLM-IMPORT-001', CURDATE(), 'Pending');

-- View the inserted record
SELECT *
FROM claim_import_staging;


-- 6.2 UPDATE the validation status
UPDATE claim_import_staging
SET validation_status = 'Verified'
WHERE claim_reference = 'CLM-IMPORT-001';

-- Verify the update
SELECT *
FROM claim_import_staging;


-- 6.3 DELETE the processed staging record
DELETE FROM claim_import_staging
WHERE claim_reference = 'CLM-IMPORT-001';

-- Verify deletion
SELECT *
FROM claim_import_staging;


-- =====================================================
-- SECTION 7: VIEW OPERATIONS
-- =====================================================

-- 7.1 Create a consolidated claim summary view
CREATE OR REPLACE VIEW vw_claim_summary AS
SELECT
    cl.claim_id,
    c.customer_id,
    c.name AS customer_name,
    p.policy_id,
    pt.policy_name,
    cl.claim_date,
    cl.claimed_amount,
    cl.claim_status,
    cl.claim_priority
FROM CLAIM cl
JOIN INSURANCE_POLICY p
    ON cl.policy_id = p.policy_id
JOIN CUSTOMER c
    ON p.customer_id = c.customer_id
JOIN POLICY_TYPE pt
    ON p.policy_type_id = pt.policy_type_id;

-- 7.2 Retrieve all claim summaries
SELECT *
FROM vw_claim_summary;

-- 7.3 Retrieve claims with a non-null status
SELECT *
FROM vw_claim_summary
WHERE claim_status IS NOT NULL;

-- 7.4 Retrieve high-priority and critical claims
SELECT *
FROM vw_claim_summary
WHERE claim_priority IN ('High', 'Critical');


-- =====================================================
-- SECTION 8: INDEX OPERATIONS
-- =====================================================

-- 8.1 Create a composite index on claim status and date
CREATE INDEX idx_claim_status_date
ON CLAIM (claim_status, claim_date);

-- 8.2 Verify the index
SHOW INDEX FROM CLAIM;

-- 8.3 Examine the query execution plan
EXPLAIN
SELECT *
FROM CLAIM
WHERE claim_status = 'Pending'
AND claim_date >= '2026-01-01';


-- =====================================================
-- SECTION 9: TRANSACTION OPERATIONS
-- =====================================================

-- 9.1 COMMIT: Permanently save an inserted record

START TRANSACTION;

INSERT INTO claim_import_staging
(claim_reference, import_date, validation_status)
VALUES
('CLM-IMPORT-002', CURDATE(), 'Pending');

-- Verify the inserted record
SELECT *
FROM claim_import_staging
WHERE claim_reference = 'CLM-IMPORT-002';

-- Commit the transaction
COMMIT;

-- Verify that the record is saved
SELECT *
FROM claim_import_staging
WHERE claim_reference = 'CLM-IMPORT-002';


-- 9.2 ROLLBACK: Undo an uncommitted modification

START TRANSACTION;

UPDATE claim_import_staging
SET validation_status = 'Rejected'
WHERE claim_reference = 'CLM-IMPORT-002';

-- Verify the temporary modification
SELECT *
FROM claim_import_staging
WHERE claim_reference = 'CLM-IMPORT-002';

-- Roll back the transaction
ROLLBACK;

-- Verify that the original value is restored
SELECT *
FROM claim_import_staging
WHERE claim_reference = 'CLM-IMPORT-002';


-- 9.3 DROP: Remove the temporary staging table

DROP TABLE claim_import_staging;

-- Verify that the table has been removed
SHOW TABLES LIKE 'claim_import_staging';



