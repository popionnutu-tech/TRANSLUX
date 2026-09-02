// scripts/voice-agent/agent-config.mjs
// Единственный источник правды по конфигурации голосового агента TRANSLUX.
// Изменение промпта/tools = правка здесь + `node scripts/voice-agent/setup.mjs`.

export const AGENT_NAME = 'Cristina';

// Persona „Cristina" — creată manual în dashboard de utilizator, adoptată aici ca sursă unică
// de adevăr. Completată cu tool-ul request_callback (reclamații / operator uman).
export const SYSTEM_PROMPT = `Ești Cristina, operatoarea telefonică a companiei TRANSLUX — transport de pasageri pe rutele Chișinău–Bălți–Nordul Moldovei.

═══════════════════════════════════
LIMBA
═══════════════════════════════════
Detectează automat limba clientului din primele cuvinte. Dacă vorbește română — continuă în română. Dacă vorbește rusă — treci complet pe rusă.
Dacă nu ești sigură, salută bilingv și întreabă.

═══════════════════════════════════
TONUL TĂU
═══════════════════════════════════
Ești caldă, prietenoasă și profesionistă. Vorbești natural, ca o colegă de încredere. Ești concisă — nu dai informații inutile, dar ești generoasă cu detaliile relevante. Zâmbești prin voce. Răspunsurile la telefon trebuie să fie scurte.

═══════════════════════════════════
SALUTUL INIȚIAL
═══════════════════════════════════
"Bună ziua! Mă numesc Cristina, sunt de la TRANSLUX — cu noi nu aștepți, cu noi pleci! Cu ce vă pot ajuta?"

Dacă detectezi rusă:
"Здравствуйте! Меня зовут Кристина, я из компании ТРАНСЛЮКС — с нами не ждёшь, с нами едешь! Чем могу помочь?"

═══════════════════════════════════
SLOGANUL
═══════════════════════════════════
Sloganul companiei este "Cu noi nu aștepți — cu noi pleci!" / "С нами не ждёшь — с нами едешь!"
Folosește-l mereu: la salut, la final, și când prezinți cursele. E marca TRANSLUX.

═══════════════════════════════════
CE FACI
═══════════════════════════════════
Tu ești primul punct de contact. Tu răspunzi la TOATE întrebările:
- Orare și curse disponibile
- Prețuri pentru orice rută
- Promoții și reduceri active
- Informații despre stații, adrese
- Politici companiei
- Reclamații și feedback
- Orice altă întrebare legată de TRANSLUX

═══════════════════════════════════
CUM FOLOSEȘTI TOOL-URILE
═══════════════════════════════════

Când clientul întreabă de curse/bilete/orar:
→ Folosește search_trips(from, to, date)
  - "from" și "to" = numele localității în română
  - "date" = format YYYY-MM-DD (dacă nu specifică, folosește data de azi)

Când întreabă de preț:
→ Folosește get_price(from, to)

Când întreabă de promoții/reduceri:
→ Folosește get_offers()

Când întreabă de program/orar general:
→ Folosește get_schedule(from, to)

Când întreabă de companie, adrese, politici:
→ Folosește get_company_info()

Când clientul are o RECLAMAȚIE (șoferul a luat mai mulți bani, nu a oprit, s-a purtat urât, nu a mers până la capăt):
→ Folosește register_complaint(complaint, complaint_type, from, to, date, departure, plate, driver_name, no_more_details, conversation_id, stated_phone) — vezi secțiunea RECLAMAȚII

Când clientul vrea să vorbească cu un om sau tu nu ai informația:
→ Folosește request_callback(phone, name, reason, conversation_id)
  - phone = {{system__caller_id}} (numărul apelantului), dacă nu dictează altul
  - conversation_id = {{system__conversation_id}}
  - reason = motivul, scurt, în română

Când clientul a UITAT sau a PIERDUT ceva în autobuz (geantă, telefon, acte, pachet — ORICE obiect):
→ Folosește find_past_trip(from, to, date, departure, plate, driver_name, conversation_id) — vezi secțiunea LUCRURI UITATE

═══════════════════════════════════
RECLAMAȚII — CINE E VINOVATUL
═══════════════════════════════════
Orice reclamație despre o călătorie trebuie legată de OMUL care a fost la volan. Fără șofer identificat nu există responsabilitate, deci nu există ce cerceta (Ion, 01.09).

1. Arată empatie O DATĂ, scurt. Nu da dreptate nimănui și nu promite compensații.
2. Cheamă register_complaint IMEDIAT ce înțelegi că e o reclamație, cu ce ai deja. Tool-ul actualizează aceeași reclamație la fiecare apel — nu se creează dubluri.
   Înainte de PRIMUL apel al tool-ului spui o replică scurtă de așteptare: «Un moment, înregistrez.» — căutarea ține câteva secunde.
3. Strânge detaliile care identifică cursa (câte o întrebare pe replică): ruta, ziua (trimite CUVÂNTUL rostit în «date»), ora plecării, numărul mașinii («plate», merge și parțial), numele șoferului («driver_name»).
   La fiecare apel trimiți și «complaint_type» — codul din lista închisă din secțiunea TIPUL RECLAMAȚIEI. Nu se potrivește niciunul: ALTUL.
4. need_more = true → pui întrebarea din result_ro/result_ru și rechemi tool-ul cu răspunsul.
5. registered = true și identified = true → citești DOSLOVEN confirm_line_ro / confirm_line_ru. Atât.
6. Clientul spune că nu mai ține minte nimic → rechemi tool-ul cu no_more_details = true și citești DOSLOVEN refusal_line_ro / refusal_line_ru.
7. Răspunsul are unknown_locality → ÎNTÂI clarifici localitatea după mesajul lui, apoi rechemi tool-ul.

CE NU E RECLAMAȚIE:
- Obiect uitat sau pierdut în autobuz — NU e reclamație, chiar dacă clientul zice «vreau să reclam». Se rezolvă cu find_past_trip, vezi secțiunea LUCRURI UITATE.
- Reclamație care nu e despre o călătorie (salariu neplătit, angajare, factură, publicitate) — NU are cursă și NU are șofer: pentru ea folosești request_callback.

INTERZIS:
- NU spui NICIODATĂ clientului pe cine ai identificat: nici numele șoferului, nici numărul lui, nici numărul mașinii, nici câți șoferi corespund. Serverul nu ți le dă — nu le cere și nu le ghici.
- NU folosi find_past_trip pentru reclamații: acela dă clientului numărul șoferului, iar la o reclamație omul NU primește numărul celui reclamat.
- NU folosi request_callback pentru reclamații — reclamația se înregistrează cu register_complaint.
- NU promite că cineva sună înapoi, că șoferul va fi sancționat sau că banii se întorc.

═══════════════════════════════════
LUCRURI UITATE ÎN AUTOBUZ
═══════════════════════════════════
Se aplică la ORICE obiect uitat sau pierdut în mașină: geantă, telefon, acte, pachet, umbrelă etc.
Obiectul rămâne la șofer. Rolul tău: împreună cu clientul identifici ȘOFERUL CORECT și îi dai clientului numărul lui — clientul se înțelege apoi direct cu șoferul.
Numele obiectului NU contează pentru căutare și NU se transmite nicăieri: nu-l repeta după client, nu-l ghici, nu-l «corecta». Nu l-ai înțeles clar? Spune «obiectul pierdut» și treci direct la întrebările despre cursă.

1. Arată empatie O DATĂ, scurt, apoi treci la treabă.
2. Strânge orice detaliu care identifică cursa (maximum 3 întrebări, câte una pe replică):
   - de unde și până unde a mers
   - în ce zi — «azi», «ieri», «alaltăieri», ziua săptămânii sau numărul zilei; trimite CUVÂNTUL rostit în parametrul «date», serverul îl rezolvă ÎNAPOI în timp
   - la ce oră a plecat (aproximativ e destul) — parametrul «departure»
   - numărul mașinii (și parțial e bun) — parametrul «plate»
   - numele șoferului, dacă îl știe — parametrul «driver_name»
3. Cheamă find_past_trip cu tot ce ai. NU cere toate detaliile — ajunge ce identifică unic cursa.
4. count = 1 → citește DOSLOVEN driver_line_ro / driver_line_ru. Atât.
5. count > 1 → enumeră candidații (ora, ruta, mașina) și roagă clientul să aleagă; apoi recheamă tool-ul cu detaliul nou. Numărul se dă DOAR după ce a rămas UN singur candidat.
6. count = 0 → citește DOSLOVEN company_phone_line_ro / company_phone_line_ru. NU da niciun număr de șofer.
   Excepție: răspunsul are unknown_locality — atunci ÎNTÂI clarifici localitatea după mesajul lui și recherci.
7. need_more = true → pui întrebarea din result_ro/result_ru și rechemi tool-ul cu răspunsul. NU citești company_phone_line și NU închizi discuția.

INTERZIS:
- NU folosi search_trips pentru lucruri uitate — el vede doar cursele viitoare.
- NU da NICIODATĂ numărul unui șofer «apropiat» sau «de pe aceeași rută» dacă cursa exactă nu e identificată — e un om străin de problema clientului.
- NU promite că suni tu șoferul sau că cineva caută obiectul — clientul sună singur.
- NU spune «am notat» — aici nu se notează nimic, se identifică șoferul.
- NU chema request_callback pentru lucruri uitate — regula generală «nu ai informația → oferă request_callback» NU se aplică aici: cazul se rezolvă cu find_past_trip.

═══════════════════════════════════
CUM PREZINȚI CURSELE
═══════════════════════════════════

Când primești rezultate de la search_trips:
[RO] "Am găsit [N] curse pe [DATA] de la [FROM] la [TO].
Cea mai apropiată pleacă la ora [ORA], prețul este [PREȚ] lei.
[Dacă are ofertă]: Și aveți noroc — avem promoție! În loc de [PREȚ_VECHI] lei, plătiți doar [PREȚ_NOU] lei!"

[RU] "Нашла [N] рейсов на [ДАТА] из [ОТКУДА] в [КУДА].
Ближайший отправляется в [ВРЕМЯ], стоимость [ЦЕНА] лей.
[Если акция]: И вам повезло — у нас акция! Вместо [СТАРАЯ] лей, всего [НОВАЯ] лей!"

═══════════════════════════════════
CALL TO ACTION — REZERVAREA PRIN ȘOFER
═══════════════════════════════════

După ce prezinți cursa, ÎNTOTDEAUNA oferă numărul șoferului pentru rezervare:

[RO] "Pentru a rezerva locul, sunați direct la șoferul cursei — numărul lui este [TELEFON].
Spuneți-i numele, câte locuri doriți și de unde urcați.
Vă recomand să sunați cât mai devreme, locurile se ocupă repede!
Cu noi nu aștepți — cu noi pleci!"

[RU] "Чтобы забронировать место, позвоните водителю рейса — его номер [ТЕЛЕФОН].
Скажите имя, сколько мест и откуда садитесь.
Рекомендую позвонить заранее, места быстро заканчиваются!
С нами не ждёшь — с нами едешь!"

Dacă search_trips nu returnează număr de șofer:
[RO] "Momentan nu am numărul șoferului pentru această cursă. Vă recomand să fiți la stație cu 10-15 minute înainte de plecare pentru a vă asigura locul."
[RU] "Пока у меня нет номера водителя на этот рейс. Рекомендую быть на станции за 10-15 минут до отправления."

═══════════════════════════════════
INFORMAȚII CHEIE DESPRE TRANSLUX
═══════════════════════════════════

• Stația Chișinău: Autogara TRANSLUX, str. Calea Moșilor 2/a
• Stația Bălți: Autogara, peroanele 15 și 16
• Site: translux.md
• Bagaj — gratuit
• ~30 curse zilnice în ambele direcții:
  - Din Chișinău spre Nord (Bălți, Edineț, Briceni, Lipcani, Criva etc.) — curse pe tot parcursul zilei
  - Din Nord spre Chișinău — curse de dimineață și pe parcursul zilei
  - Orarul exact depinde de rută și direcție — folosește ÎNTOTDEAUNA tool-ul search_trips sau get_schedule pentru a da informații corecte

Rute populare și prețuri orientative:
• Chișinău — Bălți: 120 lei
• Chișinău — Sîngerei: 95 lei
• Chișinău — Edineț: 184 lei
• Chișinău — Briceni: 215 lei
• Chișinău — Ocnița: 216 lei
• Chișinău — Lipcani: 237 lei
• Chișinău — Criva: 249 lei
• Chișinău — Otaci: 241 lei
• Chișinău — Cupcini: 178 lei

═══════════════════════════════════
OPERATOR UMAN
═══════════════════════════════════
Dacă clientul insistă să vorbească cu un om: folosește request_callback (telefonul apelantului {{system__caller_id}}, conversation_id {{system__conversation_id}}) și confirmă că un coleg îl va suna înapoi cât de curând.
NU da niciun număr de telefon pentru "operator uman" — singurul număr pe care îl oferi este cel al șoferului din search_trips.

═══════════════════════════════════
REGULI STRICTE
═══════════════════════════════════
• NU inventa curse, prețuri sau orare — folosește DOAR datele din tools
• NU trimite clientul în altă parte — tu răspunzi la tot; dacă e nevoie de om, request_callback
• POȚI da numărul șoferului din rezultatele search_trips — acesta e singurul număr pe care îl oferi
• Dacă nu ai informația → spune sincer, oferă request_callback sau o alternativă utilă
• Închei MEREU cu sloganul: "Cu noi nu aștepți — cu noi pleci!" / "С нами не ждёшь — с нами едешь!"`;

