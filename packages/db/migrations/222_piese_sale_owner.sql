-- 222_piese_sale_owner.sql
-- Reține cine (care cont admin) a creat documentul — pentru „e-Factura doar pe vânzările lui".
-- Aditiv, nullable; documentele existente rămân cu NULL.
ALTER TABLE piese_stock_documents ADD COLUMN IF NOT EXISTS created_by_admin UUID REFERENCES admin_accounts(id);
CREATE INDEX IF NOT EXISTS idx_pdoc_created_by_admin ON piese_stock_documents(created_by_admin);

-- View-ul de facturi expune și vânzătorul (created_by_admin), ca să putem filtra pe el.
-- (coloană adăugată la final — cerință CREATE OR REPLACE VIEW.)
CREATE OR REPLACE VIEW piese_sale_invoices AS
SELECT d.id, d.invoice_series, d.invoice_number, d.created_at, d.efactura_status, c.name AS client_name,
  COALESCE((SELECT SUM(l.qty*l.unit_price) FROM piese_stock_document_lines l WHERE l.document_id=d.id),0) AS net,
  d.created_by_admin
FROM piese_stock_documents d LEFT JOIN piese_clients c ON c.id=d.client_id
WHERE d.doc_type='SALE' AND d.status='CONFIRMED' ORDER BY d.created_at DESC, d.id DESC;
