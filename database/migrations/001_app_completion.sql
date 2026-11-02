USE insurance_claims_db;

-- ---------------------------------------------------------------------
-- Helper procedures for idempotent DDL (MySQL has no ADD INDEX IF NOT EXISTS)
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS add_index_if_missing;
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER //
CREATE PROCEDURE add_index_if_missing(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index) THEN
    SET @ddl = p_ddl;
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //
CREATE PROCEDURE add_column_if_missing(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column) THEN
    SET @ddl = p_ddl;
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

-- ---------------------------------------------------------------------
-- 1. Authentication tables (new; roles kept in a constrained ENUM)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS APP_USER (
  user_id        INT AUTO_INCREMENT PRIMARY KEY,
  full_name      VARCHAR(100) NOT NULL,
  email          VARCHAR(120) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,           -- scrypt$salt$hash, never plain text
  role           ENUM('Admin', 'Claims Officer') NOT NULL DEFAULT 'Claims Officer',
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at  TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS APP_SESSION (
  session_hash CHAR(64) PRIMARY KEY,               -- SHA-256 of the cookie token
  user_id      INT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME NOT NULL,
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES APP_USER(user_id) ON DELETE CASCADE,
  INDEX idx_session_expiry (expires_at)
);

-- ---------------------------------------------------------------------
-- 2. CLAIM.claim_priority (already added by the original script §5.1; kept idempotent)
-- ---------------------------------------------------------------------
CALL add_column_if_missing('CLAIM', 'claim_priority',
  "ALTER TABLE CLAIM ADD COLUMN claim_priority ENUM('Low','Medium','High','Critical') DEFAULT 'Medium'");

-- ---------------------------------------------------------------------
-- 3. Duplicate-payment protection
-- ---------------------------------------------------------------------
CALL add_column_if_missing('PAYMENT', 'transaction_reference',
  'ALTER TABLE PAYMENT ADD COLUMN transaction_reference VARCHAR(50) NULL');
CALL add_index_if_missing('PAYMENT', 'uq_payment_reference',
  'CREATE UNIQUE INDEX uq_payment_reference ON PAYMENT (transaction_reference)');

-- One settlement per claim. If this fails, existing data has duplicate settlements; resolve them first.
CALL add_index_if_missing('CLAIM_SETTLEMENT', 'uq_settlement_claim',
  'CREATE UNIQUE INDEX uq_settlement_claim ON CLAIM_SETTLEMENT (claim_id)');

-- ---------------------------------------------------------------------
-- 4. Supporting indexes for the application's JOIN / filter paths
-- ---------------------------------------------------------------------
CALL add_index_if_missing('CLAIM', 'idx_claim_status_date',
  'CREATE INDEX idx_claim_status_date ON CLAIM (claim_status, claim_date)');
CALL add_index_if_missing('CLAIM', 'idx_claim_priority',
  'CREATE INDEX idx_claim_priority ON CLAIM (claim_priority)');
CALL add_index_if_missing('INSURANCE_POLICY', 'idx_policy_status',
  'CREATE INDEX idx_policy_status ON INSURANCE_POLICY (policy_status)');
CALL add_index_if_missing('CLAIM_ASSESSMENT', 'idx_assessment_claim_date',
  'CREATE INDEX idx_assessment_claim_date ON CLAIM_ASSESSMENT (claim_id, assessment_date)');
CALL add_index_if_missing('CUSTOMER', 'idx_customer_name',
  'CREATE INDEX idx_customer_name ON CUSTOMER (name)');

-- ---------------------------------------------------------------------
-- 5. Database-level integrity triggers (backstop for the API checks)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS before_payment_insert;
DELIMITER //
CREATE TRIGGER before_payment_insert
BEFORE INSERT ON PAYMENT
FOR EACH ROW
BEGIN
  DECLARE v_amount DECIMAL(15,2);
  DECLARE v_paid   DECIMAL(15,2);
  SELECT settlement_amount INTO v_amount FROM CLAIM_SETTLEMENT WHERE settlement_id = NEW.settlement_id;
  SELECT COALESCE(SUM(payment_amount), 0) INTO v_paid FROM PAYMENT WHERE settlement_id = NEW.settlement_id;
  IF NEW.payment_amount <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment amount must be positive.';
  END IF;
  IF v_paid + NEW.payment_amount > v_amount THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment exceeds the settlement amount.';
  END IF;
END //
DELIMITER ;

DROP TRIGGER IF EXISTS before_assessment_insert;
DELIMITER //
CREATE TRIGGER before_assessment_insert
BEFORE INSERT ON CLAIM_ASSESSMENT
FOR EACH ROW
BEGIN
  IF NEW.assessed_amount > (SELECT claimed_amount FROM CLAIM WHERE claim_id = NEW.claim_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Assessed amount cannot exceed the claimed amount.';
  END IF;
END //
DELIMITER ;

-- ---------------------------------------------------------------------
-- 6. Views / routines used by the app (re-created so a fresh DB has them)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_claim_summary AS
SELECT cl.claim_id, c.customer_id, c.name AS customer_name, p.policy_id, pt.policy_name,
       cl.claim_date, cl.claimed_amount, cl.claim_status, cl.claim_priority
FROM CLAIM cl
JOIN INSURANCE_POLICY p ON cl.policy_id = p.policy_id
JOIN CUSTOMER c ON p.customer_id = c.customer_id
JOIN POLICY_TYPE pt ON p.policy_type_id = pt.policy_type_id;

CREATE OR REPLACE VIEW vw_settlement_balance AS
SELECT cs.settlement_id, cs.claim_id, cs.settlement_amount,
       COALESCE(SUM(pay.payment_amount), 0) AS total_paid,
       cs.settlement_amount - COALESCE(SUM(pay.payment_amount), 0) AS outstanding
FROM CLAIM_SETTLEMENT cs
LEFT JOIN PAYMENT pay ON pay.settlement_id = cs.settlement_id
GROUP BY cs.settlement_id, cs.claim_id, cs.settlement_amount;

DROP FUNCTION IF EXISTS CalculateSettlementPercentage;
DELIMITER //
CREATE FUNCTION CalculateSettlementPercentage(p_claim_id INT)
RETURNS DECIMAL(5,2)
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_claimed_amount DECIMAL(15,2);
  DECLARE v_settlement_amount DECIMAL(15,2);
  SELECT cl.claimed_amount, cs.settlement_amount INTO v_claimed_amount, v_settlement_amount
  FROM CLAIM cl LEFT JOIN CLAIM_SETTLEMENT cs ON cl.claim_id = cs.claim_id
  WHERE cl.claim_id = p_claim_id;
  IF v_claimed_amount IS NULL OR v_settlement_amount IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN ROUND((v_settlement_amount / v_claimed_amount) * 100, 2);
END //
DELIMITER ;

DROP TRIGGER IF EXISTS after_claim_settlement;
DELIMITER //
CREATE TRIGGER after_claim_settlement
AFTER INSERT ON CLAIM_SETTLEMENT
FOR EACH ROW
BEGIN
  UPDATE CLAIM SET claim_status = 'Settled' WHERE claim_id = NEW.claim_id;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS add_index_if_missing;
DROP PROCEDURE IF EXISTS add_column_if_missing;