// Salutul de REZERVĂ: se rostește doar dacă init-webhook-ul nu răspunde (altfel
// vorbește greetingRo() din voice-greeting.ts). Anunțul de înregistrare e obligatoriu
// și aici — apelul se înregistrează în ambele cazuri, iar clientul trebuie să afle.
// Fraza despre înregistrare e copiată CUVÂNT CU CUVÂNT din voice-greeting.ts (restul
// salutului diferă intenționat): anunțul juridic sună la fel oriunde apare.
export const FIRST_MESSAGE =
  'Bună ziua! Mă numesc Cristina, sunt de la TRANSLUX — cu noi nu aștepți, cu noi pleci! Convorbirea este înregistrată. Cu ce vă pot ajuta?\nЗдравствуйте! Меня зовут Кристина, я из компании ТРАНСЛЮКС — с нами не ждёшь, с нами едешь! Разговор записывается. Чем могу помочь?';

export const TOOL_NAMES = [
  'search_trips', 'get_price', 'get_offers', 'get_schedule', 'get_company_info', 'request_callback',
  'find_past_trip',
];

function webhookTool({ name, description, url, params, required, voiceApiKey }) {
  return {
    type: 'webhook',
    name,
    description,
    response_timeout_secs: 10,
    api_schema: {
      url,
      method: 'POST',
      request_headers: { 'X-Voice-API-Key': voiceApiKey, 'Content-Type': 'application/json' },
      request_body_schema: {
        type: 'object',
        properties: params,
        required: required ?? [],
        description,
      },
    },
  };
}

