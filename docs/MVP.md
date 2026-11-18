# MVP – Blind-Tippen Multiplayer

## Prinzip
Race mit fester Zeit: Alle Spieler tippen denselben Text gleichzeitig; die höchste
**Wertung** (Tempo + Tasten-Genauigkeit) gewinnt. Lernen ist first-class: Die UI zeigt
immer, welcher Finger die nächste Taste drücken soll (**Finger-Hinweis**, zählt NICHT in
die Wertung – Fingerwahl ist nicht messbar).

## Technik
- TypeScript end-to-end; Node.js-Server + WebSocket; Frontend als TS-SPA (vanilla DOM, kein Framework).
- Ein Host betreibt den Server; alle (inkl. Host) verbinden per Browser. Server ist
  **autoritativ** (erhält jeden Tastendruck, berechnet Zustand). Kein Cloud, keine Accounts,
  kein NAT-Traversal. Host bleibt fix – geht er, endet das Spiel. (ADR 0001)
- Spieler finden den Host über die auf dem Bildschirm gezeigte URL (http://192.168.x.x:port).
  **Nur URL, kein QR-Code.**

## Spieler & Ablauf
- 2–8 Spieler (für 2–4 optimiert); jeder gibt beim Beitritt einen **Nickname** ein; Host sieht
  alle in der **Lobby**.
- **Kein Countdown.** Das **Start-Recht** rotiert unter den Spielern (frühester Beitretender
  zuerst, dann nächste). Eine Runde kann mit 1+ Spielern starten (Solo-Praxis).

## Runde
- Feste Dauer, **60s Standard**, vom Host wählbar (30/60/120s). (ADR 0002)
- Text: **kuratierte, mitgelieferte Liste** häufiger deutscher Wörter/Sätze (QWERTZ),
  zufällig pro Runde; Länge an die Rundenzeit kalibriert (~60–80 Zeichen für 60s, damit ein
  guter Tipper knapp vor Ablauf fertig wird).
- **Fehler-Verhalten (blockierend, Monkeytype-Stil):** Falsche Taste → Cursor bleibt, Stelle
  rot, korrekte Taste nötig; jeder Fehldruck zählt in die Genauigkeit. (ADR 0003)

## UI (pro Spieler)
1. Großer Text mit Highlight auf dem nächsten Zeichen
2. Finger-Diagramm (welcher Finger)
3. Live-Leaderboard (Fortschritt + Wertung)
4. Eigene WPM / Genauigkeit

## Wertung
Tempo + Tasten-Genauigkeit. Langsam + korrekt kann schnell + ungenau schlagen.

## Scope v1
**DRIN:** ein fester Zeit-Race-Modus · deutsche Wörter/Sätze · 2–8 Spieler · URL-Beitritt ·
Nickname · Wertung (Tempo+Genauigkeit) · Finger-Hinweise · Live-Leaderboard · Ergebnis-Anzeige.
**RAUS:** Accounts · Persistenz/Highscores · Sound · mehrere Content-Packs · Koop-Modus ·
separates Lern-Modus.
