// Export CommerceML 2.x — protocolul standard de schimb 1C (o direcție, modulul = sursa).
const esc = (s: unknown) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
const r2 = (n: number) => (Math.round(Number(n) * 100) / 100).toFixed(2);

export function buildCatalogXML(stamp: string, groups: any[], parts: any[]): string {
  const grp = groups.map((g) => `      <Группа><Ид>g${g.id}</Ид><Наименование>${esc(g.name_ro)}</Наименование></Группа>`).join('\n');
  const tov = parts.map((p) => `    <Товар><Ид>${p.id}</Ид><Артикул>${esc(p.article_code)}</Артикул><Наименование>${esc(p.name_long)}</Наименование><ШтрихКод>${esc(p.barcode)}</ШтрихКод><Группы><Ид>g${p.group_id}</Ид></Группы><БазоваяЕдиница Код="796">${esc(p.unit)}</БазоваяЕдиница></Товар>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация ВерсияСхемы="2.05" ДатаФормирования="${esc(stamp)}">
  <Каталог СодержитТолькоИзменения="false">
    <Ид>depozit-translux</Ид><Наименование>Catalog piese TRANSLUX</Наименование>
    <Группы>
${grp}
    </Группы>
    <Товары>
${tov}
    </Товары>
  </Каталог>
</КоммерческаяИнформация>`;
}

export function buildOffersXML(stamp: string, offers: any[]): string {
  const pr = offers.map((o) => `    <Предложение><Ид>${o.part_id}</Ид><Наименование>${esc(o.name)}</Наименование><Склад>${esc(o.warehouse)}</Склад><Количество>${r2(o.qty)}</Количество><Цены><Цена><ЦенаЗаЕдиницу>${r2(o.price)}</ЦенаЗаЕдиницу><Валюта>MDL</Валюта></Цена></Цены></Предложение>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация ВерсияСхемы="2.05" ДатаФормирования="${esc(stamp)}">
  <ПакетПредложений>
    <Ид>offers-translux</Ид><Наименование>Остатки и цены TRANSLUX</Наименование>
    <Предложения>
${pr}
    </Предложения>
  </ПакетПредложений>
</КоммерческаяИнформация>`;
}
