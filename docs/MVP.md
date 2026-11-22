# MVP – TYPE RUSH

## Prinzip
Race mit fester Zeit: Alle Spieler tippen denselben Text gleichzeitig; die höchste
**Wertung** (Tempo + Tasten-Genauigkeit) gewinnt. Lernen ist first-class: Die UI zeigt
immer, welcher Finger die nächste Taste drücken soll (**Finger-Hinweis**, zählt NICHT in
die Wertung – Fingerwahl ist nicht messbar).

## Technik
- TypeScript end-to-end; Node.js-Server + WebSocket; Frontend als TS-SPA (vanilla DOM, kein Framework).
- Ein Server-Process läuft auf einer Maschine im LAN (z. B. dem Laptop des Vortragenden);
  alle verbinden per Browser. Server ist **autoritativ** (erhält jeden Tastendruck,
  berechnet Zustand). Kein Cloud, keine Accounts, kein NAT-Traversal. **Kein
  Host-Spieler:** Jeder, der die URL öffnet, ist Zuschauer und kann sich für die nächste
  Runde anmelden. (ADR 0001)
- Spieler finden den Server über die auf dem Bildschirm gezeigte URL (http://192.168.x.x:port).
  **Nur URL, kein QR-Code.**

## Spieler & Ablauf
- 2–8 Spieler (für 2–4 optimiert); jeder gibt beim Beitritt einen **Nickname** ein und
  landet in der **Lobby** als Zuschauer.
- **Automatischer Ablauf, kein Host:** Lobby (30s-Teilnahme-Timer, läuft nur mit ≥1
  angemeldetem Spieler; bei 8 Spielern sofort) → Countdown (5s) → Runde (60s) →
  Ergebnisse (10s) → Lobby. Spieler drücken „Mitspielen“; Start und nächste Runde laufen
  von allein.

## Runde
- Feste Dauer: **60s**. (ADR 0002)
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
**DRIN:** ein fester Zeit-Race-Modus · deutscher Wörter/Sätze · 2–8 Spieler · URL-Beitritt ·
Nickname · Auto-Start (Lobby-Timer + Countdown) · Wertung (Tempo+Genauigkeit) ·
Finger-Hinweise · Live-Leaderboard · Ergebnis-Anzeige · endloser Lobby-Zyklus.
**RAUS:** Accounts · Persistenz/Highscores · Sound · mehrere Content-Packs · Koop-Modus ·
separates Lern-Modus · Host-Rolle / manueller Start.
