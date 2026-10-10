# Clipurile bloggerilor pe TikTok / Facebook / Instagram — etapele 1–4

Planul lui Ion: doc claude.ai «Plan bot Telegram – postare video și comentarii» (2MSfo943spWNgcxhwNTiux, 09.10).
Ion, 10.10: «hai să realizăm»; «noi boți avem, putem folosi ce îl avem pentru translux și pentru tlx».

## Ce s-a schimbat față de plan (fapte verificate 10.10)

| În plan | Acum | De ce |
| --- | --- | --- |
| Un supergrup cu 6 topicuri, botul Translux | Două supergrupuri: Translux 1–2 (botul Translux), TLX 1–4 (botul TLX) | Ion, 10.10 |
| Server propriu Telegram Bot API (2 GB) | Descărcare prin MTProto cu același token, doar cât ține descărcarea | serverul propriu cere `logOut`: botul operatorilor și al biletelor ar trece cu totul pe el |
| API-ul Meta pentru stories și comentarii | Upload-Post face și stories (`media_type=STORIES`), și comentariile (inclusiv TikTok) | docs.upload-post.com/api/upload-video, /api/comments |
| Comentariile TikTok după aprobarea TikTok Business | Prin Upload-Post, contul reconectat cu dreptul `comments` | idem |
| Calendarul în Upload-Post | Calendarul în `social_posts`; clipul pleacă la ora lui, fără `scheduled_date` | Anulează / Mută până în ultimul minut |

## Ce e făcut (etapele 1–4 din plan)

- Migrația 544: `social_topics`, `social_bloggers`, `social_posts` (RLS fără politici, doar botul).
- `apps/bot/src/social/`: comenzile din topic, primirea clipului, textul AI (RO + RU + hashtag-uri, din nota bloggerului și miniatură), calendarul (orele topicului + decalaj de 20 min între topicuri, max N pe zi), butoanele Anulează / Mută / Acum (doar ADMIN), publicatorul (la fiecare minut), urmărirea stării la Upload-Post și confirmarea cu link-uri în topic.
- Releul botului TLX (`TLX PROJECT/bot-server`): clipurile, comenzile și butoanele `soc:` din supergrupul TLX pleacă la `POST /social/v1/tlx` al botului Translux.
- Fără chei, totul merge **în probă**: clipul intră în calendar, la oră botul scrie «🧪 Probă: acum ar fi plecat pe …».

## Comenzile (în topicul contului, doar ADMIN)

- `/lega_social <profil Upload-Post> tiktok,facebook,instagram` — leagă topicul
- `/blogger` (ca răspuns la un mesaj al bloggerului) · `/blogger_scoate`
- `/social_descriere …` · `/social_ore 12:30,19:30 2` · `/social_hashtag #a #b` · `/social_comentariu …` (sau `-`)
- `/social_oprit` (comută) · `/social` (starea și coada)
- Bloggerul: clipul ca fișier sau video; `#story` în text = story pe Facebook și Instagram (cel mult 60 s).

## Variabilele de mediu

Railway (botul Translux): `UPLOAD_POST_API_KEY`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` (my.telegram.org → API development tools), `TLX_BOT_TOKEN`, `SOCIAL_RELAY_KEY` (≥ 16 caractere).
Render (botul TLX): `SOCIAL_RELAY_URL` = `https://bot-production-6376.up.railway.app/social/v1/tlx`, `SOCIAL_RELAY_KEY` (aceeași). Apoi `GET /set-webhook` (cu `x-admin-key`) ca webhook-ul să primească și `callback_query`.

## Rămas

- Etapa 5–7: comentariile (prin Upload-Post, cu caracterul asistenților) — după ce Ion alege caracterul.
- Story-uri mai lungi de 60 s (tăierea în bucăți) și conversia 4K/HEVC — trebuie ffmpeg în imagine.
- Etapa 8: raportul săptămânal.
- De verificat la prima publicare reală, noaptea: că sesiunea MTProto scurtă nu ia actualizări botului principal.
