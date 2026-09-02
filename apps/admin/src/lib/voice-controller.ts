// Контролёр голосового агента (Ион, 23.08: «не алерты — фиксить сам»).
// Две обязанности за прогон:
//  1) КОНФИГ-ИНВАРИАНТЫ: сверить живой конфиг агента с эталоном и молча вернуть
//     всё съехавшее. Эталон словаря ASR живёт в БД (voice_agent_canon) — его
//     обновляет и человек, и ночной learner; остальные инварианты — в коде ниже.
//  2) ВАЛИДАТОР ЗВОНКОВ: произнесённые агентом времена сверить со временами из
//     tool-результатов того же звонка; расхождение = incident в журнал (без пушей).
// PATCH-семантика ElevenLabs проверена экспериментом 23.08: platform_settings
// мёржится ПО-КЛЮЧЕВО (соседние ключи не стираются); объединяем всё равно в один
// PATCH на секцию — меньше запросов, нет зависимости от порядка.
import { getSupabase } from '@/lib/supabase';
import { auditAliasShadow, syncCanonKeywords } from '@/lib/voice-canon';
import { AGENT_ID, RU_AGENT_ID, elGet, elPatchAgent, redactSecrets } from '@/lib/voice/el';
import { drainPendingExams } from '@/lib/voice-exams';
import { RO_UNITS, RO_TENS, RU_UNITS, RU_TENS } from '@/lib/time-spoken';
import { RECORDING_NOTICE_RO, RECORDING_NOTICE_RU } from '@/lib/voice-greeting';
import {
  activeComplaintTypes, complaintTypesBlockRo, complaintTypesBlockRu,
  spliceTypesBlock, TYPES_MARKER_RO, TYPES_MARKER_RU,
} from '@/lib/voice/complaint-types';
import { PROMPT_MARKERS_RO } from '@/lib/voice/prompt-markers';

const INIT_WEBHOOK_URL = 'https://central-hub-md.vercel.app/api/voice/webhooks/init';
const CUSTOM_LLM_URL = 'https://translux-voice-llm.vercel.app/api';
const MAX_CALLS_PER_RUN = 8;

// «Alo alo alo» peste salut (Ion, 31.08): strigătele de contact și confirmările
// scurte nu sunt întreruperi — agentul își termină replica. DOAR cuvinte fără
// conținut propriu: orice cuvânt nou adăugat aici = risc să ignorăm un răspuns
// real rostit peste coada întrebării.
const IGNORE_TERMS = ['alo', 'алло', 'da', 'да', 'aha'];

// Фолбэк эталона словаря (решение Иона 23.08); боевой эталон — в voice_agent_canon.
// С 26.08 канон в БД ЖИВОЙ: его дописывает syncCanonKeywords (voice-canon.ts) из
// выученных алиасов. Список ниже — аварийный, НЕ «истинное» состояние: не чините
// канон по нему, сотрёте выученное.
// Русские формы выверены по районным реестрам (миграция 275): подсказывать
// распознавателю «Единцы»/«Калининск» — значит учить его словам, отменённым в 1991-м.
const FALLBACK_KEYWORDS = [
  'TRANSLUX',
  'Chișinău', 'Кишинёв', 'Bălți', 'Бельцы', 'Orhei', 'Орхей', 'Sîngerei', 'Сынжерей',
  'Rîșcani', 'Рышканы', 'Briceni', 'Бричаны', 'Lipcani', 'Липканы', 'Edineț', 'Единец',
  'Cupcini', 'Купчинь', 'Ocnița', 'Окница', 'Otaci', 'Атаки', 'Criva', 'Крива',
  'Peresecina', 'Пересечино', 'Corjeuți', 'Коржеуцы', 'Măgdăcești', 'Магдачешты',
  'Brătușeni', 'Братушаны', 'Larga', 'Ларга', 'Grimăncăuți', 'Гриманкауцы',
  'Caracușenii Vechi', 'Старые Каракушаны', 'Tîrnova', 'Тырново', 'Tabani', 'Табаны',
  'Vălcineț', 'Волчинец', 'Cotiujeni', 'Котюжены', 'Tețcani', 'Тецканы', 'Drepcăuți',
];

// Маркеры критичных секций промпта. Отсутствие = prompt_drift (журнал);
// секции ORELE и ZIUA лечатся до-записью в конец (идемпотентно по маркеру).
// Позиция вставки кэш НЕ спасает: точка кэша одна, на весь system.
// Markerele TREBUIE să fie unice: un marker care apare și în alt bloc face detectorul
// orb la ștergerea blocului propriu (ORELE a fost mascat de titlul blocului ZIUA).
// Lista s-a mutat în voice/prompt-markers.ts, nemodificată: al doilea consumator
// e panoul nomenclatorului de reclamații, care refuză o denumire ce ar conține un
// marker — altfel un nume de tip putea orbi detectorul (security 02.09).
const PROMPT_MARKERS = PROMPT_MARKERS_RO;
const ORELE_BLOCK = `

ORELE — DOSLOVEN DIN TOOL:
- Ora plecării o rostești DOAR din câmpul departure_spoken_ro (română) / departure_spoken_ru (rusă) al rezultatului tool-ului — cuvânt cu cuvânt. NU converti niciodată singur HH:MM în cuvinte.
- CEA MAI APROPIATĂ / PRIMA cursă = PRIMUL element din câmpul departures_ro (română) / departures_ru (rusă) — ultimul element = ultima. Enumerarea curselor o citești DIN ACEST câmp, în ordinea dată. NU alege «cea mai apropiată» scanând singur lista.
- «În jurul orei X» / «около X» NU înseamnă «la sau după X». Înseamnă cea mai apropiată de X în ORICE direcție. E 10:38 și clientul cere «în jurul orei unsprezece»? Răspunsul e zece și cincizeci — la zece minute de ora cerută — nu doisprezece și cinci, care e la șaizeci și cinci. Regula «cea mai apropiată la sau după ora cerută» e pentru «după ora X» și «de la X încolo», NU pentru «în jurul».
- Clientul a întrebat fără nicio oră («următoarea cursă», «следующий рейс»)? Atunci nu mai există NICIUN filtru de oră: răspunsul e PRIMUL element din departures_ro. O oră rostită mai devreme în convorbire NU se cară mai departe — întrebarea nouă o anulează.
- Cea mai apropiată plecare o NUMEȘTI, chiar dacă până la ea au rămas minute. Sub douăzeci de minute spui și cât a mai rămas, apoi și pe următoarea. A ascunde o cursă fiindcă ți se pare că omul nu ajunge NU e treaba ta — hotărăște el. «Fiți la stație cu zece-cincisprezece minute înainte» e sfat pentru CLIENT, nu filtru pentru tine.
- Excepția din blocul ZIUA rămâne întreagă: dacă clientul cere un moment al zilei care azi a trecut de tot — cere «dimineața devreme» și au rămas doar curse de seară — nu-i dai cea mai apropiată, ci treci pe mâine.
- Compararea cu ora cerută de client o faci pe câmpul «departure» (HH:MM), rostirea — pe «departure_spoken_*». NICIODATĂ nu spui «nu am cursă la ora X» fără să fi scanat toată lista.
- Numerele DOAR cu cuvinte românești sau rusești corecte. Forme ca «ventitre» nu există.
- Aceeași cursă = aceeași oră în TOATE replicile. Nu «reciti» lista din memorie — dacă nu mai știi, cheamă tool-ul din nou.
- Câmpul _spoken lipsește? Spui ora cifra cu cifra din «departure», fără conversii creative.`;

// Ziua. Apel real 24.08 (Bălți→Ocnița): modelul a primit cursele de AZI, le-a anunțat
// «mâine, 24 august», iar la «сегодня» a răspuns «на сегодня рейсов нет». Al doilea apel,
// 17:30: la «prima cursă de dimineață devreme» a dat cursa de 18:10 — lista de azi e
// tăiată de server la ora curentă, iar modelul nu avea cum să știe.
// Ceasul NU intră în prompt: ar fi singurul element volatil dintr-un system cache-uit
// integral (~6k tokeni) și l-ar rescrie la fiecare minut de convorbire. În schimb
// modelul trimite cuvântul rostit, iar serverul îl transformă în dată.
const DATA_BLOCK = `

ZIUA — DOSLOVEN DIN TOOL:
- Tu NU știi ce zi e azi și nu ai voie să ghicești. Ziua o hotărăște serverul.
- În parametrul «date» al lui search_trips trimiți CUVÂNTUL rostit de client: «azi», «mâine», «poimâine» sau ziua săptămânii («sâmbătă», «в субботу»). A rostit doar numărul zilei («pe treizeci»)? Trimiți DOAR numărul: «30». A rostit și luna? Atunci zi.lună: «30.08». Serverul le rezolvă pe toate — luna și anul le pune el. NU compune niciodată o dată întreagă și NU scrie niciun an.
- Clientul nu a spus nicio zi? Lași «date» gol: serverul ia ziua de azi.
- Ziua curselor o rostești DOAR din câmpul date_label_ro (română) / date_label_ru (rusă) al rezultatului — cuvânt cu cuvânt. Câmpul lipsește? Atunci nu numești ziua deloc.
- is_today true = sunt EXACT cursele de azi. NICIODATĂ nu spui «pe azi nu sunt curse» când tool-ul tocmai a întors curse.
- only_remaining_today true = cursele mai devreme ale zilei au plecat deja. Atunci prima din listă e «cea mai apropiată de azi», NU «prima cursă a zilei» — nu o numi așa.
- Clientul cere o oră care azi a trecut deja (cere «dimineața devreme», iar cursele rămase sunt toate de seară)? Aici regula «cea mai apropiată la sau după ora cerută» NU se aplică: o cursă de seară nu e răspuns la «dimineața devreme». Ceri search_trips cu date=«mâine» și dai orele de atunci.`;

