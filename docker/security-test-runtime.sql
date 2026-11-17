-- Provisionnement administratif exclusivement sur la base Docker jetable.
-- Le banc Node n'a jamais accès à root. Aucun compte applicatif réel n'est modifié.
USE nextclinic_security_test;
DELIMITER $$
CREATE PROCEDURE security_test_provision_runtime()
BEGIN
    DECLARE target_table VARCHAR(64);
    DECLARE previous_table VARCHAR(64) DEFAULT '';
    IF @@hostname <> 'nextclinic-security-test-db' OR DATABASE() <> 'nextclinic_security_test' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'I17 : serveur de test requis';
    END IF;
    CREATE USER IF NOT EXISTS 'security_test_runtime'@'%' IDENTIFIED BY 'disposable-runtime-password';
    REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'security_test_runtime'@'%';
    grant_loop: LOOP
        SELECT MIN(TABLE_NAME) INTO target_table FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = 'nextclinic_security_test' AND TABLE_TYPE = 'BASE TABLE'
            AND TABLE_NAME > previous_table;
        IF target_table IS NULL THEN LEAVE grant_loop; END IF;
        SET @runtime_grant = CONCAT('GRANT ', IF(target_table = 'clinical_access_audit_events', 'SELECT, INSERT', 'SELECT, INSERT, UPDATE, DELETE'),
            ' ON `nextclinic_security_test`.`', REPLACE(target_table, '`', '``'), '` TO \'security_test_runtime\'@\'%\'');
        PREPARE runtime_statement FROM @runtime_grant;
        EXECUTE runtime_statement;
        DEALLOCATE PREPARE runtime_statement;
        SET previous_table = target_table;
    END LOOP;
    GRANT EXECUTE ON PROCEDURE nextclinic_security_test.nextclinic_audit_protection_status TO 'security_test_runtime'@'%';
END$$
DELIMITER ;
CALL security_test_provision_runtime();
DROP PROCEDURE security_test_provision_runtime;
