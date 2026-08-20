# Ověření projektu

## Webový náhled

Dne 20. srpna 2026 byl v prohlížeči ověřen náhled na kořenové URL webové aplikace. Zobrazilo se jméno **SongCraft Studio**, uzamčená přihlašovací obrazovka a spodní navigace pro Přehled, Texty, Alba, Knihovnu a Nastavení. Uzamčený stav je očekávaný: cloudová data jsou dostupná až po autentizaci vlastníka.

Před ověřením byla upravena konfigurace webového běhu. Statický exportní režim byl odstraněn z vývojové konfigurace a souběžný proces již neukončuje server při korektním dokončení jedné pomocné úlohy Metra.

## Automatická kontrola

Byly úspěšně spuštěny příkazy `pnpm check`, `pnpm test` a `pnpm lint`. Vitest ověřil datový model SongCraft Studio ve dvou testech; původní test odhlášení zůstává záměrně přeskočený, protože vyžaduje samostatný autentizační kontext šablony.

## Integrovaný MP3 přehrávač

Přehrávač používá multiplatformní modul Expo Audio. V detailu skladby dovoluje zvolit kteroukoli přiřazenou verzi, spustit či pozastavit její poslech a posunout se o deset sekund zpět nebo vpřed. Zobrazuje aktivní verzi, stav načítání, průběh a délku. Přepnutí verze nejprve pozastaví předchozí přehrávání, takže se dvě MP3 nikdy nepřekrývají. Po rozšíření byly znovu úspěšně spuštěny `pnpm check`, `pnpm test` a `pnpm lint`.

## Hodnocení a finální verze

Každá audio verze nyní ukládá hodnocení od nuly do pěti hvězd. Označení hlavní verze je v rámci skladby vždy jedinečné. Označení finální verze současně nastaví zvolenou nahrávku jako hlavní a zruší hlavní i finální příznak ostatních verzí téže skladby, takže katalog, přehrávač a export vždy pracují s jednoznačnou preferovanou nahrávkou. Migrace databáze byla aplikována bez destruktivní změny stávajících dat; dřívější verze začínají s hodnocením nula a bez finálního příznaku.

## Řazení a filtrování katalogu

Detail skladby nyní nabízí přepínač mezi řazením MP3 verzí podle nejlepšího hodnocení a podle nejnovější verze. Knihovna skladeb obsahuje samostatný filtr „Pouze finální“, který zobrazí jen skladby s alespoň jednou verzí označenou jako finální a u výsledků ukazuje název této verze. Po rozšíření byly znovu úspěšně spuštěny `pnpm check`, `pnpm test` a `pnpm lint`.