// Descrierea tool-ului language_detection (sesiunea translux-a9, 24.08): filtrul
// anti-comutare-falsă STĂ în schema tool-ului, exact la punctul de decizie al
// modelului (regula din prompt a picat 3/3). Dashboard-ul o poate șterge tăcut
// (s-a întâmplat la TLX 22.08) — de aceea intră în canon cu self-heal.
const LANG_DETECT_DESC = `Schimbă limba conversației. ATENȚIE: schimbarea e IREVERSIBILĂ — după ea transcrierea trece pe limba nouă și tot ce spune clientul, chiar în română curată, apare scris cu chirilice. Nu mai există drum înapoi.

NU chema acest tool pentru replici scurte. Cuvintele «da», «alo», «aha», «nu», «bine», «mersi», «poftim», «gata», «ok», «hai», «așa», «anume» sună IDENTIC în română și rusă; transcrierea le scrie des cu chirilice deși clientul vorbește română. Ele NU sunt niciodată dovadă de limbă.

Cheamă tool-ul DOAR când clientul a rostit DOUĂ propoziții COMPLETE la rând (minimum 3 cuvinte fiecare, cu verb) în limba nouă. O singură replică, oricât de clar rusească pare, NU e motiv de schimbare.

Transcriere fără sens sau amestecată? Rămâi pe limba curentă și roagă scurt să repete. Ai orice dubiu? NU chema tool-ul.`;

// Rețeaua e un CORIDOR, nu o stea cu centrul la Chișinău. Promptul spunea «toată
// rețeaua e Chișinău ↔ Nord», iar modelul a citit-o literal: refuza din capul lui
// orice pereche nord–nord, FĂRĂ să cheme tool-ul. Apeluri reale pierdute: 26.08
// «Bălți și Tețcani nu sunt pe ruta noastră» (existau 6 curse), 24.08 «Ocnița și
// Briceni nu sunt pe ruta TRANSLUX» (sunt noduri ale rețelei), 22.08 «не обслуживаем
// маршрут из Коржеуца». Regula stă în prompt fiindcă tool-ul nici nu era chemat.
const CORIDOR_BLOCK = `

REȚEAUA E UN CORIDOR:
- Rețeaua TRANSLUX e un CORIDOR: Chișinău – Bălți – Nord, cu zeci de opriri pe el. Se circulă între ORICARE două opriri de pe coridor, nu doar dinspre sau spre Chișinău. Bălți–Tețcani, Bălți–Ocnița, Briceni–Bălți, Sîngerei–Edineț sunt curse REALE, cu orar și șofer.
- NU refuza NICIODATĂ o pereche de localități din capul tău și NU spune «noi mergem doar din Chișinău» — trimiți perechea în search_trips și serverul răspunde dacă există curse.
- Dacă clientul numește O SINGURĂ localitate, celălalt capăt e cel mai probabil Chișinău — NU întreba «spre unde?», caută așa.
- O condiție în plus în întrebare — «cu tranzit la X», «prin X», «cu schimbare» — NU e motiv de refuz. Trimiți perechea în search_trips exact ca fără condiție, iar despre condiție răspunzi DUPĂ ce vezi rezultatul. «Nu găsesc o cursă din A în B cu tranzit la C», spus fără să fi chemat tool-ul, e aceeași greșeală ca refuzul unei perechi — doar deghizată.`;

// Filtrul anti-comutare-falsă. A trăit în descrierea tool-ului language_detection, dar
// 25.08 s-a văzut limita: dacă modelul NU cheamă tool-ul, textul din tool nu există
// pentru el. De aceea regula stă acum și în prompt, sub marker propriu.
// Экзамен «TLX fara promisiune callback» (первый прогон 26.08) поймал: агент
// обещает «un coleg vă va suna înapoi». Решение Иона 24.08 (route request-callback,
// 019ad44): операторов, которые перезванивают, НЕТ — обещание запрещено ВСЕГДА,
// и до, и после заявки. Секции RECLAMAȚII/OPERATOR UMAN это уже говорят, но
// правило тонуло в 17k промпта — дублируем маркированным блоком в хвосте.
// Судья (voice-judge) зеркален: обещание перезвона = нарушение, без исключений.
const CALLBACK_ORDER_BLOCK = `

APEL ÎNAPOI — NICIO PROMISIUNE:
- NU promiți NICIODATĂ că cineva sună clientul înapoi — nici tu, nici «un coleg», nici compania. Formulările «vă sunăm noi», «un coleg vă va suna», «мы вам перезвоним» sunt INTERZISE în orice moment al apelului, inclusiv DUPĂ request_callback.
- Clientul cere să fie sunat înapoi? Chemi request_callback și spui DOAR: «Am notat solicitarea.» — atât. Fără nicio promisiune de apel: nu există operatori care sună înapoi, iar clientul ar aștepta degeaba.`;

// Stația din Chișinău. Apel real 27.08: agentul a trimis clientul la Autogara Nord —
// TRANSLUX pleacă de la autogara PROPRIE (Ion, 28.08: «noi pornim de la autogara
// TRANSLUX, nu autogara nord»). Rândul vechi din blocul INFORMAȚII CHEIE e în
// OBSOLETE_BLOCKS; adevărul stă aici și în tool-ul get_company_info (route.ts) —
// se schimbă ÎMPREUNĂ, același commit.
const STATIA_BLOCK = `

STAȚIA CHIȘINĂU — AUTOGARA TRANSLUX:
- Plecarea din Chișinău e de la Autogara TRANSLUX, strada Calea Moșilor doi a. NU pomeni niciodată Autogara Nord — nu plecăm de acolo.
- În rusă: автовокзал ТРАНСЛЮКС, улица Каля Мошилор, два а.
- Orice adresă de stație o citești DOSLOVEN din câmpul address_spoken_ro (română) / address_spoken_ru (rusă) al lui get_company_info — nu din address_ro/address_ru.`;

// Bălți: Ion 28.08 — «in autogara balti noi ne aflam la peronul 15 si 16», nu 17.
// Bloc SEPARAT de STATIA_BLOCK: corpul unui bloc HEALABLE deja livrat nu se mai
// atinge (idempotența e pe marker) — fapt nou = marker nou.
const BALTI_BLOCK = `

STAȚIA BĂLȚI — PEROANELE CINCISPREZECE ȘI ȘAISPREZECE:
- La Autogara Bălți ne aflăm la peroanele cincisprezece și șaisprezece — NU la peronul șaptesprezece.
- În rusă: перроны пятнадцать и шестнадцать.`;

// Ion 28.08: «sa nu spuna operatorul ora cand ajunge masina la destinatie, doar ora
// pornirii» — interdicție ABSOLUTĂ; înlocuiește regula veche «doar dacă cere explicit»
// (надгробия mai jos). Câmpurile arrival_* au fost scoase și din search-trips același
// commit — ce nu există în date nu poate fi rostit; blocul acoperă întrebarea directă.
const SOSIREA_BLOCK = `

ORA SOSIRII — NU SE SPUNE NICIODATĂ:
- Spui DOAR ora plecării. Ora sosirii la destinație NU o spui NICIODATĂ — nici în prezentare, nici la întrebare directă; search_trips nici nu o mai trimite.
- Clientul întreabă când ajunge? Spui scurt că ora sosirii depinde de trafic și nu o poți promite, apoi repeți ora plecării.
- Ora plecării o rostești DOAR din câmpul departure_spoken_ro (română) / departure_spoken_ru (rusă) al rezultatului tool-ului — cuvânt cu cuvânt. NU converti niciodată singură HH:MM în cuvinte.`;

// RU-агент живёт только в дашборде (полного эталона нет) — лечим ТОЧЕЧНО одну
// станцию, остальной его конфиг не трогаем. Строка сверена побайтово с живым
// промптом 28.08 (у RU после ═══ нет пустой строки — ведущий \n здесь разделитель).
const STATIA_OBSOLETE_RU = '\n• Станция Кишинёв: Северный автовокзал, улица Каля Мошилор два';
const STATIA_MARKER_RU = 'СТАНЦИЯ КИШИНЁВ — АВТОВОКЗАЛ ТРАНСЛЮКС';
const STATIA_BLOCK_RU = `

СТАНЦИЯ КИШИНЁВ — АВТОВОКЗАЛ ТРАНСЛЮКС:
- Отправление из Кишинёва — с автовокзала ТРАНСЛЮКС, улица Каля Мошилор, два а. НИКОГДА не называй «Северный автовокзал» или «Автогара Норд» — мы оттуда не отправляемся.
- Любой адрес станции читай ДОСЛОВНО из поля address_spoken_ru инструмента get_company_info.`;

const BALTI_OBSOLETE_RU = '\n• Станция Бельцы: автовокзал, перрон семнадцать';
const BALTI_MARKER_RU = 'СТАНЦИЯ БЕЛЬЦЫ — ПЕРРОНЫ';
const BALTI_BLOCK_RU = `

СТАНЦИЯ БЕЛЬЦЫ — ПЕРРОНЫ ПЯТНАДЦАТЬ И ШЕСТНАДЦАТЬ:
- На автовокзале Бельцы мы находимся на перронах пятнадцать и шестнадцать — НЕ на семнадцатом.`;

