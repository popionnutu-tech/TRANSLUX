# Seat hold, unpaid-order expiry, payment failure/retry and bank callbacks in online bus ticketing (with MAIB e-commerce specifics)

Research date: 2026-10-10. Scope note: official help-center pages of FlixBus, BlaBlaCar Bus, Omio, Busbud, Busfor, bilete.md, rutar.md, autogari.ro and CFR rarely publish the seat-hold timer or their payment-failure internals; most platform-side evidence is (a) third-party aggregator API docs, (b) consumer complaints, (c) T&Cs. The strongest primary sources are the PSP docs (maib, Stripe, Adyen).

## What seat-hold durations do platforms use (minutes) and what happens on expiry?

### Takeaway
No major bus marketplace (FlixBus, BlaBlaCar Bus, Omio, Busbud, Busfor, bilete.md, CFR) publicly documents its checkout seat-hold timer. Documented values: bus-API aggregators hold seats 5–8 min before the "book" call; maib's hosted checkout itself expires an unpaid transaction after 10 minutes (status TIMEOUT); Stripe Checkout sessions cannot be set below 30 min; an Infobus route page states unpaid reservations live up to 24 h. On expiry the seat is released automatically by the server (block lapses / session-expired event returns inventory).

### Cited Findings
- maib e-commerce transaction status `TIMEOUT`: "The transaction expired 10 minutes after the intermediate response because the Customer didn't pay in time." Other statuses: `CREATED` (payId/payUrl issued, customer has not paid yet), `PENDING`, `OK`, `FAILED`, `DECLINED`. — [maib: Transaction and 3D-Secure status](https://docs.maibmerchants.md/e-commerce/transaction-and-3d-secure-status.md)
- A bus-ticket API aggregator (adivaha, India; redBus-style flow) documents: "In block method your seat is tentatively blocked for a specific time (i.e. 5 to 8 Min) and if there is no confirmation after block method (i.e. book method is not called) before that time then the system will unblock the seats." Flow: busSearch → getBusSeatLayOut → getBoardingPoints → blockBus → bookBus → getBookDetails; "Trace id is valid for 15 Minutes only." — [adivaha bus API: block](https://adivaha.com/documentations/bus-api/bus-block.html); [adivaha API guide](https://www.adivaha.com/documentations/bus-api/api-guide.html)
- redBus (anecdotal, ~2018): a security researcher observed a seat-lock POST sent when the user reached the payment page and replayed it every 10 minutes, calling that the "lock-in period" — not official documentation, older info. — [InfoSec Write-ups: RedBus + MakeMyTrip bug bounty](https://infosecwriteups.com/redbus-makemytrip-bug-bounty-requests-tampering-aba8ea61da00)
- Infobus (route Tarnów–Chișinău, RO page): "rezervarea locului este valabilă până la 24 de ore, după care este retrasă automat de către server"; payment online by card or bank transfer; "Plata în autobuz nu este posibilă". — [infobus.eu route page](https://infobus.eu/ro/bus/route/from-tarnow-to-chisinau)
- Bileteria.ro (MD↔RO minibus routes): booking cut-off per operator, e.g. "Reservations can be made at least 2 hours before boarding", other routes 3 h. — [bileteria.ro Sculeni–Iași](https://bileteria.ro/Bus/SculeniMD-Iasi&zi=2024-03-31); [bileteria.ro Brăila–Leova](https://bileteria.ro/Bus/Braila-Leova&zi=2023-03-26)
- Stripe Checkout: `expires_at` must be between 30 minutes and 24 hours after creation (default 24 h); for limited inventory Stripe recommends expiring sessions early via the expire endpoint and releasing reserved inventory in the `checkout.session.expired` webhook handler. — [Stripe: Manage limited inventory](https://stripe.com/docs/payments/checkout/managing-limited-inventory); [Stripe: abandoned carts](https://stripe.com/en-ee/docs/payments/checkout/abandoned-carts)
- Generic seat-block APIs exist outside bus (Sabre seat block, travelmanager "temporarily block seats"), confirming the hold-then-confirm pattern is industry standard. — [Sabre Seat Block API](https://developer.sabre.com/docs/rest_apis/seat_block/v2); [travelmanager: temporarily block seats](https://travelmanager.de/en/support/api/temporarily-block-seats)
- CFR Călători: no public hold timer found; 2026 app added online seat reservation for season-pass holders; a 2009 article said online reservations were possible up to 30 days ahead and no later than 2 days before departure (outdated). — [Playtech 2026](https://playtech.ro/2026/cfr-calatori-introduce-o-facilitate-mult-asteptata-pentru-abonati-rezervarea-locului-disponibila-online/); [Capital (2009)](https://www.capital.ro/cfr-calatori-introduce-rezervarile-online-dar-contra-cost-117585.html)

### Inferences
- With maib as acquirer, the natural seat-hold is "maib TIMEOUT (10 min) + safety margin", e.g. hold 12–15 min: shorter than 10 min risks releasing a seat while the customer is still legitimately paying on the maib page (then paid-without-seat); much longer blocks inventory on popular departures.
- The hold must be released by a server-side job (cron/DB TTL), not by the browser — every source that documents expiry says "the server/system unblocks".
- A late successful callback arriving after the hold expired is the main paid-without-ticket risk; the system needs a rule for it (re-acquire seat if still free, else auto-refund).

### Gaps
- FlixBus, BlaBlaCar Bus, Omio, Busbud, Busfor, bilete.md, rutar.md, autogari.ro: no published checkout hold duration found (searches returned only forums/reviews).
- Whether maib's 10-minute TIMEOUT is configurable per merchant is not stated in the docs.

## How do they prevent double charges when a user retries after a failed or abandoned payment?

### Takeaway
PSP-level idempotency (Stripe keys kept ≥24 h; Adyen 7–14 days, 409/422 on concurrent duplicates) plus a merchant-side "one order = one active payment attempt" rule. maib's API has no documented idempotency-key header; the merchant must enforce it by orderId and by checking `pay-info` before creating a new payment. Consumer complaints (Busfor, Omio/Klarna) show double charges do happen at bus platforms.

### Cited Findings
- Stripe: idempotency key lets you "safely repeat the request without risk of creating a second object"; saved result returned for retries including 500s; keys may be pruned after ≥24 h; same key with different parameters errors; recommended V4 UUIDs, up to 255 chars. — [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- Adyen: `idempotency-key` header (≤64 chars, UUID v4); keys valid 7–14 days; concurrent duplicate returns HTTP 422/409 error 704 "request already processed or in progress"; retry only when `transient-error: true`; recommends async webhooks to recover responses lost to timeouts. — [Adyen: API idempotency](https://docs.adyen.com/development-resources/api-idempotency)
- maib `POST /v1/pay`: params amount, currency (MDL/EUR/USD), orderId (optional, ≤36 chars, merchant-generated), okUrl, failUrl, callbackUrl, language (ro/en/ru); returns `payId` + `payUrl` (checkout page with card, Apple Pay, Google Pay). No idempotency key and no orderId-uniqueness rule documented. — [maib: Direct payment](https://docs.maibmerchants.md/e-commerce/direct-payment.md)
- maib `GET /v1/pay-info/{payId}` returns status, statusCode, amount, confirmAmount, refundAmount, rrn, approval, masked card, orderId etc. — [maib: Payment information](https://docs.maibmerchants.md/e-commerce/payment-information.md)
- maib two-step payment (authorization then capture) is available, i.e. hold funds and capture only after ticket issuance. — [maib docs index](https://docs.maibmerchants.md/e-commerce/llms.txt); [maib: Two-step payment](https://docs.maibmerchants.md/e-commerce/two-step-payment.md)
- Busfor (UA) user review: one ticket emailed but Privat24 showed payment taken twice; bank confirmed. Another: UI showed "оплата не прошла", user pressed cancel, then received "ticket purchased" email. — [vidhuk.ua Busfor reviews](https://www.vidhuk.ua/busforua/review-437561); [vidhuk.ua](https://www.vidhuk.ua/busforua/review-1476442)
- Omio: complaint of a duplicate booking/charge via Klarna. — [sikayetvar: Omio charged twice via Klarna](https://www.sikayetvar.com/en/klarna-us/omio-charged-twice-via-klarna-duplicate-booking)

### Inferences
- For maib: before creating a new `/pay` on retry, query `pay-info` of the previous payId; if `OK` → issue ticket instead of charging again; if `CREATED`/`PENDING` → either reuse payUrl (if still within 10 min) or wait for TIMEOUT; only after `FAILED/DECLINED/TIMEOUT` create a new attempt. Store every payId per order (one-to-many) so a late `OK` on an "abandoned" attempt is still caught and refunded if a second attempt also succeeded.
- Two-step (auth/capture) makes "charged but no ticket" self-healing: no capture → authorization drops, rather than a refund.
- The Busfor "payment failed but ticket bought" case is the classic symptom of trusting the redirect (failUrl/UI) over the server-side callback/status.

### Gaps
- No public docs on how FlixBus/BlaBlaCar/Omio dedupe retries internally.
- maib does not document behaviour when the same orderId is sent twice.

## How is a ticket issued if the payment callback is late or never arrives?

### Takeaway
Best practice (Stripe) is dual-trigger, idempotent fulfillment: webhook is mandatory, the return/landing page also triggers the same fulfillment function, which must tolerate concurrent repeated calls. maib retries callbacks for ~1.5 days (10 s → 24 h) until HTTP 200, and `pay-info` lets the merchant poll; polling/reconciliation fills the gap.

### Cited Findings
- maib callback: HTTPS POST JSON with `result` {payId, orderId, status, statusCode, statusMessage, threeDs, rrn, approval, cardNumber, amount, currency} + `signature`. Signature = Base64(SHA-256 binary of values of `result` sorted alphabetically by key, joined with ":" + ":" + SignatureKey). Processed only when merchant returns HTTP 200; otherwise retried at 10, 60, 300, 600, 3600, 43200, 86400 s. — [maib: Notifications on Callback URL](https://docs.maibmerchants.md/e-commerce/notifications-on-callback-url.md)
- maib: okUrl/failUrl redirects are GET with payId and orderId appended; final status goes to callbackUrl ("final response"), payId/payUrl is the "intermediate response". — [maib: Direct payment](https://docs.maibmerchants.md/e-commerce/direct-payment.md); [maib terminology](https://docs.maibmerchants.md/e-commerce)
- Stripe: "You can't rely on triggering fulfillment only from your checkout landing page… a customer can pay successfully and then lose their internet connection"; also trigger on landing page because "webhooks can sometimes be delayed"; fulfillment function "might be called multiple times, possibly concurrently" and must record fulfillment status and check payment status from the API, not from the event. — [Stripe: Fulfill orders (hosted)](https://docs.stripe.com/checkout/fulfillment.md?payment-ui=stripe-hosted)
- Stripe webhooks: retries up to 3 days with exponential backoff; duplicates possible — log processed event IDs; no ordering guarantee; return 2xx quickly then process asynchronously; verify signature on raw body; reject stale timestamps (default 5-min tolerance) to prevent replay. — [Stripe: Webhooks](https://docs.stripe.com/webhooks)
- Adyen: use async webhooks to track responses lost to timeouts. — [Adyen: API idempotency](https://docs.adyen.com/development-resources/api-idempotency)
- Third-party bus API flow ends with getBookDetails after bookBus — i.e. status re-query after booking. — [adivaha API guide](https://www.adivaha.com/documentations/bus-api/api-guide.html)

### Inferences
- For maib: (1) callback handler verifies signature, upserts payment by payId, returns 200 fast; (2) okUrl landing page calls `pay-info` server-side and runs the same idempotent `issue_ticket(order)`; (3) a cron polls `pay-info` for orders in CREATED/PENDING older than ~11 min (past maib's 10-min TIMEOUT) to finalize them; (4) daily reconciliation against the maib merchant report/statement by rrn/payId.
- Never trust okUrl query params alone (they are unsigned GET params) — always confirm via pay-info or signed callback.
- maib's last retry at +24 h means a callback outage can delay truth by a day; polling is not optional for same-day departures.

### Gaps
- maib docs don't explicitly recommend pay-info as callback fallback, nor document a settlement/reconciliation report API.
- MIA (instant payments) via maib ecomm checkout: not mentioned in the e-commerce docs fetched (only card, Apple Pay, Google Pay).

## Do they allow partial refunds on a round-trip paid once; how?

### Takeaway
FlixBus allows cancelling just one leg (up to 15 min before departure), refunded as a voucher on a sliding scale. maib supports a partial refund, but only ONE refund per payment; a second partial refund requires contacting ecom@maib.md — a hard constraint for round trips paid as one transaction.

### Cited Findings
- FlixBus: cancel entire booking or "just a part of your journey up until 15 minutes before departure", refund as voucher; changes done by cancel + rebook. — [FlixBus support: Changing or cancelling a booking](https://support.flixbus.com/global/en/changing-or-cancelling-a-booking)
- FlixBus cancellation policy scale (as reported from the official page): 20% (<2 days), 40% (2–6 days), 70% (7–29 days), 100% (≥30 days); seat reservations and excess baggage refunded in full; booking/service fees non-refundable. — [FlixBus: Cancellation policy](https://www.flixbus.com/service/change-cancel-a-booking/cancellation-policy)
- maib `POST /v1/refund`: "The refund can be partial or full and can only be made once"; `refundAmount` ≤ transaction amount, omitted = full; status `REVERSED` if already refunded; for the remainder after a partial refund contact ecom@maib.md. — [maib: Payment refund](https://docs.maibmerchants.md/e-commerce/payment-refund.md)
- maib two-step: capture can be for a different amount (`confirmAmount` field exists in pay-info). — [maib: Payment information](https://docs.maibmerchants.md/e-commerce/payment-information.md)
- Busbud refund policy covers "technical issues" (ticket not delivered, charge mismatch), at Busbud's discretion, claim in writing via Help Center (page last updated 2019 — older info). — [Busbud refund policy](https://www.busbud.com/en-ca/refund-policy)

### Inferences
- Because maib allows one refund per payId, a round trip paid in one transaction can only be refunded once via API: if the outbound leg is refunded, the return leg later can't be (without bank support). Options: charge each leg as a separate maib payment (two payIds, one checkout each — worse UX), or keep one payment and issue refunds of later legs as vouchers/credit, or batch all refunds of an order into a single refund call.
- FlixBus' voucher-based model sidesteps acquirer refund limits entirely.

### Gaps
- No data on BlaBlaCar Bus/Omio/Busbud partial leg refunds mechanics; no info on bilete.md/rutar.md refund rules.
- maib refund time limits not stated.

## Any documented incidents/bugs (double booking, paid-without-ticket)?

### Takeaway
No formal engineering postmortems found; the evidence is consumer complaints showing three recurring failure modes: charged-but-no-ticket (redBus, Omio, Busbud), double charge for one ticket (Busfor, Omio/Klarna), and "UI said failed but ticket issued" (Busfor). Refund turnaround reported from 2 days to over a month.

### Cited Findings
- redBus: debit with no ticket; support told user money had not arrived and to check with bank; one refund returned in 2 days after escalation, another still unpaid after ~a week (app said 6–7 days). — [consumercomplaints.in: failed booking, payment deducted](https://www.consumercomplaints.in/redbus-failed-bus-ticket-booking-and-payment-deducted-c3522782); [consumercomplaints.in: ticket not booked but amount deducted](https://www.consumercomplaints.in/redbus-ticket-not-booked-but-amount-deducted-from-my-account-c3264403)
- Omio: charge with no ticket/invoice/booking reference; Klarna payment active but no confirmation. — [sikayetvar: Omio charged but no ticket](https://www.sikayetvar.com/en/omio-us/omio-charged-but-no-ticket-for-rome-to-cluj-napoca-flight); [sikayetvar: Omio customer service](https://www.sikayetvar.com/en/omio-us/omios-customer-service-is-not-responding-how-can-i-communicate-effectively-q-23368)
- Busfor: double debit for one ticket, refund not received; "payment failed" message followed by "ticket purchased" email; refunds "almost a month" waiting. — [vidhuk.ua Busfor](https://www.vidhuk.ua/busforua/review-437561); [vidhuk.ua Busfor](https://www.vidhuk.ua/busforua/review-1476442)
- Busbud: paid via phone agent, charge went to Busbud, had to buy second ticket, lost ~$85 (Feb–Mar 2025). — [PissedConsumer](https://www.pissedconsumer.com/people/26996103.html)
- 3DS/SCA abandonment context (vendor data, treat cautiously): Forter 2026 EMEA report ~1 in 6 trusted customers drop off at authentication across Europe (~1 in 4 in DE/AT); older Forter (2020) cites >40% abandonment in FR/ES from 3DS friction. — [Forter PSD2 report 2026](https://www.forter.com/psd2-forter-report-2026/); [Forter: Real cost of 3DS (2020)](https://www.forter.com/wp-content/uploads/2020/11/Forter_Real_Cost_3DS_v2.pdf)
- maib exposes `threeDs` outcome per transaction (AUTHENTICATED, NOT_AUTHENTICATED, UNAVAILABLE, ATTEMPTED, REJECTED, SKIPPED, NOTPARTICIPATED) — useful to classify abandoned vs declined attempts. — [maib: Transaction and 3D-Secure status](https://docs.maibmerchants.md/e-commerce/transaction-and-3d-secure-status.md)

### Inferences
- All three failure modes map to missing server-side truth: issuing from redirect (UI) instead of signed callback/status, no idempotent fulfillment, and no reconciliation job that auto-refunds orphan successful payments.
- 3DS abandonment means many orders will sit in CREATED until maib TIMEOUT; the seat hold must survive the 3DS step (a few minutes) but not much longer.

### Gaps
- No public engineering postmortem from FlixBus/BlaBlaCar/Omio/Busbud/Busfor on double booking or seat overselling.
- No public incidents found for bilete.md, rutar.md, autogari.ro, CFR online sales (beyond a 2023 notice that CFR's reservation system was down for a day: [alba24.ro](https://alba24.ro/cfr-calatori-sistemul-de-cumparare-a-biletelor-cu-rezervare-de-loc-nu-va-functiona-miercuri-4-octombrie-1000320.html)).
- Complaint-site evidence is anecdotal and unverified; frequency of these failures is unknown.
