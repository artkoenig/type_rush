// Instanz: 4 Spieler, 2 Texte, 6 Tasten, 4 Nicknames.
// Kleiner als die echten Werte, damit quint run schnell und deterministisch
// genug alle Pfade erkundet.
module blindTyping_3 {
  import blindTyping(
    HOST = 1,
    PLAYERS = Set(1, 2, 3, 4),
    MAX_PLAYERS = 8,
    DURATIONS = Set(30, 60, 120),
    TEXTS = Set(List("a", "b", "c"), List("d", "e", "f", "g", "h")),
    KEYS = Set("a", "b", "c", "d", "e", "f", "g", "h", "x"),
    NICKNAMES = Set("ann", "ben", "carl", "dora")
  ).* from "./blindTyping"
}
