-- 351: Inventarierea prin scanare — sesiunea care supraviețuiește schimbării de aparat.
--
-- Eduard numără pe terminal, dar terminalul e incomod pentru revizuit: „сохраняя инвентаризацию на
-- терминале, повторно открывать можно в компьютере". Până acum foaia de numărare trăia doar în
-- memoria paginii — închideai fila, pierdeai numărătoarea. De aici tabelele: numărătoarea e o stare
-- salvată în bază, nu o formă deschisă.
--
-- `uq_piese_inv_session_open` lasă DOUĂ echipe să numere în paralel stelaje diferite din același
-- depozit, dar nu lasă un singur om să aibă două numărători deschise în același depozit — altfel
-- scanările s-ar împărți între ele fără ca el să știe în care a nimerit.
CREATE TABLE IF NOT EXISTS piese_inventory_sessions (
  id           bigserial PRIMARY KEY,
  warehouse_id bigint NOT NULL REFERENCES piese_warehouses(id),
  admin_id     uuid REFERENCES admin_accounts(id),
  actor_label  text,
  status       text NOT NULL DEFAULT 'OPEN',
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  document_id  bigint REFERENCES piese_stock_documents(id),
  CONSTRAINT piese_inv_session_status CHECK (status IN ('OPEN','COMMITTED','CANCELLED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_piese_inv_session_open
  ON piese_inventory_sessions(warehouse_id, admin_id) WHERE status = 'OPEN';

-- `UNIQUE (session_id, part_id)`: a doua scanare a aceleiași piese ADUNĂ pe rândul existent. Fără ea,
-- zece scanări ar face zece rânduri, iar la închidere ultimul ar fi câștigat — adică ai fi numărat 1
-- în loc de 10.
CREATE TABLE IF NOT EXISTS piese_inventory_session_lines (
  id             bigserial PRIMARY KEY,
  session_id     bigint NOT NULL REFERENCES piese_inventory_sessions(id) ON DELETE CASCADE,
  part_id        bigint NOT NULL REFERENCES piese_parts(id),
  location_label text NOT NULL,
  counted_qty    numeric NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_piese_inv_line UNIQUE (session_id, part_id)
);

CREATE INDEX IF NOT EXISTS idx_piese_inv_lines_session ON piese_inventory_session_lines(session_id);

ALTER TABLE piese_inventory_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE piese_inventory_session_lines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON piese_inventory_sessions, piese_inventory_session_lines FROM PUBLIC, anon, authenticated;
GRANT ALL ON piese_inventory_sessions, piese_inventory_session_lines TO service_role;
GRANT USAGE, SELECT ON SEQUENCE piese_inventory_sessions_id_seq, piese_inventory_session_lines_id_seq TO service_role;