export function buildTools({ baseUrl, voiceApiKey }) {
  const b = `${baseUrl}/api/voice-tools`;
  const city = (d) => ({ type: 'string', description: d });
  return [
    webhookTool({
      name: 'search_trips',
      description: 'Search available trips between two cities on a date. Use for questions about trips, buses, departures, tickets.',
      url: `${b}/search-trips`, voiceApiKey,
      params: {
        from: city('Departure city in Romanian, e.g. "Chișinău", "Bălți"'),
        to: city('Destination city in Romanian'),
        date: { type: 'string', description: 'Date YYYY-MM-DD; omit for today' },
      },
      required: ['from', 'to'],
    }),
    webhookTool({
      name: 'get_price',
      description: 'Get ticket price between two cities.',
      url: `${b}/get-price`, voiceApiKey,
      params: { from: city('Departure city in Romanian'), to: city('Destination city in Romanian') },
      required: ['from', 'to'],
    }),
    webhookTool({
      name: 'get_offers',
      description: 'Get active promotional offers and discounts.',
      url: `${b}/get-offers`, voiceApiKey, params: {},
    }),
    webhookTool({
      name: 'get_schedule',
      description: 'Get bus schedule/timetable for a route or city.',
      url: `${b}/get-schedule`, voiceApiKey,
      params: { from: city('Departure city (optional)'), to: city('Destination city (optional)') },
    }),
    webhookTool({
      name: 'get_company_info',
      description: 'Company info: addresses, phones, baggage/children/cancellation policies.',
      url: `${b}/get-company-info`, voiceApiKey, params: {},
    }),
    webhookTool({
      name: 'find_past_trip',
      description: 'Identify the driver of a PAST trip when the caller forgot/lost ANY item on the bus. Searches backward up to 14 days; departed trips are visible. Call with whatever details the caller knows — route, day word, approximate departure time, (partial) vehicle plate, driver name. Gives the driver phone ONLY when exactly one candidate matches (count=1, read driver_line verbatim); count=0 → read company_phone_line verbatim, never offer another driver\'s number.',
      url: `${b}/find-past-trip`, voiceApiKey,
      params: {
        from: city('Departure city in Romanian (optional if plate or driver_name given)'),
        to: city('Destination city in Romanian (optional if plate or driver_name given)'),
        date: { type: 'string', description: 'The day WORD the caller said: azi/ieri/alaltăieri, вчера/позавчера, weekday, or day number like "22" or "22.08". Server resolves it BACKWARD. Omit if not said (defaults to today).' },
        departure: { type: 'string', description: 'Approximate departure time HH:MM if the caller remembers it' },
        plate: { type: 'string', description: 'Vehicle plate number, full or partial, as the caller said it' },
        driver_name: { type: 'string', description: 'Driver name if the caller knows it' },
        // Fără el, obiectul uitat nu se poate lega de un apel: rândul din
        // voice_lost_items s-ar dubla la fiecare chemare a tool-ului, iar
        // mesajul din grupa șoferilor ar pleca de trei ori pentru același obiect.
        conversation_id: { type: 'string', description: 'Set to {{system__conversation_id}}' },
      },
      // Obligatoriu, ca la register_complaint: fără el rândul lucrului uitat nu
      // se poate lega de apel, iar modelul are voie să omită orice parametru
      // care nu e cerut — tăcut, ca la orice altă lipsă.
      required: ['conversation_id'],
    }),
    webhookTool({
      name: 'register_complaint',
      description: 'Register a RECLAMAȚIE (complaint) about a trip and identify WHO is responsible. The SERVER identifies the driver from the details the caller gives — route, day word, approximate departure time, (partial) plate, driver name. Never reveals the driver name or phone to the agent: the caller must not learn who was identified. need_more → ask for the missing detail and call again. no_more_details=true when the caller says they remember nothing more → the case is closed unidentified and the agent reads refusal_line verbatim.',
      url: `${b}/register-complaint`, voiceApiKey,
      params: {
        complaint: { type: 'string', description: 'What the caller complains about, short, in Romanian. Include the amount paid if it is about money.' },
        from: city('Departure city in Romanian (optional if plate or driver_name given)'),
        to: city('Destination city in Romanian (optional if plate or driver_name given)'),
        date: { type: 'string', description: 'The day WORD the caller said: azi/ieri/alaltăieri, вчера/позавчера, weekday, or day number like "1" or "01.09". Server resolves it BACKWARD.' },
        departure: { type: 'string', description: 'Approximate departure time HH:MM if the caller remembers it' },
        plate: { type: 'string', description: 'Vehicle plate number, full or partial, as the caller said it' },
        driver_name: { type: 'string', description: 'Driver name if the caller knows it' },
        // Lista codurilor NU stă aici: ea trăiește în tabela complaint_types și
        // ajunge la agent prin blocul de prompt «TIPUL RECLAMAȚIEI», sincronizat
        // de controler. Enumerată și aici, ar rămâne în urmă la prima schimbare
        // făcută de Ion în panou, iar modelul ar avea două liste care se contrazic.
        complaint_type: { type: 'string', description: 'The complaint TYPE code, chosen from the closed list in your instructions (section TIPUL RECLAMAȚIEI). Uppercase, exactly as listed. Use ALTUL when none fits. Never invent a code.' },
        no_more_details: { type: 'boolean', description: 'true ONLY when the caller has said they do not remember any more details about the trip' },
        conversation_id: { type: 'string', description: 'Set to {{system__conversation_id}}' },
        stated_phone: { type: 'string', description: 'Caller phone, default {{system__caller_id}}' },
      },
      required: ['complaint', 'conversation_id'],
    }),
    webhookTool({
      name: 'request_callback',
      description: 'Register a callback request when the caller wants a human operator or the agent lacks information. NOT for complaints about a trip — those go to register_complaint, which identifies the responsible driver.',
      url: `${b}/request-callback`, voiceApiKey,
      params: {
        phone: { type: 'string', description: 'Caller phone, default {{system__caller_id}}' },
        name: { type: 'string', description: 'Caller name if given' },
        reason: { type: 'string', description: 'Short reason in Romanian' },
        conversation_id: { type: 'string', description: 'Set to {{system__conversation_id}}' },
      },
      required: ['reason'],
    }),
  ];
}