const SOSIREA_OBSOLETE_RU = '\n- Время ПРИБЫТИЯ не называешь при представлении рейса — только отправление. Прибытие называешь ТОЛЬКО если клиент спросил явно.';
// Rândul-pereche VIU din blocul «ВРЕМЯ — ДОСЛОВНО» al promptului RU de bază (побайтово).
const SOSIREA2_OBSOLETE_RU = '\n- Время отправления/прибытия произносишь ТОЛЬКО из поля departure_spoken_ru результата tool-а — слово в слово. Так же arrival_spoken_ru. НИКОГДА не преобразуй HH:MM в слова сама.';
// Ion 30.08: + правило «вещь без названия» — блок пересоздан под новым маркером.
const LUCRURI_OBSOLETE_RU = `

ЗАБЫТЫЕ ВЕЩИ — ТОЛЬКО ОПОЗНАННЫЙ ВОДИТЕЛЬ:
- Клиент забыл или потерял ЛЮБУЮ вещь в автобусе (сумку, телефон, документы, пакет)? Вещь остаётся у водителя. Ты определяешь правильного водителя и даёшь клиенту его номер — всё.
- Используй ТОЛЬКО инструмент find_past_trip, НИКОГДА search_trips: search_trips видит только будущие рейсы, а рейс с вещью уже ушёл.
- Собери, что клиент помнит (максимум 3 вопроса, по одному за реплику): маршрут, день («вчера», «позавчера», день недели — отправь СЛОВО в «date», сервер сам решит назад), примерное время («departure»), номер машины («plate», можно частично), имя водителя («driver_name»).
- count = 1 → читай ДОСЛОВНО driver_line_ru.
- count > 1 → перечисли кандидатов и попроси деталь, которая выберет одного; вызови инструмент снова. Номер даётся ТОЛЬКО при ОДНОМ кандидате.
- count = 0 → читай ДОСЛОВНО company_phone_line_ru. Исключение: в ответе есть unknown_locality — тогда СНАЧАЛА уточни населённый пункт по его сообщению и повтори поиск. НИКОГДА не давай номер «похожего» водителя или «с того же маршрута» — это чужой человек.
- need_more = true → задай вопрос из result_ru и вызови инструмент снова с ответом. НЕ читай company_phone_line и НЕ завершай разговор.
- НЕ обещай, что ты позвонишь водителю, что кто-то ищет вещь или перезвонит. НЕ говори «беру на заметку» — здесь ничего не записывается, здесь опознаётся водитель.
- НЕ вызывай request_callback для забытых вещей — общее правило «нет информации → предложи request_callback» здесь НЕ действует: случай решается через find_past_trip.`;
const SOSIREA_MARKER_RU = 'ВРЕМЯ ПРИБЫТИЯ — НЕ НАЗЫВАЕТСЯ';
const SOSIREA_BLOCK_RU = `

ВРЕМЯ ПРИБЫТИЯ — НЕ НАЗЫВАЕТСЯ НИКОГДА:
- Называешь ТОЛЬКО время отправления. Время прибытия НЕ называешь НИКОГДА — ни в презентации, ни на прямой вопрос; из search_trips оно больше не приходит.
- Клиент спрашивает, когда приедет? Коротко скажи, что время прибытия зависит от дороги и обещать его нельзя, затем повтори время отправления.
- Время отправления произносишь ТОЛЬКО из поля departure_spoken_ru результата tool-а — слово в слово. НИКОГДА не преобразуй HH:MM в слова сама.`;

// Lucruri uitate. 11 apeluri în 10 zile (21–30.08), jumătate din coada de callback.
// Incident 29.08 (9ab2043d): search_trips ascunde cursele plecate, agentul a dat
// numărul șoferului cursei de seară unei cliente care mersese la amiază — om străin.
// Decizia lui Ion 30.08: obiectul rămâne la șofer; agentul identifică șoferul CORECT
// (rută+zi+oră SAU număr de mașină SAU nume) cu tool-ul find_past_trip și dă numărul
// DOAR la un singur candidat. Eталon: agent-config.mjs, secțiunea LUCRURI UITATE —
// se schimbă împreună, același commit.
// Apel real 30.08 (conv_0801m19b1vf6efbr1phztbrzkxce): «ochelari» stâlcit de ASR în
// «chelarie» → agentul a ghicit «geantă», la corecție «chiloți». De aici regula:
// numele obiectului nu se repetă, nu se ghicește — nu contează pentru flux (Ion 30.08).
// Markerul e REDENUMIT la fiecare schimbare de conținut (30.08: + regula obiectului):
// vindecarea e idempotentă pe marker, corpul unui bloc livrat nu se mai retrimite.
// Procedeu: marker nou în bloc + PROMPT_MARKERS + HEALABLE, blocul VECHI la
// OBSOLETE_BLOCKS (același drum ca Autogara Nord / peron 17 / ora sosirii).
const LUCRURI_BLOCK = `

LUCRURI UITATE — ȘOFERUL IDENTIFICAT, OBIECTUL FĂRĂ NUME:
- Clientul a uitat sau a pierdut ORICE obiect în autobuz (geantă, telefon, acte, pachet)? Obiectul rămâne la șofer. Tu identifici șoferul corect și dai clientului numărul lui — atât.
- Numele obiectului NU contează pentru căutare și NU se transmite nicăieri: nu-l repeta după client, nu-l ghici, nu-l «corecta». Nu l-ai înțeles clar? Spune «obiectul pierdut» și treci direct la întrebările despre cursă.
- Folosește DOAR tool-ul find_past_trip, NICIODATĂ search_trips: search_trips vede doar cursele viitoare, cursa cu obiectul a plecat deja.
- Strânge ce știe clientul (maximum 3 întrebări, câte una pe replică): ruta, ziua («ieri», «alaltăieri», ziua săptămânii — trimite CUVÂNTUL în «date», serverul îl rezolvă înapoi), ora aproximativă («departure»), numărul mașinii («plate», merge și parțial), numele șoferului («driver_name»).
- count = 1 → citește DOSLOVEN driver_line_ro / driver_line_ru.
- count > 1 → enumeră candidații și cere detaliul care alege unul; recheamă tool-ul. Numărul se dă DOAR la UN singur candidat.
- count = 0 → citește DOSLOVEN company_phone_line_ro / company_phone_line_ru. Excepție: răspunsul are unknown_locality — atunci ÎNTÂI clarifici localitatea după mesajul lui și recherci. NU da NICIODATĂ numărul unui șofer «apropiat» sau «de pe aceeași rută» — e un om străin de problema clientului.
- need_more = true → pui întrebarea din result_ro/result_ru și rechemi tool-ul cu răspunsul. NU citești company_phone_line și NU închizi discuția.
- NU promite că suni tu șoferul, că cineva caută obiectul sau că cineva sună înapoi. NU spune «am notat».
- NU chema request_callback pentru lucruri uitate — regula generală «nu ai informația → oferă request_callback» NU se aplică aici: cazul se rezolvă cu find_past_trip.`;

const LUCRURI_MARKER_RU = 'ЗАБЫТЫЕ ВЕЩИ — ОПОЗНАННЫЙ ВОДИТЕЛЬ, ВЕЩЬ БЕЗ НАЗВАНИЯ';
const LUCRURI_BLOCK_RU = `

ЗАБЫТЫЕ ВЕЩИ — ОПОЗНАННЫЙ ВОДИТЕЛЬ, ВЕЩЬ БЕЗ НАЗВАНИЯ:
- Клиент забыл или потерял ЛЮБУЮ вещь в автобусе (сумку, телефон, документы, пакет)? Вещь остаётся у водителя. Ты определяешь правильного водителя и даёшь клиенту его номер — всё.
- Название вещи НЕ важно для поиска и НИКУДА не передаётся: не повторяй его за клиентом, не угадывай и не «поправляй». Не расслышала — скажи «потерянная вещь» и сразу переходи к вопросам о рейсе.
- Используй ТОЛЬКО инструмент find_past_trip, НИКОГДА search_trips: search_trips видит только будущие рейсы, а рейс с вещью уже ушёл.
- Собери, что клиент помнит (максимум 3 вопроса, по одному за реплику): маршрут, день («вчера», «позавчера», день недели — отправь СЛОВО в «date», сервер сам решит назад), примерное время («departure»), номер машины («plate», можно частично), имя водителя («driver_name»).
- count = 1 → читай ДОСЛОВНО driver_line_ru.
- count > 1 → перечисли кандидатов и попроси деталь, которая выберет одного; вызови инструмент снова. Номер даётся ТОЛЬКО при ОДНОМ кандидате.
- count = 0 → читай ДОСЛОВНО company_phone_line_ru. Исключение: в ответе есть unknown_locality — тогда СНАЧАЛА уточни населённый пункт по его сообщению и повтори поиск. НИКОГДА не давай номер «похожего» водителя или «с того же маршрута» — это чужой человек.
- need_more = true → задай вопрос из result_ru и вызови инструмент снова с ответом. НЕ читай company_phone_line и НЕ завершай разговор.
- НЕ обещай, что ты позвонишь водителю, что кто-то ищет вещь или перезвонит. НЕ говори «беру на заметку» — здесь ничего не записывается, здесь опознаётся водитель.
- НЕ вызывай request_callback для забытых вещей — общее правило «нет информации → предложи request_callback» здесь НЕ действует: случай решается через find_past_trip.`;

// Reclamațiile. Apel 01.09 (+380960426128): client acuză un șofer «Mihai» că a
// luat 250 lei în loc de 68 pe Bălți–Criva, ora 01:30 — rezumatul a ajuns în
// Telegram fără cursă și fără om, deci fără responsabil. Ion: «în cazul
// reclamațiilor noi trebuie clar să identificăm cine este vinovatul, dacă nu
// identificăm șoferul — nu e clar responsabilitatea».
// Două decizii ale lui Ion din aceeași zi, ambele în bloc:
//   1) fără vinovat identificat îi spunem clientului pe față că nu putem cerceta;
//   2) clientul NU află pe cine am identificat (nici nume, nici număr).
// Eталон: agent-config.mjs, secțiunea RECLAMAȚII — se schimbă împreună, același commit.
const RECLAMATII_BLOCK = `

RECLAMAȚIA — VINOVATUL IDENTIFICAT:
- Orice reclamație despre o călătorie (bani luați în plus, nu a oprit, purtare urâtă, nu a mers până la capăt) se înregistrează cu register_complaint, NU cu request_callback.
- Cheamă tool-ul IMEDIAT ce înțelegi că e reclamație, cu ce ai; el actualizează aceeași reclamație la fiecare apel nou, nu creează dubluri.
- Înainte de PRIMUL apel al tool-ului spui o replică scurtă de așteptare: «Un moment, înregistrez.» — căutarea ține câteva secunde și tăcerea sună a linie căzută.
- Strânge detaliile care identifică cursa, câte o întrebare pe replică: ruta, ziua (trimite CUVÂNTUL rostit în «date»), ora plecării, numărul mașinii («plate», merge și parțial), numele șoferului («driver_name»).
- Arată empatie O DATĂ, scurt. Nu da dreptate nimănui și nu promite compensații.
- need_more = true → pui întrebarea din result_ro/result_ru și rechemi tool-ul cu răspunsul.
- Răspunsul are unknown_locality → ÎNTÂI clarifici localitatea după mesajul lui, apoi rechemi tool-ul.
- identified = true → citești DOSLOVEN confirm_line_ro / confirm_line_ru.
- Clientul nu mai ține minte nimic → rechemi tool-ul cu no_more_details = true și citești DOSLOVEN refusal_line_ro / refusal_line_ru. Fără șofer identificat reclamația nu poate fi cercetată și i-o spui pe față.
- NU spui NICIODATĂ clientului pe cine ai identificat: nici numele șoferului, nici numărul lui, nici numărul mașinii, nici câți șoferi corespund.
- Obiect uitat sau pierdut NU e reclamație, chiar dacă clientul spune «vreau să reclam»: acolo mergi pe find_past_trip. Reclamația care nu e despre o călătorie (salariu, angajare, factură, publicitate) nu are cursă și nici șofer — pentru ea folosești request_callback.
- NU folosi find_past_trip pentru reclamații despre călătorie: acela dă numărul șoferului, iar cel reclamat nu se dă niciodată.
- NU promite compensații, sancțiuni sau că cineva sună înapoi.`;

