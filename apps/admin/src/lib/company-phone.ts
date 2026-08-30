// Numărul companiei — UN singur loc (round 3 Important 3: trei copii în trei
// forme; schimbarea numărului ar fi rupt tăcut whitelist-ul judecătorului și
// ar fi repornit pedepsirea purtării corecte la count=0).
export const COMPANY_PHONE = '+37360401010';
// Forma locală de 9 cifre, exact cum o dictează phone_spoken («373» → «0»).
export const COMPANY_PHONE_LOCAL = '0' + COMPANY_PHONE.replace(/\D/g, '').slice(3);
