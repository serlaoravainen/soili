---
name: SQL & Supabase Best Practices
globs: ["**/*.sql"]
alwaysApply: true
description: Supabase SQL ja RLS -parhaat käytännöt
---

# Supabase SQL Rules

- Keskity vain siihen tauluun, näkymään, funktioon tai RLS-politiikkaan joka on highlightattu
- Älä palauta koko schema.sql -tiedostoa, jos muutos koskee vain pientä osaa
- Käytä aina PostgreSQL:n oikeaa syntaksia (Postgres 15/16 yhteensopiva)
- Supabasen RLS-politiikoissa käytä `auth.uid()` kun viittaat nykyiseen käyttäjään
- Jos poistat tai muutat funktiota, tarkista myös sen triggerit ja riippuvuudet
- Älä koskaan generoi koodia joka rikkoo Supabasen omia funktioita tai laajennuksia (esim. `uuid_generate_v4()` on jo sisäänrakennettu)