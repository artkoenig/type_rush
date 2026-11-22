# TYPE RUSH

Ein lokales Multiplayer-Spiel zum Erlernen des Blind-Tippens: Spieler tippen im Browser
gegeneinander, koordiniert von einem Server im lokalen Netz.

## Language

**Runde**:
Eine Spielinstanz mit fester Dauer (60s), in der alle angemeldeten Spieler denselben Text
tippen; die beste Wertung gewinnt. Startet automatisch mit 2+ Spielern (sofort bei 8).
_Avoid_: Match, Game, Session

**Wertung**:
Pro Spieler berechnete Zahl, die Tempo und Tasten-Genauigkeit kombiniert.

**Finger-Hinweis**:
UI-Anzeige, die zeigt, welcher Finger die nächste Taste drücken soll. Zählt nicht in der
Wertung (Fingerwahl ist nicht messbar) – reine Lernhilfe.

**Lobby**:
Der Wartebereich zwischen den Runden. Spieler treten als Zuschauer bei und melden sich für
die nächste Runde an; ein 30s-Teilnahme-Timer läuft, solange mindestens ein Spieler
angemeldet ist.

**Auto-Start**:
Der Ablauf, durch den das Spiel ohne Host von selbst läuft: Lobby-Timer (30s) → Countdown
(5s) → Runde → Ergebnisse (10s) → Lobby. Er ersetzt das frühere Start-Recht.
_Avoid_: Start-Recht, Session-Start

**Server**:
Die Maschine, auf der der Spiel-Server läuft (z. B. der Laptop des Vortragenden); alle
Spieler verbinden sich per Browser. Es gibt keinen Host-Spieler – jeder Browser ist
Zuschauer, der sich für Runden anmelden kann.
_Avoid_: Host

**Fehler-Verhalten**:
Falsche Taste blockiert: Cursor bleibt, Stelle rot, korrekte Taste nötig; jeder Fehldruck
zählt in die Tasten-Genauigkeit. (ADR 0003)
