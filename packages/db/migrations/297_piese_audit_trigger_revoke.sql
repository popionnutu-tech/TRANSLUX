-- 297: Funcția-trigger din migr. 292 rămăsese apelabilă de anon (uitată la revocare).
-- Inofensivă în sine — nu face decât să ridice o excepție — dar migrația 289 a stabilit regula că
-- NICIO funcție `piese_*` nu e apelabilă din afara aplicației, iar o excepție tăcută de la regulă
-- e exact felul în care s-au acumulat cele 12 de dinainte. Triggerul rulează ca proprietar al tabelei,
-- deci revocarea nu-i afectează funcționarea.
REVOKE ALL ON FUNCTION piese_audit_immutable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_audit_immutable() TO service_role;
