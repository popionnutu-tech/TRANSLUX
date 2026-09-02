-- ============================================================================
-- Nomenclatorul reclamațiilor — tipul și cine e vinovatul (02.09.2026)
--
-- Ion: «facem nomeclator de pretentii din partea la clienti pentru jalobe,
-- tipul lor cine este vinovat». Lista celor 11 puncte vine de la operatoarea
-- care răspunde clienților, din WhatsApp, cu observațiile lui Ion pe ea:
--   «6 la moment nu putem face nimic, va aparea cumparare bilet online»
--   «10 nu e vina soferilor»
--   «11 deja tot nu-i vina lor, dar tot am indicat»
--
-- Migrația 307 a dat DOSARUL (cine e vinovatul, ca om). Asta dă TIPOLOGIA: ce
-- anume s-a reclamat și cine răspunde de acel lucru. Fără ea, «reclamații per
-- șofer» pune la aceeași grămadă fumatul la volan și scaunele rupte — primul e
-- al omului, al doilea e al parcului.
--
-- De ce tabelă și nu constantă în cod (decizia lui Ion, 02.09): lista va crește,
-- iar un tip nou nu are de ce să ceară deploy.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS complaint_types (
  -- Cod stabil, scris în dosare. Numele se poate schimba oricând din panou,
  -- codul nu: el e ce leagă un dosar din august de tipul de azi.
  code text PRIMARY KEY,
  ord int NOT NULL,
  name_ro text NOT NULL,
  name_ru text NOT NULL,
  -- Cine răspunde de lucrul reclamat, IMPLICIT pentru tipul ăsta. Nu e verdict
  -- pe caz — e adresa la care pleacă cazul ca să fie cercetat.
  culprit text NOT NULL CHECK (culprit IN ('SOFER', 'COMPANIE', 'PARC', 'SITE', 'NECLAR')),
  note text,
  -- Tipurile ieșite din uz se sting, nu se șterg: dosarele vechi păstrează codul.
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE complaint_types IS 'Nomenclatorul tipurilor de reclamații de la clienți, cu vinovatul implicit al fiecărui tip (Ion, 02.09.2026). Editabil din panou: /reclamatii-tipuri.';
COMMENT ON COLUMN complaint_types.culprit IS 'Cine răspunde de lucrul reclamat: SOFER = omul de la volan; PARC = starea tehnică a mașinii; SITE = informația publicată; COMPANIE = organizarea (rezervări, orar); NECLAR = se stabilește la cercetare.';
COMMENT ON COLUMN complaint_types.active IS 'false = nu se mai propune agentului vocal. Dosarele vechi rămân legate de cod.';

-- Lista lui Ion, în ordinea din care a venit. ON CONFLICT DO NOTHING, nu UPDATE:
-- odată ce nomenclatorul e în mâna lui Ion, o rulare repetată a migrației n-are
-- voie să-i întoarcă denumirile și vinovații la ce am scris eu aici.
INSERT INTO complaint_types (code, ord, name_ro, name_ru, culprit, note) VALUES
  ('CONDITIONER',            1,  'Nu pornește condiționerul',                        'Не включают кондиционер',                          'SOFER',    NULL),
  ('AGRESIV_VERBAL',         2,  'Comportament agresiv',                             'Агрессивное поведение',                            'SOFER',    NULL),
  ('NERESPECTUOS',           3,  'Comportament nerespectuos',                        'Неуважительное поведение',                         'SOFER',    NULL),
  ('REFUZ_CAPAT',            4,  'Refuză să meargă până la Lipcani/Criva fără pasageri destui', 'Отказывается ехать до Липкан/Кривы без достаточного числа пассажиров', 'SOFER', NULL),
  ('TARIF_MARIT',            5,  'Cere o sumă mai mare decât prețul biletului',       'Требует больше стоимости билета',                  'SOFER',    NULL),
  ('REZERVARE_NERESPECTATA', 6,  'Nu așteaptă și nu ține locul rezervat',             'Не ждёт и не держит забронированное место',        'COMPANIE', 'Ion, 02.09: la moment nu putem face nimic, se rezolvă cu cumpărarea biletului online.'),
  ('REFUZ_DISTANTA_SCURTA',  7,  'Nu ia pasageri pe distanțe scurte',                 'Не берёт пассажиров на короткие расстояния',       'SOFER',    NULL),
  ('CONDUS_AGRESIV',         8,  'Conduce agresiv (frânează sau accelerează brusc)',  'Агрессивная езда (резко тормозит или разгоняется)','SOFER',    NULL),
  ('FUMAT',                  9,  'Fumat la volan',                                    'Курение за рулём',                                 'SOFER',    NULL),
  ('STARE_MASINA',           10, 'Starea mașinii (scaune, curățenie)',                'Состояние машины (сиденья, чистота)',              'PARC',     'Ion, 02.09: nu e vina șoferilor.'),
  ('INFO_SITE',              11, 'Informația de pe site nu corespunde realității',     'Информация на сайте не соответствует реальности',  'SITE',     'Ion, 02.09: nu e vina șoferilor, dar se înregistrează.'),
  -- Coșul de rezervă. Fără el, o reclamație care nu intră în listă ar rămâne
  -- fără tip, iar raportul ar arăta un gol în loc de un caz de citit.
  ('ALTUL',                  99, 'Altceva',                                           'Другое',                                           'NECLAR',   'Tipul nu s-a potrivit cu niciunul din listă — se citește textul reclamației.')
ON CONFLICT (code) DO NOTHING;

-- Tipul pe dosar. ON DELETE SET NULL e teoretic: tipurile se sting cu active,
-- nu se șterg. Rămâne ca plasă dacă cineva șterge totuși un cod din panou.
ALTER TABLE voice_complaints
  ADD COLUMN IF NOT EXISTS complaint_type text
  REFERENCES complaint_types(code) ON DELETE SET NULL;
COMMENT ON COLUMN voice_complaints.complaint_type IS 'Tipul reclamației, pus de agentul vocal în timpul apelului (decizia lui Ion, 02.09). Cod necunoscut sau lipsă → ALTUL: o reclamație nu se pierde niciodată din cauza tipului.';

-- Raportul «ce se reclamă cel mai des» și «câte reclamații de tipul X are
-- șoferul Y» — motivul întregii migrații.
CREATE INDEX IF NOT EXISTS idx_voice_complaints_type
  ON voice_complaints (complaint_type, created_at DESC);

ALTER TABLE complaint_types ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY complaint_types_deny ON complaint_types USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
