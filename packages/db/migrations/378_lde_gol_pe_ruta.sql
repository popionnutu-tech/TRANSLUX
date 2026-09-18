-- 378: golul care NU se poate optimiza — partea drumului gol care stă PE rută
--
-- Ion, 18.09: «trebuie să facem distincție între km goi care pot fi optimizați și care
-- nu». Și tot el, pe Popescu (552BRAO, Vatici → Strășeni): «ruta începe la Vatici și se
-- termină la Strășeni; deci face 175 km rută, restul e livrare» — cei 175 includ și cele
-- două treceri GOALE Strășeni ↔ Vatici, fiindcă ele vin din felul în care uzina și-a
-- împărțit turele, nu din locul unde stă șoferul.
--
-- Deci un drum gol se împarte la satul-nume al rutei (primul din grafic):
--   între poartă și satul-nume  → km_gol_ruta, al uzinei, NU se optimizează;
--   dincolo de satul-nume       → al șoferului, se rezolvă cu alt șofer sau cu așteptare.
-- Un drum gol care nu intră deloc în satul-nume (de la poartă direct acasă) are 0 pe rută.
ALTER TABLE lde_route_run
  ADD COLUMN IF NOT EXISTS km_gol_ruta numeric(8,2);

COMMENT ON COLUMN lde_route_run.km_gol_ruta IS
  'Partea drumului gol al cursei care stă PE rută (între poartă și satul care dă numele '
  'rutei). Impusă de împărțirea turelor de către uzină — nu se optimizează. Subset al km_goi; '
  'restul lui e drumul șoferului spre/dinspre casă.';
