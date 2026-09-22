# Promptul Cristinei scurtat (ION-32, 22.09.2026)

Sursa adevărului pentru prompt rămâne AGENTUL VIU (decizia lui Ion, 31.08). Fișierele de aici sunt copii: `*-before.txt` e promptul viu dinainte, `*-after.txt` cel pus prin PATCH. Pentru rollback se pune `*-before.txt` înapoi prin PATCH pe `conversation_config.agent.prompt.prompt`.

| Agent | Înainte | După |
|---|---|---|
| RO `agent_3301kn4qwa6jep38d4b63m6s6pkh` | 35 792 | 25 755 (−28 %) |
| RU `agent_9101m0t3ej97ekttf2matgf203p9` | 30 132 | 21 930 (−27 %) |

Ce s-a scos: regulile dublate între secțiuni (reclamații generale vs blocul RECLAMAȚIA, operator, telefoane, tool-uri, orele), regulile pe care preambulul proxy-ului (`apps/voice-llm`) le impune oricum, anecdotele din apeluri reduse la regula lor, titlurile pe trei rânduri.

Examenele (`scripts/voice-agent/run-tests.mjs --prompt-file`, 31 de teste, judecate de LLM, variază cu ±2 de la o rulare la alta):
- RO: înainte 28, 29 · după 29, 26.
- RU (aceleași teste pe agentul RU): înainte 28, 28 · după 28, 29.

Ce a căzut la prima variantă și a fost întors DOSLOVEN din original, fiindcă pica stabil:
- RO: secțiunea LIMBA (agentul trecea pe rusă de la prima frază rusească) și blocul RECLAMAȚIA (spunea «înregistrez» fără să cheme register_complaint).
- RU: blocul ДЕНЬ ВМЕСТО НАСЕЛЁННОГО ПУНКТА și regula «СРАЗУ вызывай register_complaint… НИКОГДА не заканчивай звонок с жалобой, не вызвав его» — ea stătea în secțiunea generală ЖАЛОБЫ (care trimitea greșit la request_callback) și ținea modelul să cheme tool-ul.

Contradicții rămase din original, de hotărât de Ion: fraza de final a reclamației «Am notat toate detaliile» (deși «am notat» e permis doar la angajare/propunere); la lucruri uitate fără cursă se citește company_phone_line, deși «singurul număr e al șoferului»; «orarul unei localități mari din apropiere» vs «nu propui altă rută» din ZI FĂRĂ CURSE.