const RECLAMATII_MARKER_RU = 'ЖАЛОБА — ВИНОВНЫЙ ОПОЗНАН';
const RECLAMATII_BLOCK_RU = `

ЖАЛОБА — ВИНОВНЫЙ ОПОЗНАН:
- Любая жалоба на поездку (взял больше денег, не остановился, грубил, не довёз) регистрируется инструментом register_complaint, НЕ request_callback.
- Вызывай инструмент СРАЗУ, как понял, что это жалоба, с тем, что уже есть; он обновляет ту же жалобу при каждом новом вызове и не создаёт дублей.
- Перед ПЕРВЫМ вызовом инструмента скажи короткую реплику ожидания: «Одну минуту, записываю.» — поиск идёт несколько секунд, и тишина звучит как оборванная связь.
- Собери детали, которые определяют рейс, по одному вопросу за реплику: маршрут, день (отправь СЛОВО клиента в «date»), время отправления, номер машины («plate», можно частично), имя водителя («driver_name»).
- Прояви сочувствие ОДИН раз, коротко. Никого не оправдывай и не обещай компенсаций.
- need_more = true → задай вопрос из result_ru и вызови инструмент снова с ответом.
- В ответе есть unknown_locality → СНАЧАЛА уточни населённый пункт по его сообщению, потом вызови инструмент снова.
- identified = true → читай ДОСЛОВНО confirm_line_ru.
- Клиент больше ничего не помнит → вызови инструмент с no_more_details = true и читай ДОСЛОВНО refusal_line_ru. Без опознанного водителя жалобу разобрать нельзя, и ты говоришь это прямо.
- НИКОГДА не говори клиенту, кого ты опознал: ни имени водителя, ни его номера, ни номера машины, ни сколько водителей подходит.
- Забытая или потерянная вещь — НЕ жалоба, даже если клиент говорит «хочу пожаловаться»: там работает find_past_trip. Жалоба не о поездке (зарплата, приём на работу, счёт, реклама) не имеет ни рейса, ни водителя — для неё используй request_callback.
- НЕ используй find_past_trip для жалоб на поездку: он выдаёт номер водителя, а номер того, на кого жалуются, не даётся никогда.
- НЕ обещай компенсаций, наказаний или обратного звонка.`;

const LIMBA_BLOCK = `

LIMBA — A DOUA OARĂ LA RÂND:
- Treci pe rusă DOAR când clientul vorbește rusește A DOUA OARĂ LA RÂND — două propoziții COMPLETE (minimum 3 cuvinte fiecare, cu verb) în rusă.
- O SINGURĂ replică ce pare rusească NU e motiv de schimbare: transcrierea scrie des româna cu chirilice, iar «da», «alo», «aha», «nu», «bine», «mersi» sună identic în ambele limbi.
- Transcriere fără sens sau orice dubiu? Rămâi pe limba curentă și roagă scurt să repete.`;

// Apel real 30.08 (conv_3101m18kxmbce2br16snwy8detmc): la un «Да.» chirilizat de ASR
// modelul a citit driver_line_ru unui client care vorbea română — fără language_detection.
// Pentru model a fost selecție de câmp, nu schimbare de limbă, deci LIMBA_BLOCK nu l-a
// oprit. Blocul NU definește CÂND se schimbă limba (aia e treaba regulii limbii de mai
// sus — textul de aici nu are voie să conțină șirul-marker al acelui bloc, altfel
// orbește detectorul) — leagă doar alegerea câmpului de limba replicii. Plasa de
// siguranță e pe server (stripRuToolFields în voice-llm și în fallback-ul de aici).
// DOAR agentul RO: la agentul RU formularea ar fi falsă — el vorbește rusa by design.
const CAMPURI_RU_BLOCK = `

CÂMPURILE _RU — DOAR ÎN REPLICI RUSEȘTI:
- Tool-urile întorc câmpuri pereche: *_ro (română) și *_ru (rusă). Un câmp _ru îl citești DOAR într-o replică pe care o spui în rusă; în orice replică românească citești varianta _ro.
- O replică scurtă a clientului scrisă cu chirilice («Да», «Алло», numele unei localități) NU înseamnă că el a trecut pe rusă și NU e motiv să citești un câmp _ru.
- Alegerea câmpului URMEAZĂ limba în care răspunzi, stabilită de regulile de schimbare a limbii — alegerea câmpului nu schimbă niciodată ea însăși limba.`;

async function canonKeywords(): Promise<string[]> {
  try {
    const { data } = await getSupabase().from('voice_agent_canon').select('value').eq('key', 'asr_keywords').maybeSingle();
    const v = data?.value;
    if (Array.isArray(v) && v.length > 0 && v.length <= 50) return v as string[];
  } catch { /* fallback mai jos */ }
  return FALLBACK_KEYWORDS;
}

// Надгробия: САМО-ДОПИСАННЫЕ ранее блоки, чьи правила отменены. Вычищаются из
// живого промпта точным совпадением строки (никакой ручной перепечатки 17k).
// Первый случай: блок e2c6263 разрешал обещать перезвон ПОСЛЕ request_callback —
// отменён решением Иона 24.08 «операторов, которые перезванивают, нет».
const OBSOLETE_BLOCKS = [
  `

ÎNTÂI TOOL-UL, APOI PROMISIUNEA:
- Promiți că cineva sună clientul înapoi DOAR DUPĂ ce request_callback a întors succes în ACEST apel. Ordinea e strictă: ceri numărul, chemi tool-ul, aștepți rezultatul — abia apoi confirmi că va fi sunat.
- Fără solicitare înregistrată, formulări ca «vă sunăm noi», «un coleg vă va suna», «мы вам перезвоним» sunt INTERZISE: nimeni nu sună înapoi fără cerere în sistem, iar clientul ar aștepta degeaba.`,
  // Rând din promptul ORIGINAL (nu auto-dopisat), anulat de Ion 28.08: plecarea e de la
  // Autogara TRANSLUX (Calea Moșilor 2/a), nu Autogara Nord. Înlocuit de STATIA_BLOCK.
  '\n• Stația Chișinău: Autogara Nord, str. Calea Moșilor 2',
  // Ion 28.08: peroanele 15–16, nu 17. Înlocuit de BALTI_BLOCK.
  '\n• Stația Bălți: Autogara, peronul 17',
  // Ion 28.08: sosirea nu se spune NICIODATĂ — regula veche «doar dacă cere explicit»
  // e anulată. Înlocuit de SOSIREA_BLOCK.
  '\n- Ora SOSIRII nu o spui în prezentarea cursei — doar plecarea. Sosirea o spui DOAR dacă clientul o cere explicit.',
  // Ion 30.08: + regula «obiectul fără nume» (apel conv_0801m19b1vf6efbr1phztbrzkxce:
  // «ochelari» stâlcit → «geantă», «chiloți»). Înlocuit de LUCRURI_BLOCK cu marker nou.
  `

LUCRURI UITATE — DOAR ȘOFERUL IDENTIFICAT:
- Clientul a uitat sau a pierdut ORICE obiect în autobuz (geantă, telefon, acte, pachet)? Obiectul rămâne la șofer. Tu identifici șoferul corect și dai clientului numărul lui — atât.
- Folosește DOAR tool-ul find_past_trip, NICIODATĂ search_trips: search_trips vede doar cursele viitoare, cursa cu obiectul a plecat deja.
- Strânge ce știe clientul (maximum 3 întrebări, câte una pe replică): ruta, ziua («ieri», «alaltăieri», ziua săptămânii — trimite CUVÂNTUL în «date», serverul îl rezolvă înapoi), ora aproximativă («departure»), numărul mașinii («plate», merge și parțial), numele șoferului («driver_name»).
- count = 1 → citește DOSLOVEN driver_line_ro / driver_line_ru.
- count > 1 → enumeră candidații și cere detaliul care alege unul; recheamă tool-ul. Numărul se dă DOAR la UN singur candidat.
- count = 0 → citește DOSLOVEN company_phone_line_ro / company_phone_line_ru. Excepție: răspunsul are unknown_locality — atunci ÎNTÂI clarifici localitatea după mesajul lui și recherci. NU da NICIODATĂ numărul unui șofer «apropiat» sau «de pe aceeași rută» — e un om străin de problema clientului.
- need_more = true → pui întrebarea din result_ro/result_ru și rechemi tool-ul cu răspunsul. NU citești company_phone_line și NU închizi discuția.
- NU promite că suni tu șoferul, că cineva caută obiectul sau că cineva sună înapoi. NU spune «am notat».
- NU chema request_callback pentru lucruri uitate — regula generală «nu ai informația → oferă request_callback» NU se aplică aici: cazul se rezolvă cu find_past_trip.`,
  // Secțiunea RECLAMAȚII din promptul ORIGINAL, anulată de Ion 01.09: reclamația
  // nu mai merge la request_callback (text liber, fără vinovat) și nu se mai
  // promite apel înapoi. Înlocuită de RECLAMATII_BLOCK. Fără надгробие, cele două
  // reguli ar sta una lângă alta în promptul viu și modelul ar asculta-o pe cea veche.
  `═══════════════════════════════════
RECLAMAȚII
═══════════════════════════════════
Ascultă cu empatie. Cere detalii: data, ruta, ce s-a întâmplat.
Apoi folosește request_callback cu motivul reclamației și spune:
"Îmi pare rău pentru neplăcere. Am notat reclamația dumneavoastră — un coleg vă va suna înapoi. Mulțumesc că ne ajutați să ne îmbunătățim."

`,
  // Rândul VIU din blocul ORELE (28.08, побайтово din promptul agentului — ATENȚIE:
  // blocul viu a fost editat de mână și DIFERĂ de constanta ORELE_BLOCK de mai sus,
  // «singură» vs «singur»). Învăța cum se rostește sosirea — anulat: interdicție
  // absolută. Înlocuirea (doar plecarea) stă în SOSIREA_BLOCK.
  '\n- Ora plecării/sosirii o rostești DOAR din câmpul departure_spoken_ro (română) / departure_spoken_ru (rusă) al rezultatului tool-ului — cuvânt cu cuvânt. La fel arrival_spoken_*. NU converti niciodată singură HH:MM în cuvinte.',
];

