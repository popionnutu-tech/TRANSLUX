# Ticket delivery, boarding validation and fraud in online bus ticketing (2023–2026, Moldova/Eastern Europe emphasis)

Research note, collected 10.10.2026. Sources were mostly official help pages and terms. Where only third-party or vendor sources exist, this is stated. The search budget was limited, so the Gaps sections matter.

## 1. How are tickets delivered, and what do FlixBus, BlaBlaCar Bus, Omio, Busbud, RedBus, Busfor and Infobus require to retrieve a booking?

### Takeaway
The large operators deliver the ticket in several ways at once: an email with a PDF, SMS/WhatsApp and the app. Retrieval centres on a **booking number** combined with a contact identifier. FlixBus resends the confirmation to the **email or phone used at booking**, so the ticket goes to the channel already on file instead of being shown on screen to whoever asks. I found no official documentation of a "phone number only → ticket shown on screen" flow at any major seller.

### Cited Findings
- FlixBus: the booking number is a 10-digit code. It appears on the screen after booking, at the top of the ticket file in the confirmation email and in the SMS or WhatsApp confirmation, and in the Flix App under "General Info". — [FlixBus support: Changing or cancelling a booking](https://support.flixbus.com/global/en/changing-or-cancelling-a-booking)
- FlixBus: a lost confirmation is re-requested on the website by entering **the email address or phone number used when booking**. The confirmation is then sent to that contact. — [FlixBus support](https://support.flixbus.com/global/en/changing-or-cancelling-a-booking)
- FlixBus Manage My Booking: lets the user change or cancel a trip (up to 15 min before departure), update passenger names or contact details, and resend the confirmation. Small typos in a name are fixed free of charge. Larger edits count as a name change, which is treated as a cancellation with fees. — [FlixBus support](https://support.flixbus.com/global/en/changing-or-cancelling-a-booking)
- FlixBus login fields: one third-party guide says the lookup uses the booking number plus first and last name or the booking email. The official page does not list the fields. — [thepoortraveler.net (third party)](https://thepoortraveler.net/?p=43100)
- FlixBus also sells through additional channels (Google Assistant and others). — [Flix: Book tickets your way](https://www.flixbus.com.au/service/book-bus-ticket)
- BlaBlaCar Bus (sold through SNCF Connect): the ticket is a QR code in the SNCF Connect app, shown before boarding. The passenger name and the departure and arrival stops **cannot be changed**. Date and time can be changed. Cancelling from 24 h to 30 min before departure costs 40%, and cancellation is not possible in the last 30 min. "Special offer" fares are neither exchangeable nor refundable. — [SNCF Connect: BlaBlaCar Bus](https://www.sncf-connect.com/en-en/blablacar-bus)
- Omio: tickets are reached through the website, the app or the confirmation email, depending on the partner and ticket type. — [Omio: How it works](https://www.omio.com/how-it-works)
- RedBus (India): whether a mobile ticket is accepted depends on the operator. Sample tickets say either "This operator accepts mTicket, you need not carry a print out" or "does not accept mTicket, you need to carry a print out". Some operators accept the SMS shown at the counter. A ticket that never arrived is recovered on the site with the **ticket number**. Without it, the passenger has to go through customer care. These come from sample tickets on Scribd and an unofficial FAQ, not the official help centre. — [Scribd redBus sample ticket](https://www.scribd.com/document/593289796/bus-ticket); [unofficial redBus FAQ](https://easybookmy.it.com/info/faq)
- Indian state transport (for comparison): the SMS sent to the registered phone can be shown at boarding, together with a **photo ID shown to the conductor**. — [Manipur State Transport](https://manipurstatetransport.mn.gov.in/BookTicket.aspx)
- Infobus: there is a "Мои билеты → Войти" (My tickets → Log in) section, i.e. an account. In replies to complaints, support asks for the "ticket/order number". The carrier's contact is usually printed on the ticket. — [Infobus FAQ](https://infobus.eu/by/faq); [Trustpilot Infobus (reviews)](https://ca.trustpilot.com/review/infobus.eu)
- Infobus: an unpaid reservation is held for up to 24 h, then cancelled automatically and the seat goes back on sale. Each carrier sets its own restrictions. — [infobus.eu route page](https://infobus.eu/ro/bus/route/from-jaen-to-chisinau)
- Airline practice as a reference point: booking verification uses the **PNR plus the passenger's surname**. — [Kupibilet help](https://www.kupibilet.ru/help/oformlenie-i-pokupka-aviabiletov/sub/bronirovanie/art/kak-mne-proverit-chto-moya-bron-sushchestvuet)

### Inferences
- The industry standard is a **secret code (booking/PNR) + a second factor (surname or email)** for showing the booking on screen. Lookup by phone or email only is used to **resend** the ticket to the channel on file, not to display it to the person asking.
- Risks of phone-only lookup (no source found; general security reasoning): phone numbers are predictable (sequential, leaked in databases, visible in chats). Anyone who knows a passenger's number could see the trip, the time and the seat, and could cancel, change or claim the ticket. Adding the surname raises the bar only a little, because surnames are often guessable in a small community. Stronger mitigations are rate limiting, masking personal data, sending to the channel on file instead of displaying, and SMS/Telegram OTP before cancellation, refund or transfer.
- Telegram/WhatsApp as a delivery channel: FlixBus officially uses WhatsApp for confirmations. No official mention of a Telegram bot as a channel was found among the big sellers.

### Gaps
- No official help articles found for Busbud, Busfor or Omio describing exactly which fields "find my booking" asks for.
- No public documentation found of the real FlixBus login form (booking number + email vs + surname). Only a third-party source.
- No source (OWASP or a report) found specifically on the risks of phone-only lookup in ticketing.

## 2. How do they validate QR tickets at boarding and prevent reuse?

### Takeaway
FlixBus and BlaBlaCar use a **static QR + a passenger list on the driver's phone + photo ID**. Reuse is blocked by the server-side check-in (manifest) and by matching the name to the ID, not by the QR itself. Rotating QR codes (TOTP, 3–60 s) are the documented technique against screenshots, but they need a per-ticket secret and an accurate clock on the scanner. A static fallback cancels the protection.

### Cited Findings
- Flix EU terms: the confirmation (printed or PDF) **together with a valid official photo ID** counts as the ticket. The first and last name (and date of birth where needed) are required at booking, and "the passenger's name is matched with the booking list that is displayed on the cell phone of the driver or bus station staff". One ticket per person per journey. — [Flix GTC of Carriage (UK)](https://www.flixbus.co.uk/terms-and-conditions-of-carriage); [Flix GTC (AU)](https://www.flixbus.com.au/terms-and-conditions-of-carriage)
- Flix US/Canada terms: staff may ask passengers aged 16+ for government photo ID. Boarding may be refused if the ID does not match the name on the ticket. — [Flix Terms & Conditions of Travel (US)](https://www.flixbus.com/flix-terms-and-conditions-of-travel); [CA](https://www.flixbus.ca/flix-terms-and-conditions-of-travel)
- FlixBus passenger check-in: shortly before departure the passenger taps the ticket → "Express Check-In" and the driver scans the QR code shown. A printout is also accepted. — [wandernundmehr.at (third party, DE)](https://www.wandernundmehr.at/faq/wie-checke-ich-bei-flixbus-ein)
- Passengers complain of "invalid ticket at boarding" in the FlixBus app, a sign that the scanner checks status against the server or the synced list. — [Sikayetvar complaint](https://www.sikayetvar.com/en/flixbus-us/flixbus-app-shows-invalid-ticket-at-boarding-how-can-i-fix-this-issue-q-34516)
- Google Wallet rotating barcodes: the code carries a **TOTP** built from a per-pass secret (example `TOTP_SHA1`, `periodMillis` 3000, 8 digits). The reader must check it against the current time and accept only the latest code, which "reduces the risks associated with barcode screenshotting, in particular ticket theft or unauthorized ticket resale". Codes typically rotate about once a minute. Google recommends a unique key per pass. A static fallback barcode undermines the protection. — [Google Wallet: Rotating barcodes](https://developers.google.com/wallet/generic/resources/rotating-barcodes)
- Ticketmaster SafeTix: the barcode is reported to rotate every ~15 s, and screenshots do not work. This is a secondhand engineering analysis. — [Gigazine 2024](https://gigazine.net/gsc_news/en/20240710-ticketmaster-safetix-ticket)
- Celebratix (events): codes rotate every 3 s, so screenshots fail. — [Celebratix help](https://help.celebratix.io/en/articles/12087457-why-can-t-i-take-a-screenshot-of-my-ticket)
- BlaBlaCar Bus: QR in the SNCF Connect app, shown before boarding. — [SNCF Connect](https://www.sncf-connect.com/en-en/blablacar-bus)

### Inferences
- For coaches with a manifest (a named seat on a specific trip), the main protection against reuse is the **"boarded" status on the server**, together with the name/ID check and the list on the driver's phone. A screenshot of a static QR then only helps once, and a second scan shows "already boarded". This requires the driver app to sync a **local copy of the manifest** before departure, so it works without signal on the road, and to send check-ins to the server once signal returns. Two buses validating the same ticket offline simultaneously is unlikely for one trip.
- A rotating QR adds a lot of complexity (per-ticket secret on the phone, clock, an app or wallet pass instead of a PDF or Telegram message). It is worth it mainly when tickets are not named or there is no manifest (urban transport, events). For named tickets on an interurban route, a QR signed by the server (HMAC/Ed25519, verifiable offline) plus a per-trip manifest is the usual proportionate choice.

### Gaps
- No public documentation found of the FlixBus driver app (offline mode, sync, how double scans are handled).
- No public documentation found for BlaBlaCar Bus, Busfor or Infobus driver apps.

## 3. What fraud and chargeback controls are documented for bus and rail ticket sellers?

### Takeaway
Travel is a high-risk card-not-present (CNP) vertical. The documented patterns are card testing through accounts, chargebacks (including "friendly fraud" after refunds were learned during the pandemic), and phishing and fake staff. The documented defences are 3-D Secure / liability shift, the manifest as evidence in disputes (Visa accepts flight manifests), named non-transferable tickets, and rate limits.

### Cited Findings
- Riskified (2024 data): flight-booking risk rose **+14% YoY**. Travellers learned during the pandemic to ask for refunds, sometimes under false pretenses. — [Riskified Travel Risk Rundown](https://www.riskified.com/lp/travel-risk-rundown/view/)
- Signifyd (vendor, undated): hacked accounts are used to test large numbers of cards in quick succession, generating large authorization costs. — [Signifyd airline](https://www.signifyd.com/industries/airline)
- Visa accepts airline **flight manifests** as evidence in fraud chargebacks: if the passenger name matches the cardholder, the chargeback can be reversed. The article's date is unconfirmed. — [Traveldaily](https://traveldaily.com.au/?p=225735)
- Visa Europe: a planned **€12 fee** on acquirers for unsecured CNP fraud chargebacks, which pushes travel firms toward 3DS. The date is unconfirmed and it may be older than 2023. — [Travolution](https://www.travolution.com/news/travel-sectors/tour-operators/visa-chargeback-fee-to-put-pressure-on-travel-to-counter-payment-fraud/)
- Flix terms: a ticket presented by **someone other than the named passenger becomes void** and may be cancelled. It covers only the booked origin, destination, date and time. — [Flix Terms (US)](https://www.flixbus.com/flix-terms-and-conditions-of-travel)
- BlaBlaCar Bus: the name cannot be changed, so the ticket is effectively non-transferable. Promotional fares cannot be exchanged or refunded, which limits abuse through "buy cheap, refund in cash". — [SNCF Connect](https://www.sncf-connect.com/en-en/blablacar-bus)
- Phishing and scams: a fact-check by Mimikama on a fake "€2 luggage" FlixBus promotion advises anyone who entered data to contact their bank. — [Mimikama](https://www.mimikama.org/?p=341744)
- In-person scam (complaint, May 2026): people posing as FlixBus drivers in Vienna sent passengers to the "wrong station" and charged €10 for a ride, and the passengers missed the bus. — [Sikayetvar](https://www.sikayetvar.com/en/flixbus-us/scammers-posing-as-flixbus-drivers-in-vienna-misdirect-passengers-and-charge-10-for-a-ride)

### Inferences
- For a small seller: (a) 3DS on every payment moves fraud liability to the issuer; (b) the boarding log (scan time + GPS) works as a "manifest" in chargeback disputes ("service used"); (c) named tickets with no rename, plus a limit on tickets per card or phone per trip, reduce scalping on peak days (holidays, Easter, the Diaspora season); (d) one promo code per phone or card, with a cap per trip.
- Insider fraud in a mixed cash + online model: the risk is that the driver collects cash without issuing a ticket and the seat stays "free" in the system. Typical controls (inference, no source found): reconciling scanned passengers + cash tickets issued against counts or occupancy (GPS stops, door counters), spot inspections, and on-board fiscal receipts.

### Gaps
- No found report (2023–2026) by Visa/Mastercard or Stripe dedicated specifically to bus or rail ticket sellers. Stripe Radar for travel was not checked (budget).
- No numbers found on scalping or bots at bus operators in Eastern Europe.

## 4. Moldova-specific issues (cash at driver, unofficial carriers, rutar.md)

### Takeaway
In Moldova the documented problem is **drivers who do not issue a ticket (cash without a record)** and **illegal carriers** (no licence or permit, including on routes abroad). ANTA runs regular sweeps with dozens of protocols. A draft passenger-rights regulation based on EU Reg. 181/2011 exists (2026), with ANTA as the authority.

### Cited Findings
- ANTA, sweep of 26.02–05.03.2026: **110 violations**. The most common was carrying paying passengers without permits or documents. **45 drivers fined for not issuing travel tickets**, fines up to 60 conventional units. Repeat illegal transport is penalised up to the equivalent of 550 USD. — [Logos Press: ANTA reports 110 violations](https://logos-pres.md/en/news/anta-has-stepped-up-vehicle-inspections)
- An earlier ANTA round (September, year not visible): 17 fines totalling ~43,000 lei, including for not issuing tickets or receipts to passengers. Another sweep produced 203 reports and >1.1 million lei in fines, mostly for unlicensed transport. — [Logos Press: ANTA fined illegal operators 1.1 million lei](https://logos-pres.md/en/news/anta-fined-illegal-transport-operators-1-1-million-lei/)
- Leușeni border post: a driver carrying 6 people to Italy without a licence was fined 2,000 lei and had his number plates removed for 6 months (date not visible in the snippet). — [IPN](https://ipn.md/en/vehicles-transporting-passengers-from-moldova-abroad-subject-to-checks-7967_1028565.html)
- Older IPN reports: minibus drivers face fines of up to 50,000 lei, and penalties for travel without a ticket are borne by those at fault (older dates, context). — [IPN: minibus drivers fines](https://ipn.md/en/print/minibus-drivers-face-fines-of-up-to-50000-lei--7967_998344.html); [IPN: penalties for trips without ticket](https://ipn.md/en/penalties-for-trips-without-ticket-will-be-sustained-by-culprits-7967_1007104.html)
- APOTA (the carriers' association), open letter to the Prime Minister on 22.12.2025: a "deep crisis" in passenger transport, lost regular routes, a request to halt an amendment to the Road Transport Code, and a threat of protests. — [APOTA letter (PDF)](https://laf.md/wp-content/uploads/2025/12/969969462-Adresare-APOTA-PM-a-Munteanu.pdf)
- Government draft (2026): passenger-rights rules for coach and bus travel, based on EU Reg. 181/2011, with ANTA as the monitoring authority. Adoption was not confirmed. — [particip.gov.md](https://particip.gov.md/ro/download_attachment/37683)

### Inferences
- For a Moldovan carrier selling online, the "cash at driver" problem is a regulatory risk (ANTA fines for an unissued ticket) as well as a revenue risk. Selling online with scanning at boarding produces a passenger record that serves both as evidence for ANTA and as a check on the driver.
- Illegal carriers on routes abroad (minibuses to Italy etc.) are competitors. The real phishing risk in Moldova is more likely fake Facebook/Telegram pages that "sell seats" in the name of known carriers. I found no documented case of this.

### Gaps
- Nothing found on rutar.md (practices, ticket types, lookup). The site was not reached within the budget.
- No documented case in Moldova or Romania (2023–2026) of fake bus ticket websites or phishing. The searches returned only document fraud at the border.
- Not checked: the exact legal basis (Road Transport Code / Contravention Code article) for the "ticket not issued" offence or the current value of the conventional unit.
- No Moldovan data found on chargebacks or card fraud in transport (BNM, MAIB, MIA).