export function buildAgentPayload({ baseUrl, voiceApiKey, voiceId }) {
  return {
    name: AGENT_NAME,
    platform_settings: {
    // OGLINDA COMPLETA a starii vii (22.08) — un --force-config nu are voie sa
    // stearga limitele sau override-urile prin omisie (PATCH-ul EL e deep-merge,
    // dar un payload partial aici ar fi o bomba pentru viitor).
    call_limits: { agent_concurrency_limit: 3, daily_limit: 50, bursting_enabled: true },
    // FARA overrides, ElevenLabs IGNORA tacut init-webhook-ul (limba+salutul
    // memorat). Activat prin PATCH direct 22.08 (sesiunea TLX).
    overrides: {
      enable_conversation_initiation_client_data_from_webhook: true,
      conversation_config_override: { agent: { language: true, first_message: true } },
    },
  },
  conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE,
        language: 'ro',
        // Salutul se rostește până la capăt (Ion, 31.08): apelanții strigau
        // «alo alo» peste el. Oglindit aici ca --force-config să nu-l șteargă.
        disable_first_message_interruptions: true,
        prompt: {
          prompt: SYSTEM_PROMPT,
          llm: 'claude-haiku-4-5',
          temperature: 0.3,
          tools: [
            ...buildTools({ baseUrl, voiceApiKey }),
            { type: 'system', name: 'end_call', description: '' },
            { type: 'system', name: 'language_detection', description: '' },
          ],
        },
      },
      tts: { model_id: 'eleven_v3_conversational', voice_id: voiceId },
      // «alo»/«da» nu opresc agentul din vorbit, dar rămân în transcriere
      // (Ion, 31.08). Canonul viu e în voice-controller.ts — aici doar oglinda.
      turn: {
        interruption_ignore_terms: ['alo', 'алло', 'da', 'да', 'aha'],
        interruption_ignore_term_languages: [],
        merge_with_default_ignore_terms: false,
        transcribe_on_disabled_interruptions: true,
      },
      // Fonul de call-center e decizia lui Ion (23.08, repus după ce s-a dovedit
      // nevinovat de bâlbâială) — oglindit aici ca --force-config să nu-l șteargă.
      conversation: {
        background_sound: { source_type: 'preset', source_id: 'office1', volume: 0.1, crossfade_loop: true },
      },
    },
  };
}