// `msg` poartă cauza în jurnal: `details` e jsonb și primește obiectul întreg.
// Fără el, o lecuire căzută definitiv se vede ca o linie fără nume pe zi (dedup 24h),
// iar textul erorii trăiește doar în logurile Vercel (review 31.08).
type Drift = { field: string; healed: boolean; msg?: string };

// Anunțul de înregistrare vine din voice-greeting.ts — sursa saluturilor înseși, ca
// reformularea de acolo să nu producă drift fantomă aici. Era nepăzit: șters din
// dashboard, dispărea tăcut din ambele căi. NU vindecăm orb — textul salutului e
// decizie umană; raportăm drift, ca la custom_llm.url.


// Tool-urile care poartă flux propriu (lucruri uitate, reclamații) sunt workspace
// tools legate prin tool_ids — dashboard-ul le poate dezlega tăcut, iar promptul
// ar cere atunci un tool inexistent (review M6). Id-ul se caută o dată pe rulare;
// lipsa TOOL-ului din workspace = drift nevindecat (crearea e treaba scriptului
// add-find-past-trip-tool.mjs, nu a controlerului).
// `params` = numele câmpurilor pe care tool-ul VIU le acceptă. Nu e curiozitate:
// un bloc de prompt care cere un câmp inexistent în schema tool-ului trimite
// modelul să scrie ceva ce platforma aruncă tăcut (audit 02.09 — promptul se
// livrează singur, schema tool-ului doar cu scriptul, deci promptul poate ajunge
// primul). Vezi gardul de la blocul TIPURI.
async function workspaceTool(name: string): Promise<{ id: string; params: string[] } | null> {
  try {
    const list = await elGet(`/v1/convai/tools?search=${name}&page_size=10`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hit = (((list as any).tools ?? []) as any[]).find((t) => t.tool_config?.name === name);
    if (!hit?.id) return null;
    const props = hit.tool_config?.api_schema?.request_body_schema?.properties ?? {};
    return { id: hit.id, params: Object.keys(props) };
  } catch { return null; }
}

async function workspaceToolId(name: string): Promise<string | null> {
  return (await workspaceTool(name))?.id ?? null;
}

// Lista tipurilor de reclamații în prompt (migr. 310, Ion 02.09).
//
// SINGURUL bloc sincronizat pe CONȚINUT, nu doar pe marker. Restul blocurilor
// sunt proză de om, iar promptul viu poate fi mai bun decât fișierul — de aceea
// acolo se livrează o dată și gata (vezi comentariul lung de la HEALABLE).
// Lista asta e generată dintr-o tabelă pe care o ține Ion din panou: are un
// singur stăpân. Rămasă în urmă, ar trimite modelul spre coduri inexistente și
// fiecare reclamație ar cădea tăcut pe ALTUL — adică exact tipologia pierdută.
// Scrisă de mână în dashboard, se întoarce la ce spune tabela. E intenționat.
//
// Trei porți de siguranță, în ordinea în care mușcă:
//  1. baza mută sau listă goală → NU atingem promptul, raportăm drift nevindecat;
//  2. marker prezent dar fără sfârșit (cineva a tăiat jumătate de bloc) → la fel:
//     nu ghicim unde se termină, ca să nu mâncăm restul promptului;
//  3. identic → niciun PATCH (rulează la fiecare câteva minute).
async function syncTypesBlock(
  prompt: string, lang: 'ro' | 'ru',
): Promise<{ prompt: string; changed: boolean; failed: boolean }> {
  let types;
  try {
    types = await activeComplaintTypes();
  } catch (e) {
    console.error('syncTypesBlock:', e);
    return { prompt, changed: false, failed: true };
  }
  // Zero tipuri active = nomenclator golit din greșeală. Un bloc cu lista goală
  // ar lăsa modelul fără nicio valoare validă, deci nu-l scriem.
  if (types.length === 0) return { prompt, changed: false, failed: true };
  return lang === 'ro'
    ? spliceTypesBlock(prompt, complaintTypesBlockRo(types), TYPES_MARKER_RO)
    : spliceTypesBlock(prompt, complaintTypesBlockRu(types), TYPES_MARKER_RU);
}

// Relegarea tool-urilor dispărute din tool_ids. PATCH separat de restul
// (tool_ids e listă — merge-ul per-cheie o înlocuiește integral, deci trimitem
// lista completă). TOATE tool-urile lipsă intră într-un SINGUR PATCH: două
// PATCH-uri construite din același cfg citit o dată s-ar șterge unul pe altul —
// al doilea ar trimite lista veche plus tool-ul lui, fără cel legat de primul.
// Idempotent: totul legat deja = niciun apel.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function healToolBindings(cfg: any, tools: { id: string | null; field: string }[], agentId: string): Promise<Drift[]> {
  const ids: string[] = cfg?.conversation_config?.agent?.prompt?.tool_ids ?? [];
  const drifts: Drift[] = [];
  const toAdd: string[] = [];
  for (const t of tools) {
    if (!t.id) { drifts.push({ field: `${t.field}.workspace_tool_missing`, healed: false }); continue; }
    if (ids.includes(t.id) || toAdd.includes(t.id)) continue;
    toAdd.push(t.id);
    drifts.push({ field: `${t.field}.tool_ids`, healed: true });
  }
  if (toAdd.length === 0) return drifts;
  await elPatchAgent({ conversation_config: { agent: { prompt: { tool_ids: [...ids, ...toAdd] } } } }, agentId);
  return drifts;
}

