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
import { AGENT_ID, RU_AGENT_ID, elGet, elPatchAgent } from '@/lib/voice/el';
import { drainPendingExams } from '@/lib/voice-exams';
import { RO_UNITS, RO_TENS, RU_UNITS, RU_TENS } from '@/lib/time-spoken';

const INIT_WEBHOOK_URL = 'https://central-hub-md.vercel.app/api/voice/webhooks/init';
const CUSTOM_LLM_URL = 'https://translux-voice-llm.vercel.app/api';
const MAX_CALLS_PER_RUN = 8;

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
const PROMPT_MARKERS = ['ORELE — DOSLOVEN', 'UNIVERSUL localităților', 'Doriți numărul lui?', 'A DOUA OARĂ LA RÂND', 'ZIUA — DOSLOVEN', 'e un CORIDOR', 'SFÂRȘIT NUME RUSEȘTI', 'APEL ÎNAPOI — NICIO PROMISIUNE', 'STAȚIA CHIȘINĂU — AUTOGARA TRANSLUX', 'STAȚIA BĂLȚI — PEROANELE', 'ORA SOSIRII — NU SE SPUNE', 'LUCRURI UITATE — DOAR ȘOFERUL IDENTIFICAT', 'CÂMPURILE _RU — DOAR ÎN REPLICI RUSEȘTI'];
const ORELE_BLOCK = `

ORELE — DOSLOVEN DIN TOOL:
- Ora plecării o rostești DOAR din câmpul departure_spoken_ro (română) / departure_spoken_ru (rusă) al rezultatului tool-ului — cuvânt cu cuvânt. NU converti niciodată singur HH:MM în cuvinte.
- CEA MAI APROPIATĂ / PRIMA cursă = PRIMUL element din câmpul departures_ro (română) / departures_ru (rusă) — ultimul element = ultima. Enumerarea curselor o citești DIN ACEST câmp, în ordinea dată. NU alege «cea mai apropiată» scanând singur lista.
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
- Dacă clientul numește O SINGURĂ localitate, celălalt capăt e cel mai probabil Chișinău — NU întreba «spre unde?», caută așa.`;

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
const LUCRURI_BLOCK = `

LUCRURI UITATE — DOAR ȘOFERUL IDENTIFICAT:
- Clientul a uitat sau a pierdut ORICE obiect în autobuz (geantă, telefon, acte, pachet)? Obiectul rămâne la șofer. Tu identifici șoferul corect și dai clientului numărul lui — atât.
- Folosește DOAR tool-ul find_past_trip, NICIODATĂ search_trips: search_trips vede doar cursele viitoare, cursa cu obiectul a plecat deja.
- Strânge ce știe clientul (maximum 3 întrebări, câte una pe replică): ruta, ziua («ieri», «alaltăieri», ziua săptămânii — trimite CUVÂNTUL în «date», serverul îl rezolvă înapoi), ora aproximativă («departure»), numărul mașinii («plate», merge și parțial), numele șoferului («driver_name»).
- count = 1 → citește DOSLOVEN driver_line_ro / driver_line_ru.
- count > 1 → enumeră candidații și cere detaliul care alege unul; recheamă tool-ul. Numărul se dă DOAR la UN singur candidat.
- count = 0 → citește DOSLOVEN company_phone_line_ro / company_phone_line_ru. Excepție: răspunsul are unknown_locality — atunci ÎNTÂI clarifici localitatea după mesajul lui și recherci. NU da NICIODATĂ numărul unui șofer «apropiat» sau «de pe aceeași rută» — e un om străin de problema clientului.
- need_more = true → pui întrebarea din result_ro/result_ru și rechemi tool-ul cu răspunsul. NU citești company_phone_line și NU închizi discuția.
- NU promite că suni tu șoferul, că cineva caută obiectul sau că cineva sună înapoi. NU spune «am notat».
- NU chema request_callback pentru lucruri uitate — regula generală «nu ai informația → oferă request_callback» NU se aplică aici: cazul se rezolvă cu find_past_trip.`;

