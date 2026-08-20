# Ověření projektu

## Webový náhled

Dne 20. srpna 2026 byl v prohlížeči ověřen náhled na kořenové URL webové aplikace. Zobrazilo se jméno **SongCraft Studio**, uzamčená přihlašovací obrazovka a spodní navigace pro Přehled, Texty, Alba, Knihovnu a Nastavení. Uzamčený stav je očekávaný: cloudová data jsou dostupná až po autentizaci vlastníka.

Před ověřením byla upravena konfigurace webového běhu. Statický exportní režim byl odstraněn z vývojové konfigurace a souběžný proces již neukončuje server při korektním dokončení jedné pomocné úlohy Metra.

## Automatická kontrola

Byly úspěšně spuštěny příkazy `pnpm check`, `pnpm test` a `pnpm lint`. Vitest ověřil datový model SongCraft Studio ve dvou testech; původní test odhlášení zůstává záměrně přeskočený, protože vyžaduje samostatný autentizační kontext šablony.