// `drifts` vine din AFARĂ, nu se întoarce la final: funcția face DOUĂ PATCH-uri, iar
// un throw pe al doilea ștergea tot ce apucase să vindece primul — jurnalul rămânea
// fără liniile lecuirilor reale și fără drift-urile nevindecate deja găsite (review 31.08).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkAndHealConfig(cfg: any, drifts: Drift[], complaintToolExists: boolean, tipuriInTool: boolean): Promise<void> {
  const ps = cfg.platform_settings ?? {};
  const cc = cfg.conversation_config ?? {};
  // «Vindecat» se scrie în jurnal DOAR după ce PATCH-ul a reușit: altfel un PATCH
  // respins lăsa linii «healed: true» pentru lecuiri care nu s-au întâmplat, iar
  // dedup-ul de 24h bloca apoi o zi linia sinceră (review 31.08). Drift-urile
  // report-only (healed:false) nu depind de PATCH — ele merg direct în `drifts`.
  const flush = async (patch: () => Promise<unknown>, pending: Drift[]) => {
    try {
      await patch();
    } catch (e) {
      drifts.push(...pending.map((d) => ({ ...d, healed: false })));
      throw e;
    }
    drifts.push(...pending);
  };

  // --- platform_settings: un singur PATCH pentru tot ce a deviat ---
  const psPatch: Record<string, unknown> = {};
  const psHealed: Drift[] = [];
  const ov = ps.overrides ?? {};
  const agOv = ov.conversation_config_override?.agent ?? {};
  if (!ov.enable_conversation_initiation_client_data_from_webhook || !agOv.first_message || !agOv.language) {
    psPatch.overrides = {
      ...ov,
      enable_conversation_initiation_client_data_from_webhook: true,
      conversation_config_override: {
        ...(ov.conversation_config_override ?? {}),
        agent: { ...agOv, first_message: true, language: true },
      },
    };
    psHealed.push({ field: 'overrides.webhook_flags', healed: true });
  }
  const wh = ps.workspace_overrides?.conversation_initiation_client_data_webhook;
  // Antetul se compară pe VALOARE, nu doar pe prezență: la rotația cheii, aici
  // rămânea pentru totdeauna cheia veche — iar ștergerea lui VOICE_API_KEY_PREV
  // ar fi lăsat salutul pe varianta de avarie, tăcut (audit 02.09).
  const cheiaCurenta = (process.env.VOICE_API_KEY ?? '').trim();
  if (wh?.url !== INIT_WEBHOOK_URL
    || (cheiaCurenta && wh?.request_headers?.['x-voice-api-key'] !== cheiaCurenta)) {
    psPatch.workspace_overrides = {
      conversation_initiation_client_data_webhook: {
        url: INIT_WEBHOOK_URL,
        request_headers: { 'x-voice-api-key': cheiaCurenta },
      },
    };
    psHealed.push({ field: 'init_webhook_url', healed: true });
  }
  if (cc.agent?.prompt?.custom_llm?.url !== CUSTOM_LLM_URL) {
    drifts.push({ field: 'custom_llm.url', healed: false }); // URL-ul se schimbă doar de om — nu-l «vindecăm» orb
  }
  // Salutul de rezervă (se aude când pică init-webhook-ul) TREBUIE să spună că apelul
  // se înregistrează — apelul se înregistrează oricum. Ștergerea lui din dashboard nu
  // mai e tăcută. Salutul poate fi într-o singură limbă: cerem anunțul în limba lui.
  // Gol = și mai rău decât fără anunț (agentul tace la începutul apelului), deci are
  // drift propriu. Aici nu vindecăm orb: textul salutului e decizie umană.
  const fm: string = cc.agent?.first_message ?? '';
  if (!fm) {
    drifts.push({ field: 'first_message.empty', healed: false });
  } else if (!fm.includes(RECORDING_NOTICE_RO) && !fm.includes(RECORDING_NOTICE_RU)) {
    drifts.push({ field: 'first_message.recording_notice', healed: false, msg: fm.slice(0, 120) });
  }

  // --- conversation_config: la fel, un singur PATCH ---
  const ccPatch: Record<string, unknown> = {};
  const ccHealed: Drift[] = [];
  const canon = await canonKeywords();
  const kw: string[] = cc.asr?.keywords ?? [];
  if (kw.join('|') !== canon.join('|')) {
    ccPatch.asr = { ...cc.asr, keywords: canon };
    ccHealed.push({ field: 'asr.keywords', healed: true });
  }
  const bg = cc.conversation?.background_sound;
  if (bg?.source_id !== 'office1' || bg?.volume !== 0.1) {
    ccPatch.conversation = {
      ...cc.conversation,
      background_sound: { source_type: 'preset', source_id: 'office1', volume: 0.1, crossfade_loop: true },
    };
    ccHealed.push({ field: 'background_sound', healed: true });
  }
  const prompt: string = cc.agent?.prompt?.prompt ?? '';
  const missing = PROMPT_MARKERS.filter((m) => !prompt.includes(m));
  // Blocurile auto-vindecabile se adaugă în COADĂ, idempotent după marker. Poziția NU
  // salvează cache-ul (punctul de cache e unul singur, pe tot system-ul) — de aceea
  // blocurile trebuie să rămână statice, fără variabile care se schimbă în timpul apelului.
  //
  // ATENȚIE — VINDECAREA E DOAR PE MARKER, NU PE CONȚINUT (măsurat 31.08).
  //
  // DECIZIA LUI ION (31.08): sursa adevărului pentru prompt e AGENTUL VIU, nu fișierul
  // ăsta. Deci comparația pe conținut NU se pune, iar textul scris din dashboard NU se
  // aliniază la constante — el rămâne stăpân. Canonul de mai jos e o plasă de PORNIRE:
  // livrează blocul când markerul lipsește și după aceea nu se mai amestecă.
  // Prețul acceptat conștient: o substituire de text în dashboard nu o vede nimeni.
  // Blocul se adaugă DOAR când markerul lipsește. Marker prezent ⇒ textul nu se compară
  // NICIODATĂ, deci un bloc odată livrat poate diverge la nesfârșit de constanta de mai
  // jos, iar controlerul nu vede nimic. Măsurat pe ORELE: blocul viu are 9 rânduri față
  // de 10 aici, iar două rânduri comune sunt mai lungi în viu, cu exemple din apeluri
  // reale («ai anunțat 07:10 drept prima când prima era 04:00», «INTERZIS „patru și
  // douăzeci după-amiază"»). Relația e viu ⊃ constantă: o comparație pe prefix ar trece,
  // una pe conținut ar pica. Formulările din viu sunt mai bune — nu le aliniem la repo.
  // Trei consecințe, în ordinea în care mușcă:
  //  1. Constantele astea NU sunt oglinda a ce aude clientul. Cine trage concluzii despre
  //     comportamentul agentului citind DOAR fișierul ăsta se înșală — se citește
  //     promptul viu prin API (GET /v1/convai/agents/<id>).
  //  2. O modificare într-un bloc DEJA livrat NU ajunge la agent păstrând markerul vechi.
  //     Calea durabilă e cea de la OBSOLETE_BLOCKS: marker NOU + rândul vechi ca piatră
  //     de mormânt (are granularitate de rând — vezi tocmai rândul cu departure_spoken_ro).
  //     PATCH-ul punctual pe conversation_config.agent.prompt.prompt e varianta rapidă
  //     (a9adfcd), dar lasă în urmă exact divergența descrisă aici.
  //  3. `setup.mjs --force-config` rescrie promptul viu întreg. Controlerul întoarce
  //     cele 10 blocuri de mai jos, dar markerii DOAR-detectare («UNIVERSUL localităților»,
  //     «Doriți numărul lui?», «SFÂRȘIT NUME RUSEȘTI» — numele rusești generate din BD)
  //     nu se întorc niciodată, ca și orice text scris din dashboard.
  // Notă de precizie, fiindcă a păcălit două sesiuni într-o zi: regula «Ora plecării o
  // rostești DOAR din departure_spoken_ro» LIPSEȘTE din ORELE-ul viu, dar NU s-a pierdut —
  // stă în secțiunea «ORA SOSIRII — NU SE SPUNE NICIODATĂ» (SOSIREA_BLOCK). E o clasare
  // greșită: regula despre PLECARE trăiește sub un titlu despre SOSIRE. Cine o caută în
  // ORELE n-o găsește și e tentat s-o adauge a doua oară — nu o face.
  const HEALABLE = [
    { marker: 'ORELE — DOSLOVEN', block: ORELE_BLOCK, field: 'prompt.ORELE' },
    { marker: 'ZIUA — DOSLOVEN', block: DATA_BLOCK, field: 'prompt.ZIUA' },
    { marker: 'e un CORIDOR', block: CORIDOR_BLOCK, field: 'prompt.CORIDOR' },
    { marker: 'A DOUA OARĂ LA RÂND', block: LIMBA_BLOCK, field: 'prompt.LIMBA' },
    { marker: 'APEL ÎNAPOI — NICIO PROMISIUNE', block: CALLBACK_ORDER_BLOCK, field: 'prompt.CALLBACK_ORDER' },
    { marker: 'STAȚIA CHIȘINĂU — AUTOGARA TRANSLUX', block: STATIA_BLOCK, field: 'prompt.STATIA' },
    { marker: 'STAȚIA BĂLȚI — PEROANELE', block: BALTI_BLOCK, field: 'prompt.BALTI' },
    { marker: 'ORA SOSIRII — NU SE SPUNE', block: SOSIREA_BLOCK, field: 'prompt.SOSIREA' },
    { marker: 'LUCRURI UITATE — ȘOFERUL IDENTIFICAT, OBIECTUL FĂRĂ NUME', block: LUCRURI_BLOCK, field: 'prompt.LUCRURI' },
    // Blocul reclamațiilor intră DOAR dacă tool-ul există în workspace: el
    // interzice request_callback pentru reclamații și trimite la register_complaint.
    // Livrat înaintea tool-ului, ar lăsa agentul cu o singură cale — una moartă,
    // iar reclamația s-ar pierde fără nicio eroare vizibilă (audit 01.09).
    ...(complaintToolExists
      ? [{ marker: 'RECLAMAȚIA — VINOVATUL IDENTIFICAT', block: RECLAMATII_BLOCK, field: 'prompt.RECLAMATII' }]
      : []),
    { marker: 'CÂMPURILE _RU — DOAR ÎN REPLICI RUSEȘTI', block: CAMPURI_RU_BLOCK, field: 'prompt.CAMPURI_RU' },
  ];
  let healedPrompt = prompt;
  for (const ob of OBSOLETE_BLOCKS) {
    if (healedPrompt.includes(ob)) {
      healedPrompt = healedPrompt.replace(ob, '');
      ccHealed.push({ field: 'prompt.obsolete_removed', healed: true });
    }
  }
  for (const h of HEALABLE) {
    if (missing.includes(h.marker)) {
      healedPrompt += h.block;
      ccHealed.push({ field: h.field, healed: true });
    }
  }
  // Lista tipurilor merge cu tool-ul, aceeași condiție ca blocul reclamațiilor:
  // fără register_complaint în workspace, codurile n-au unde pleca.
  // Markerul ei NU intră în PROMPT_MARKERS: acolo tot ce nu e în HEALABLE se
  // raportează ca drift nevindecat, iar blocul ăsta se vindecă singur, aici.
  if (tipuriInTool) {
    const s = await syncTypesBlock(healedPrompt, 'ro');
    if (s.failed) drifts.push({ field: 'prompt.TIPURI', healed: false });
    else if (s.changed) { healedPrompt = s.prompt; ccHealed.push({ field: 'prompt.TIPURI', healed: true }); }
  }
  // Merge, nu asignare: blocurile de mai jos (cascade, language_detection,
  // disable_first_message_interruptions) completează același ccPatch.agent — o
  // asignare aici ar pierde tăcut câmpurile lor la orice reordonare a blocurilor.
  if (healedPrompt !== prompt) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentPatch: any = ccPatch.agent ?? {};
    agentPatch.prompt = { ...(agentPatch.prompt ?? {}), prompt: healedPrompt };
    ccPatch.agent = agentPatch;
  }
  for (const m of missing.filter((x) => !HEALABLE.some((h) => h.marker === x))) {
    drifts.push({ field: `prompt.${m}`, healed: false });
  }
  // cascade_timeout 12s: scuza de avarie (FIRST_CHUNK_MS=6500 în proxy) trebuie să
  // apuce să iasă înaintea cascadei EL (incident TLX 24.08, portat).
  // PATCH parțial pe agent.prompt e SIGUR: verificat empiric 24.08 — după PATCH doar
  // cu cascade_timeout_seconds, prompt-ul (17k), custom_llm.url și tool_ids au rămas
  // intacte (merge per-cheie, ca la platform_settings; scratchpad cristina-check).
  if (cc.agent?.prompt?.cascade_timeout_seconds !== 12) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentPatch: any = ccPatch.agent ?? {};
    agentPatch.prompt = { ...(agentPatch.prompt ?? {}), cascade_timeout_seconds: 12 };
    ccPatch.agent = agentPatch;
    ccHealed.push({ field: 'cascade_timeout_seconds', healed: true });
  }
  // built_in_tools.language_detection.description — filtrul anti-comutare-falsă.
  const bit = cc.agent?.prompt?.built_in_tools;
  if (bit?.language_detection && bit.language_detection.description !== LANG_DETECT_DESC) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentPatch: any = ccPatch.agent ?? {};
    agentPatch.prompt = {
      ...(agentPatch.prompt ?? {}),
      built_in_tools: { ...bit, language_detection: { ...bit.language_detection, description: LANG_DETECT_DESC } },
    };
    ccPatch.agent = agentPatch;
    ccHealed.push({ field: 'language_detection.description', healed: true });
  }
  // Salutul se rostește PÂNĂ LA CAPĂT (Ion, 31.08): apelanții strigau «alo alo»
  // peste primul mesaj, barge-in-ul îl tăia și conversația începea ruptă. După
  // salut, întreruperile rămân active — câmpul acoperă DOAR first_message.
  if (cc.agent?.disable_first_message_interruptions !== true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentPatch: any = ccPatch.agent ?? {};
    agentPatch.disable_first_message_interruptions = true;
    ccPatch.agent = agentPatch;
    ccHealed.push({ field: 'disable_first_message_interruptions', healed: true });
  }
  // «alo»/«da» nu mai opresc agentul din vorbit (aceeași decizie Ion 31.08).
  // transcribe_on_disabled_interruptions=true e OBLIGATORIU lângă listă: un «da»
  // rostit peste coada întrebării nu întrerupe, dar TREBUIE să rămână în
  // transcriere — altfel răspunsul clientului dispare tăcut și agentul așteaptă.
  // merge_with_default=false + languages=[] intră și ele în canon: pornite din
  // dashboard, ar amesteca lista EL implicită / ar limita cuvintele pe limbi,
  // iar spread-ul {...turn} le-ar perpetua tăcut la fiecare heal.
  const turn = cc.turn ?? {};
  // Eticheta numește câmpul care chiar a deviat: cu una singură pentru toate patru,
  // un drift la merge_with_default ar fi citit în jurnal drept «lista de cuvinte».
  const turnDrifts = [
    (turn.interruption_ignore_terms ?? []).join('|') !== IGNORE_TERMS.join('|') && 'turn.interruption_ignore_terms',
    turn.transcribe_on_disabled_interruptions !== true && 'turn.transcribe_on_disabled_interruptions',
    turn.merge_with_default_ignore_terms !== false && 'turn.merge_with_default_ignore_terms',
    (turn.interruption_ignore_term_languages ?? []).length !== 0 && 'turn.interruption_ignore_term_languages',
  ].filter((f): f is string => typeof f === 'string');
  if (turnDrifts.length) {
    ccPatch.turn = {
      ...turn,
      interruption_ignore_terms: [...IGNORE_TERMS],
      interruption_ignore_term_languages: [],
      merge_with_default_ignore_terms: false,
      transcribe_on_disabled_interruptions: true,
    };
    for (const field of turnDrifts) ccHealed.push({ field, healed: true });
  }
  // PATCH-urile stau AICI, după TOATĂ detectarea: cât timp lecuirea secțiunii ps era
  // trimisă la mijloc, un PATCH respins de EL arunca din funcție și orbea definitiv
  // restul verificărilor — promptul, tool-urile, întreruperile — la fiecare prögon
  // (review 31.08). Detectarea nu depinde de PATCH: citește `cfg` luat la început.
  // Fiecare secțiune are try-ul ei, ca eșecul uneia să nu o înghită pe cealaltă;
  // prima eroare se aruncă la final, ca prögonul s-o poată scrie în jurnal.
  let patchError: unknown = null;
  if (psHealed.length) {
    try {
      await flush(() => elPatchAgent({ platform_settings: psPatch }), psHealed);
    } catch (e) { patchError ??= e; }
  }
  if (ccHealed.length) {
    try {
      await flush(() => elPatchAgent({ conversation_config: ccPatch }), ccHealed);
    } catch (e) { patchError ??= e; }
  }
  if (patchError) throw patchError;
}

