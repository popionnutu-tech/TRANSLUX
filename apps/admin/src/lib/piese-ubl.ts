// Factură fiscală UBL 2.1 / EN-16931 (standardul e-Factura SFS Moldova ≈ RO). Generare reală.
const VAT_RATE = 20;
export interface UblLine { name: string; qty: number; unitPrice: number; unit: string }
export interface UblData { series: string; number: string; issueDate: string; supplier: { name: string; idno: string; address: string }; customer: { name: string; idno: string; address: string }; lines: UblLine[] }

const esc = (s: unknown) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
const r2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function buildInvoiceUBL(d: UblData): string {
  const lineXml: string[] = [];
  let net = 0;
  d.lines.forEach((l, i) => {
    const lineNet = l.qty * l.unitPrice; net += lineNet;
    lineXml.push(`  <cac:InvoiceLine><cbc:ID>${i + 1}</cbc:ID><cbc:InvoicedQuantity unitCode="${esc(l.unit || 'H87')}">${r2(l.qty)}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="MDL">${r2(lineNet)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${esc(l.name)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${VAT_RATE}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="MDL">${r2(l.unitPrice)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`);
  });
  const vat = net * VAT_RATE / 100, gross = net + vat;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>
  <cbc:ID>${esc(d.series)}${esc(d.number)}</cbc:ID>
  <cbc:IssueDate>${esc(d.issueDate)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>MDL</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>${esc(d.supplier.name)}</cbc:RegistrationName><cbc:CompanyID>${esc(d.supplier.idno)}</cbc:CompanyID></cac:PartyLegalEntity><cac:PostalAddress><cbc:StreetName>${esc(d.supplier.address)}</cbc:StreetName><cac:Country><cbc:IdentificationCode>MD</cbc:IdentificationCode></cac:Country></cac:PostalAddress></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>${esc(d.customer.name)}</cbc:RegistrationName><cbc:CompanyID>${esc(d.customer.idno)}</cbc:CompanyID></cac:PartyLegalEntity><cac:PostalAddress><cbc:StreetName>${esc(d.customer.address)}</cbc:StreetName><cac:Country><cbc:IdentificationCode>MD</cbc:IdentificationCode></cac:Country></cac:PostalAddress></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="MDL">${r2(vat)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="MDL">${r2(net)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="MDL">${r2(vat)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${VAT_RATE}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="MDL">${r2(net)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="MDL">${r2(net)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="MDL">${r2(gross)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="MDL">${r2(gross)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
${lineXml.join('\n')}
</Invoice>`;
}