const LUCRURI_MARKER_RU = 'ЗАБЫТЫЕ ВЕЩИ — ТОЛЬКО ОПОЗНАННЫЙ ВОДИТЕЛЬ';
const LUCRURI_BLOCK_RU = `

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
  // Rândul VIU din blocul ORELE (28.08, побайтово din promptul agentului — ATENȚIE:
  // blocul viu a fost editat de mână și DIFERĂ de constanta ORELE_BLOCK de mai sus,
  // «singură» vs «singur»). Învăța cum se rostește sosirea — anulat: interdicție
  // absolută. Înlocuirea (doar plecarea) stă în SOSIREA_BLOCK.
  '\n- Ora plecării/sosirii o rostești DOAR din câmpul departure_spoken_ro (română) / departure_spoken_ru (rusă) al rezultatului tool-ului — cuvânt cu cuvânt. La fel arrival_spoken_*. NU converti niciodată singură HH:MM în cuvinte.',
];

type Drift = { field: string; healed: boolean };

// Tool-ul lucrurilor uitate e workspace tool legat prin tool_ids — dashboard-ul îl
// poate dezlega tăcut, iar promptul ar cere atunci un tool inexistent (review M6).
// Id-ul se caută o dată pe rulare; lipsa TOOL-ului din workspace = drift nevindecat
// (crearea e treaba scriptului add-find-past-trip-tool.mjs, nu a controlerului).
async function findPastTripToolId(): Promise<string | null> {
  try {
    const list = await elGet('/v1/convai/tools?search=find_past_trip&page_size=10');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hit = (((list as any).tools ?? []) as any[]).find((t) => t.tool_config?.name === 'find_past_trip');
    return hit?.id ?? null;
  } catch { return null; }
}

// Relegarea tool-ului dacă a dispărut din tool_ids. PATCH separat de restul
// (tool_ids e listă — merge-ul per-cheie o înlocuiește integral, deci trimitem
// lista completă). Idempotent: legat deja = niciun apel.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function healToolBinding(cfg: any, toolId: string | null, agentId: string, fieldPrefix: string): Promise<Drift[]> {
  if (!toolId) return [{ field: `${fieldPrefix}.workspace_tool_missing`, healed: false }];
  const ids: string[] = cfg?.conversation_config?.agent?.prompt?.tool_ids ?? [];
  if (ids.includes(toolId)) return [];
  await elPatchAgent({ conversation_config: { agent: { prompt: { tool_ids: [...ids, toolId] } } } }, agentId);
  return [{ field: `${fieldPrefix}.tool_ids`, healed: true }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkAndHealConfig(cfg: any): Promise<Drift[]> {
  const drifts: Drift[] = [];
  const ps = cfg.platform_settings ?? {};
  const cc = cfg.conversation_config ?? {};

  // --- platform_settings: un singur PATCH pentru tot ce a deviat ---
  const psPatch: Record<string, unknown> = {};
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
    drifts.push({ field: 'overrides.webhook_flags', healed: true });
  }
  const wh = ps.workspace_overrides?.conversation_initiation_client_data_webhook;
  if (wh?.url !== INIT_WEBHOOK_URL || !wh?.request_headers?.['x-voice-api-key']) {
    psPatch.workspace_overrides = {
      conversation_initiation_client_data_webhook: {
        url: INIT_WEBHOOK_URL,
        request_headers: { 'x-voice-api-key': process.env.VOICE_API_KEY ?? '' },
      },
    };
    drifts.push({ field: 'init_webhook_url', healed: true });
  }
  if (Object.keys(psPatch).length) await elPatchAgent({ platform_settings: psPatch });

  if (cc.agent?.prompt?.custom_llm?.url !== CUSTOM_LLM_URL) {
    drifts.push({ field: 'custom_llm.url', healed: false }); // URL-ul se schimbă doar de om — nu-l «vindecăm» orb
  }

  // --- conversation_config: la fel, un singur PATCH ---
  const ccPatch: Record<string, unknown> = {};
  const canon = await canonKeywords();
  const kw: string[] = cc.asr?.keywords ?? [];
  if (kw.join('|') !== canon.join('|')) {
    ccPatch.asr = { ...cc.asr, keywords: canon };
    drifts.push({ field: 'asr.keywords', healed: true });
  }
  const bg = cc.conversation?.background_sound;
  if (bg?.source_id !== 'office1' || bg?.volume !== 0.1) {
    ccPatch.conversation = {
      ...cc.conversation,
      background_sound: { source_type: 'preset', source_id: 'office1', volume: 0.1, crossfade_loop: true },
    };
    drifts.push({ field: 'background_sound', healed: true });
  }
  const prompt: string = cc.agent?.prompt?.prompt ?? '';
  const missing = PROMPT_MARKERS.filter((m) => !prompt.includes(m));
  // Blocurile auto-vindecabile se adaugă în COADĂ, idempotent după marker. Poziția NU
  // salvează cache-ul (punctul de cache e unul singur, pe tot system-ul) — de aceea
  // blocurile trebuie să rămână statice, fără variabile care se schimbă în timpul apelului.
  const HEALABLE = [
    { marker: 'ORELE — DOSLOVEN', block: ORELE_BLOCK, field: 'prompt.ORELE' },
    { marker: 'ZIUA — DOSLOVEN', block: DATA_BLOCK, field: 'prompt.ZIUA' },
    { marker: 'e un CORIDOR', block: CORIDOR_BLOCK, field: 'prompt.CORIDOR' },
    { marker: 'A DOUA OARĂ LA RÂND', block: LIMBA_BLOCK, field: 'prompt.LIMBA' },
    { marker: 'APEL ÎNAPOI — NICIO PROMISIUNE', block: CALLBACK_ORDER_BLOCK, field: 'prompt.CALLBACK_ORDER' },
    { marker: 'STAȚIA CHIȘINĂU — AUTOGARA TRANSLUX', block: STATIA_BLOCK, field: 'prompt.STATIA' },
    { marker: 'STAȚIA BĂLȚI — PEROANELE', block: BALTI_BLOCK, field: 'prompt.BALTI' },
    { marker: 'ORA SOSIRII — NU SE SPUNE', block: SOSIREA_BLOCK, field: 'prompt.SOSIREA' },
    { marker: 'LUCRURI UITATE — DOAR ȘOFERUL IDENTIFICAT', block: LUCRURI_BLOCK, field: 'prompt.LUCRURI' },
    { marker: 'CÂMPURILE _RU — DOAR ÎN REPLICI RUSEȘTI', block: CAMPURI_RU_BLOCK, field: 'prompt.CAMPURI_RU' },
  ];
  let healedPrompt = prompt;
  for (const ob of OBSOLETE_BLOCKS) {
    if (healedPrompt.includes(ob)) {
      healedPrompt = healedPrompt.replace(ob, '');
      drifts.push({ field: 'prompt.obsolete_removed', healed: true });
    }
  }
  for (const h of HEALABLE) {
    if (missing.includes(h.marker)) {
      healedPrompt += h.block;
      drifts.push({ field: h.field, healed: true });
    }
  }
  if (healedPrompt !== prompt) ccPatch.agent = { prompt: { prompt: healedPrompt } };
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
    drifts.push({ field: 'cascade_timeout_seconds', healed: true });
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
    drifts.push({ field: 'language_detection.description', healed: true });
  }
  if (Object.keys(ccPatch).length) await elPatchAgent({ conversation_config: ccPatch });

  return drifts;
}

// Лечение RU-агента: ТОЛЬКО станция (см. комментарий у STATIA_BLOCK_RU).
// Идемпотентно: надгробие — точное совпадение, блок — по маркеру.
async function healRuStation(lostToolId: string | null): Promise<Drift[]> {
  const cfg = await elGet(`/v1/convai/agents/${RU_AGENT_ID}`);
  // Legarea find_past_trip la RU — pe config-ul deja citit, fără GET suplimentar.
  const bindDrifts = await healToolBinding(cfg, lostToolId, RU_AGENT_ID, 'ru.tools.find_past_trip');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prompt: string = (cfg as any).conversation_config?.agent?.prompt?.prompt ?? '';
  if (!prompt) return [...bindDrifts, { field: 'ru.prompt.empty', healed: false }];
  let healed = prompt;
  if (healed.includes(STATIA_OBSOLETE_RU)) healed = healed.replace(STATIA_OBSOLETE_RU, '');
  if (healed.includes(BALTI_OBSOLETE_RU)) healed = healed.replace(BALTI_OBSOLETE_RU, '');
  if (healed.includes(SOSIREA_OBSOLETE_RU)) healed = healed.replace(SOSIREA_OBSOLETE_RU, '');
  if (healed.includes(SOSIREA2_OBSOLETE_RU)) healed = healed.replace(SOSIREA2_OBSOLETE_RU, '');
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
  if (healed === prompt) return bindDrifts;
  await elPatchAgent({ conversation_config: { agent: { prompt: { prompt: healed } } } }, RU_AGENT_ID);
  return [...bindDrifts, ...(vindecate.length ? vindecate : ['ru.prompt.STATIA']).map((f) => ({ field: f, healed: true }))];
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
  const [cfg, lostToolId] = await Promise.all([
    elGet(`/v1/convai/agents/${AGENT_ID}`),
    findPastTripToolId(),
  ]);
  const drifts = await checkAndHealConfig(cfg);
  try {
    drifts.push(...await healToolBinding(cfg, lostToolId, AGENT_ID, 'tools.find_past_trip'));
  } catch (e) {
    console.error('[voice-controller] tool-binding ro:', e);
    drifts.push({ field: 'tools.find_past_trip.error', healed: false });
  }

  // RU-агент: точечное лечение станции. Падение RU-ветки не должно ронять прогон.
  try {
    drifts.push(...await healRuStation(lostToolId));
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
    const { data: recent } = await supabase.from('voice_controller_incidents')
      .select('id').eq('kind', d.field.startsWith('prompt.') ? 'prompt_drift' : 'config_drift')
      .eq('details->>field', d.field)
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