// Лечение RU-агента: ТОЛЬКО станция (см. комментарий у STATIA_BLOCK_RU).
// Идемпотентно: надгробие — точное совпадение, блок — по маркеру.
async function healRuStation(lostToolId: string | null, complaintToolId: string | null, tipuriInTool: boolean): Promise<Drift[]> {
  const cfg = await elGet(`/v1/convai/agents/${RU_AGENT_ID}`);
  // Legarea find_past_trip la RU — pe config-ul deja citit, fără GET suplimentar.
  const bindDrifts = await healToolBindings(cfg, [
    { id: lostToolId, field: 'ru.tools.find_past_trip' },
    { id: complaintToolId, field: 'ru.tools.register_complaint' },
  ], RU_AGENT_ID);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prompt: string = (cfg as any).conversation_config?.agent?.prompt?.prompt ?? '';
  if (!prompt) return [...bindDrifts, { field: 'ru.prompt.empty', healed: false }];
  let healed = prompt;
  if (healed.includes(STATIA_OBSOLETE_RU)) healed = healed.replace(STATIA_OBSOLETE_RU, '');
  if (healed.includes(BALTI_OBSOLETE_RU)) healed = healed.replace(BALTI_OBSOLETE_RU, '');
  if (healed.includes(SOSIREA_OBSOLETE_RU)) healed = healed.replace(SOSIREA_OBSOLETE_RU, '');
  if (healed.includes(SOSIREA2_OBSOLETE_RU)) healed = healed.replace(SOSIREA2_OBSOLETE_RU, '');
  if (healed.includes(LUCRURI_OBSOLETE_RU)) healed = healed.replace(LUCRURI_OBSOLETE_RU, '');
  // Santinelă pe SENS, nu pe rând exact: «Северный автовокзал» rescris de mână în
  // dashboard nu mai potrivește надгробие-ul. Atunci NU adăugăm blocul peste
  // contradicție — raportăm drift nevindecat. Blocul PROPRIU conține fraza în
  // interdicție, deci îl scoatem înainte de test (altfel alarmă falsă la fiecare rulare).
  const inAfara = healed.replace(STATIA_BLOCK_RU, '');
  if (inAfara.includes('Северный автовокзал') || inAfara.includes('Автогара Норд')) {
    return [...bindDrifts, { field: 'ru.prompt.STATIA', healed: false }];
  }
  const vindecate: string[] = [];
  if (!healed.includes(STATIA_MARKER_RU)) { healed += STATIA_BLOCK_RU; vindecate.push('ru.prompt.STATIA'); }
  if (!healed.includes(BALTI_MARKER_RU)) { healed += BALTI_BLOCK_RU; vindecate.push('ru.prompt.BALTI'); }
  if (!healed.includes(SOSIREA_MARKER_RU)) { healed += SOSIREA_BLOCK_RU; vindecate.push('ru.prompt.SOSIREA'); }
  if (!healed.includes(LUCRURI_MARKER_RU)) { healed += LUCRURI_BLOCK_RU; vindecate.push('ru.prompt.LUCRURI'); }
  // Aceeași condiție ca pe RO: fără tool în workspace, blocul ar trimite agentul
  // spre o cale moartă și i-ar tăia singura cale rămasă (request_callback).
  if (complaintToolId && !healed.includes(RECLAMATII_MARKER_RU)) { healed += RECLAMATII_BLOCK_RU; vindecate.push('ru.prompt.RECLAMATII'); }
  // Lista tipurilor, în rusă. Sincronizată pe conținut, ca la RO — vezi syncTypesBlock.
  const nevindecate: Drift[] = [];
  if (tipuriInTool) {
    const s = await syncTypesBlock(healed, 'ru');
    if (s.failed) nevindecate.push({ field: 'ru.prompt.TIPURI', healed: false });
    else if (s.changed) { healed = s.prompt; vindecate.push('ru.prompt.TIPURI'); }
  }
  if (healed === prompt) return [...bindDrifts, ...nevindecate];
  await elPatchAgent({ conversation_config: { agent: { prompt: { prompt: healed } } } }, RU_AGENT_ID);
  return [
    ...bindDrifts, ...nevindecate,
    ...(vindecate.length ? vindecate : ['ru.prompt.STATIA']).map((f) => ({ field: f, healed: true })),
  ];
}

// ---- Обратный парсер времён из речи агента (таблицы — из time-spoken) ----
const RO_W: Record<string, number> = {};
const RU_W: Record<string, number> = {};
{
  RO_UNITS.forEach((w, i) => { RO_W[w] = i; });
  RU_UNITS.forEach((w, i) => { RU_W[w] = i; });
  for (let t = 2; t <= 5; t++) {
    RO_W[RO_TENS[t]] = t * 10;
    RU_W[RU_TENS[t]] = t * 10;
    for (let u = 1; u <= 9; u++) {
      RO_W[`${RO_TENS[t]} și ${RO_UNITS[u]}`] = t * 10 + u;
      RU_W[`${RU_TENS[t]} ${RU_UNITS[u]}`] = t * 10 + u;
    }
  }
}
const NUM_ALT_RO = Object.keys(RO_W).sort((a, b) => b.length - a.length).join('|');
const NUM_ALT_RU = Object.keys(RU_W).sort((a, b) => b.length - a.length).join('|');
// Минуты — ТОЛЬКО формы, которые реально излучает time-spoken: «fix»/«ноль-ноль»,
// «ноль X» (RU), десятки и составные. Голые единицы 1-9 исключены → «двадцать шесть
// лей» и «douăzeci și trei august» не парсятся как время (ревью 5bed93a, Important 1).
const RO_MIN_ALT = ['fix', ...Object.keys(RO_W).filter((k) => RO_W[k] >= 10)].sort((a, b) => b.length - a.length).join('|');
const RU_MIN_ALT = ['ноль-ноль', ...Object.keys(RU_W).filter((k) => RU_W[k] >= 10).map((k) => k), ...RU_UNITS.slice(1, 10).map((u) => `ноль ${u}`)]
  .sort((a, b) => b.length - a.length).join('|');
// «...douăzeci și cinci de lei» / «двадцать пять лей» — цены и даты режем lookahead-ом.
const NOT_MONEY_DATE = '(?!\\s*(?:de\\s+lei|lei|bani|лей|лея|леев|august|septembrie|octombrie|noiembrie|decembrie|ianuarie|februarie|martie|aprilie|mai|iunie|iulie|августа|сентября|октября|ноября|декабря|января|февраля|марта|апреля|мая|июня|июля))';
// NU \b: în JS el nu vede chirilicele/diacriticele ca litere (aceeași capcană ca în
// stripThinkingAloud, a310832) — cu \b toată ramura rusă era MOARTĂ (test 23.08).
// «și» e opțional DOAR pentru «fix» (emitter-ul zice «șaisprezece fix», fără și) —
// gardă în parse: minutele normale cer «și» prezent în match.
const RO_TIME_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${NUM_ALT_RO})\\s+(?:și\\s+)?(${RO_MIN_ALT})${NOT_MONEY_DATE}(?![\\p{L}\\p{N}])`, 'giu');
const RU_TIME_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${NUM_ALT_RU})\\s+(${RU_MIN_ALT})${NOT_MONEY_DATE}(?![\\p{L}\\p{N}])`, 'giu');

export function parseSpokenTimes(text: string): string[] {
  const out: string[] = [];
  for (const [re, dict] of [[RO_TIME_RE, RO_W], [RU_TIME_RE, RU_W]] as const) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const h = dict[m[1].toLowerCase()];
      const minRaw = m[2].toLowerCase();
      // RO: minutele normale se leagă OBLIGATORIU cu «și» — fără el, «douăzeci trei»
      // dintr-o enumerare ar deveni «20:03». «fix» e singura formă fără «și».
      if (dict === RO_W && minRaw !== 'fix' && !/\sși\s/.test(m[0])) continue;
      let min: number | undefined;
      if (minRaw === 'ноль-ноль' || minRaw === 'fix') min = 0;
      else if (minRaw.startsWith('ноль ')) min = dict[minRaw.slice(5)];
      else min = dict[minRaw];
      if (h === undefined || h > 23 || min === undefined || min > 59) continue;
      // Orarul real are mereu minutele multiplu de 5 — restul e zgomot (prețuri, km).
      if (min % 5 !== 0) continue;
      out.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    }
  }
  return out;
}

