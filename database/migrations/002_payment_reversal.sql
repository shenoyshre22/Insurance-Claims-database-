-- Reversed payments stay in PAYMENT for audit but no longer count toward a settlement.
DROP TRIGGER IF EXISTS before_payment_insert;
DELIMITER //
CREATE TRIGGER before_payment_insert
BEFORE INSERT ON PAYMENT
FOR EACH ROW
BEGIN
  DECLARE v_amount DECIMAL(15,2);
  DECLARE v_paid   DECIMAL(15,2);
  SELECT settlement_amount INTO v_amount FROM CLAIM_SETTLEMENT WHERE settlement_id = NEW.settlement_id;
  SELECT COALESCE(SUM(payment_amount), 0) INTO v_paid FROM PAYMENT
   WHERE settlement_id = NEW.settlement_id AND COALESCE(payment_status, 'Completed') <> 'Reversed';
  IF NEW.payment_amount <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment amount must be positive.';
  END IF;
  IF v_paid + NEW.payment_amount > v_amount THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment exceeds the settlement amount.';
  END IF;
END //
DELIMITER ;

CREATE OR REPLACE VIEW vw_settlement_balance AS
SELECT cs.settlement_id, cs.claim_id, cs.settlement_amount,
       COALESCE(SUM(pay.payment_amount), 0) AS total_paid,
       cs.settlement_amount - COALESCE(SUM(pay.payment_amount), 0) AS outstanding
FROM CLAIM_SETTLEMENT cs
LEFT JOIN PAYMENT pay ON pay.settlement_id = cs.settlement_id
 AND COALESCE(pay.payment_status, 'Completed') <> 'Reversed'
GROUP BY cs.settlement_id, cs.claim_id, cs.settlement_amount;
