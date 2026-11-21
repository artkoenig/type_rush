// Instanz: 10 Pids (Spieler + Zuschauer-Pool), 2 Texte, 9 Tasten, 10 Nicknames.
// Kleiner als die echten Werte, damit quint run schnell und deterministisch
// genug alle Pfade erkundet. Rester 8 (bleibt 8); feste Rundenlängen 30/5/60.
module blindTyping_3 {
  import blindTyping(
    PIDS = Set(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
    MAX_PLAYERS = 8,
    LOBBY_DURATION = 30,
    COUNTDOWN_DURATION = 5,
    ROUND_DURATION = 60,
    TEXTS = Set(List("a", "b", "c"), List("d", "e", "f", "g", "h")),
    KEYS = Set("a", "b", "c", "d", "e", "f", "g", "h", "x"),
    NICKNAMES = Set("ann", "ben", "carl", "dora", "eve", "fred", "gus", "hal", "ida", "joe")
  ).* from "./blindTyping"
}