// ---- Продиктованные телефоны: цепочка цифро-слов ≥9 → строка цифр ----
const DIGIT_RO = new Map(RO_UNITS.slice(0, 10).map((w, i) => [w, String(i)]));
const DIGIT_RU = new Map(RU_UNITS.slice(0, 10).map((w, i) => [w, String(i)]));

export function parseSpokenPhones(text: string): string[] {
  const out: string[] = [];
  const tokens = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  let run = '';
  const flush = () => {
    if (run.length >= 9) out.push(run.slice(0, 9));
    run = '';
  };
  for (const tok of tokens) {
    const d = DIGIT_RO.get(tok) ?? DIGIT_RU.get(tok);
    if (d !== undefined) run += d;
    else flush();
  }
  flush();
  return out;
}

type Incident = { conversation_id: string; kind: string; details: Record<string, unknown> };

async function validateRecentCalls(): Promise<Incident[]> {
  const incidents: Incident[] = [];
  const list = await elGet(`/v1/convai/conversations?agent_id=${AGENT_ID}&page_size=10`);
  const cutoff = Date.now() / 1000 - 2 * 3600; // ultimele 2h; dedupe face restul
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recent = (((list as any).conversations ?? []) as any[])
    .filter((c) => (c.start_time_unix_secs ?? 0) >= cutoff)
    .slice(0, MAX_CALLS_PER_RUN);
  // Paralel: secvențial risca maxDuration=60s la vârfuri de latență EL (perf-review 5bed93a).
  const details = await Promise.allSettled(
    recent.map((c) => elGet(`/v1/convai/conversations/${c.conversation_id}`)),
  );
  details.forEach((res, i) => {
    if (res.status !== 'fulfilled') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = res.value;
    const turns: any[] = d.transcript ?? [];
    const allowed = new Set<string>();
    const allowedPhones = new Set<string>();
    const addPhone = (raw: unknown) => {
      const digits = String(raw ?? '').replace(/\D/g, '');
      if (digits.length < 8) return;
      allowedPhones.add(digits.startsWith('373') ? '0' + digits.slice(3) : digits);
    };
    // Номер ЗВОНЯЩЕГО тоже разрешён: агент повторяет его при colback-е (review
    // 6df570a, Important) — иначе гарантированный ложный spoken_phone_mismatch.
    addPhone(d.metadata?.phone_call?.external_number);
    addPhone(d.conversation_initiation_client_data?.dynamic_variables?.system__caller_id);
    let sawTripTool = false;
    for (const t of turns) {
      // Телефоны из ПАРАМЕТРОВ тулов (request_callback: клиент мог продиктовать другой).
      for (const tc of t.tool_calls ?? []) {
        const params = String(tc.params_as_json ?? '');
        for (const mm of params.matchAll(/"phone"\s*:\s*"([^"]+)"/g)) addPhone(mm[1]);
      }
      for (const tr of t.tool_results ?? []) {
        const raw = typeof tr.result_value === 'string' ? tr.result_value : JSON.stringify(tr.result_value ?? '');
        for (const mm of raw.matchAll(/"(?:departure|arrival)":"(\d{1,2}:\d{2})"/g)) {
          sawTripTool = true;
          allowed.add(mm[1].padStart(5, '0'));
        }
        // Телефоны из тулов: 373XXXXXXXX → локальный 0XXXXXXXX (как их диктует phone_spoken).
        for (const mm of raw.matchAll(/"phone":"\+?(\d{8,12})"/g)) {
          const digits = mm[1];
          allowedPhones.add(digits.startsWith('373') ? '0' + digits.slice(3) : digits);
        }
      }
    }
    if (!sawTripTool) return; // fără date de curse nu avem cu ce compara
    const agentText = turns.filter((t) => t.role === 'agent' && t.message).map((t) => t.message).join('\n');
    for (const spoken of new Set(parseSpokenTimes(agentText))) {
      if (!allowed.has(spoken)) {
        incidents.push({
          conversation_id: recent[i].conversation_id,
          kind: 'spoken_time_mismatch',
          details: { spoken, allowed: [...allowed].sort() },
        });
      }
    }
    // Аналогично для номеров: продиктованное не из тулов = инцидент (жалоба Иона
    // 24.08: не тот водитель/номер при чтении длинного списка).
    for (const spoken of new Set(parseSpokenPhones(agentText))) {
      if (allowedPhones.size > 0 && !allowedPhones.has(spoken)) {
        incidents.push({
          conversation_id: recent[i].conversation_id,
          kind: 'spoken_phone_mismatch',
          details: { spoken, allowed: [...allowedPhones].sort() },
        });
      }
    }
  });
  return incidents;
}

export async function runVoiceController(): Promise<{ drifts: Drift[]; incidents: number }> {
  const t0 = Date.now();
  // ДО чтения канона: гасим алиасы, накрывшие чужое имя (кнопка ✓ у человека may
  // промахнуться), и доливаем выученное в asr_keywords — heal ниже донесёт до EL.
  await auditAliasShadow();
  await syncCanonKeywords();

  // GET-ul listei de tool-uri nu depinde de config — merge în paralel (perf LOW).
  const [cfg, lostTool, complaintTool] = await Promise.all([
    elGet(`/v1/convai/agents/${AGENT_ID}`),
    workspaceTool('find_past_trip'),
    workspaceTool('register_complaint'),
  ]);
  const lostToolId = lostTool?.id ?? null;
  const complaintToolId = complaintTool?.id ?? null;
  // Lista tipurilor pleacă în prompt DOAR dacă tool-ul viu chiar primește câmpul.
  // Promptul se vindecă singur, schema tool-ului se schimbă doar cu scriptul
  // add-find-past-trip-tool.mjs: fără gardul ăsta, blocul ar ajunge primul și
  // modelul ar trimite un câmp pe care platforma îl aruncă tăcut — toate
  // reclamațiile ar cădea pe ALTUL, adică exact tipologia pierdută (audit 02.09).
  const tipuriInTool = complaintTool?.params.includes('complaint_type') ?? false;
  const drifts: Drift[] = [];
  // Fără câmpul ăsta, lucrurile uitate nu se pot lega de apel: rândul nu se
  // scrie, grupa șoferilor nu primește nimic, iar poarta apelului mixt e
  // stinsă — totul TĂCUT, fiindcă schema tool-ului nu se vindecă singură
  // (doar scriptul o rescrie). Măcar jurnalul spune că livrarea e neterminată.
  if (lostTool && !lostTool.params.includes('conversation_id')) {
    drifts.push({ field: 'tools.find_past_trip.conversation_id_missing', healed: false });
  }
  if (complaintTool && !tipuriInTool) {
    drifts.push({ field: 'tools.register_complaint.complaint_type_missing', healed: false });
  }
  // Lecuirea configului cade la fel de «moale» ca vecinele de mai jos: un singur
  // câmp refuzat de EL (422 pe o cheie depreciată, un read-only întors de spread)
  // arunca din tot prögonul — legarea tool-ului, stația RU, validatorul, examenele —
  // și NU lăsa nicio linie în jurnal, doar în logurile Vercel (security review 31.08).
  try {
    await checkAndHealConfig(cfg, drifts, complaintToolId !== null, tipuriInTool);
  } catch (e) {
    // Redactat și aici: logurile Vercel persistă și ele, iar corpul PATCH-ului
    // pentru platform_settings poartă cheia webhook-ului.
    console.error('[voice-controller] heal-config:', redactSecrets(String(e)));
    // Cauza intră în JURNAL, nu doar în logurile efemere Vercel — cu cheia tăiată.
    drifts.push({ field: 'config.heal.error', healed: false, msg: redactSecrets(String(e)).slice(0, 200) });
  }
  try {
    drifts.push(...await healToolBindings(cfg, [
      { id: lostToolId, field: 'tools.find_past_trip' },
      { id: complaintToolId, field: 'tools.register_complaint' },
    ], AGENT_ID));
  } catch (e) {
    console.error('[voice-controller] tool-binding ro:', e);
    drifts.push({ field: 'tools.binding.error', healed: false });
  }

  // RU-агент: точечное лечение станции. Падение RU-ветки не должно ронять прогон.
  try {
    drifts.push(...await healRuStation(lostToolId, complaintToolId, tipuriInTool));
  } catch (e) {
    console.error('[voice-controller] ru-station:', e);
    // În jurnal, nu doar în log: altfel o cheie/ID căzut tace 48 de prognoane/zi.
    drifts.push({ field: 'ru.station.error', healed: false });
  }

  const incidents = await validateRecentCalls();
  const supabase = getSupabase();
  for (const d of drifts) {
    // Dedupe 24h pentru drift-uri (n-au conversation_id — indexul unic nu le acoperă):
    // altfel un URL nevindecat intenționat ar umple jurnalul la fiecare 30 min.
    // `healed` intră în cheie: altfel o linie «nevindecat» (PATCH căzut) ar înghiți
    // o zi linia sinceră de peste 30 de minute, când lecuirea chiar reușește.
    const { data: recent } = await supabase.from('voice_controller_incidents')
      .select('id').eq('kind', d.field.startsWith('prompt.') ? 'prompt_drift' : 'config_drift')
      .eq('details->>field', d.field)
      .eq('healed', d.healed)
      .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .limit(1);
    if (recent?.length) continue;
    await supabase.from('voice_controller_incidents').insert({
      kind: d.field.startsWith('prompt.') ? 'prompt_drift' : 'config_drift',
      details: d,
      healed: d.healed,
    });
  }
  for (const inc of incidents) {
    // Vorbirea deja rostită nu se vindecă — healed=false întotdeauna aici.
    // Indexul unic de dedupe respinge dublurile (23505) — le înghițim tăcut.
    const { error } = await supabase.from('voice_controller_incidents')
      .insert({ ...inc, healed: false });
    if (error && error.code !== '23505') console.error('[voice-controller] insert:', error.message);
  }

  // Экзамены: дочитать прогон, который судья не успел (claim атомарный). Гейт по
  // бюджету: в дорогом прогоне (heal+валидатор упёрлись в таймауты EL) драйн
  // пропускается — он идемпотентен и повторится через 30 минут (perf-ревью).
  if (Date.now() - t0 < 35_000) await drainPendingExams();

  return { drifts, incidents: incidents.length };
}
