/**
 * Kuratierter, mitgelieferter Pool häufiger deutscher Wörter/Sätze für QWERTZ.
 *
 * Alle Einträge verwenden nur QWERTZ-Standardzeichen (Buchstaben inkl. Umlaute,
 * Ziffern, Leerzeichen, übliche Satzzeichen) – keine exotischen Tasten. Sie sind
 * nach ihrer Länge in die drei Runden-Dauer-Buckets (30s, 60s, 120s) eingeordnet.
 */

/** Wählbare Runden-Dauer in Sekunden (ADR 0002). */
export type Duration = 30 | 60 | 120;

/** Alle wählbaren Dauern, in aufsteigender Reihenfolge. */
export const DURATIONS: readonly Duration[] = [30, 60, 120];

/**
 * Ziel-Länge (Zeichen) pro Dauer, lineare Skalierung ~1–1.3 Zeichen/Sekunde:
 * 30s → 30–40, 60s → 60–80, 120s → 120–160.
 */
export const RANGES: Record<Duration, readonly [min: number, max: number]> = {
  30: [30, 40],
  60: [60, 80],
  120: [120, 160],
};

/**
 * Der Text-Pool. Mindestens 20 Einträge, verteilt über alle drei Dauer-Buckets.
 * Die Bucket-Zugehörigkeit ergibt sich aus der Länge (siehe {@link RANGES}).
 */
export const TEXTS: readonly string[] = [
  // 30s (30–40 Zeichen)
  "Der schnelle braune Fuchs springt.",
  "Gute Sätze zum täglichen Üben.",
  "Tippen macht schneller und ruhiger.",
  "Jede Runde bringt ein wenig Übung.",
  "Ruhige Finger tippen sauberer.",
  "Üben macht das Tempo stetig besser.",
  "Der Kurs führt sicher ans Ziel.",
  "Kleine Schritte bringen Fortschritt.",
  // 60s (60–80 Zeichen)
  "Der schnelle braune Fuchs springt über den faulen Hund und zurück.",
  "Gutes Tippen entsteht durch ruhige, gleichmäßige Fingerbewegungen.",
  "Jede Runde bringt ein kleines Stück Übung und ein besseres Tempo.",
  "Wer regelmäßig übt, wird mit der Zeit schneller und präziser.",
  "Der Kurs führt sicher und ruhig ans Ziel der guten Tipp-Technik.",
  "Ruhige Finger und klare Augen machen das tägliche Tippen leichter.",
  // 120s (120–160 Zeichen)
  "Der schnelle braune Fuchs springt über den faulen Hund und rennt dann gemächlich zurück in sein warmes und sicheres Nest.",
  "Gutes Tippen entsteht durch ruhige, gleichmäßige Fingerbewegungen und durch das tägliche, geduldige Üben kleiner Schritte.",
  "Wer regelmäßig übt, wird mit der Zeit schneller und präziser, denn jede Runde bringt ein kleines Stück Fortschritt mit sich.",
  "Ruhige Finger und klare Augen machen das Tippen leichter; so wächst mit jeder Runde ein sicheres, gleichmäßiges Tempo heran.",
  "Das gleichmäßige Tempo entsteht nicht von allein, sondern durch geduldiges Üben, ruhige Finger und die Bereitschaft, Fehler zu lernen.",
  "Jede Runde ist ein kleines Training: Wer ruhig bleibt und auf die Finger achtet, wird mit der Zeit schneller und sauberer.",
];

/**
 * Wählt aus einer Liste ein Element zufällig aus.
 *
 * Pure Helper-Funktion: deterministisch bei seeded RNG.
 *
 * @param items Nicht-leere Liste von Kandidaten.
 * @param rng Zufallsquelle, die eine Zahl in [0, 1) liefert. Standard: `Math.random`.
 * @throws Wenn `items` leer ist.
 */
export function pickRandom<T>(items: readonly T[], rng: () => number = Math.random): T {
  if (items.length === 0) {
    throw new Error("pickRandom: leere Kandidatenliste");
  }
  return items[Math.floor(rng() * items.length)];
}

/**
 * Wählt einen Text aus dem Pool, dessen Länge zur Runden-Dauer passt.
 *
 * Pure Funktion: Für die gegebene Dauer wird der Pool auf Texte im
 * Ziel-Längenbereich gefiltert und daraus einer zufällig ausgewählt.
 *
 * @param duration Runden-Dauer in Sekunden (30 | 60 | 120).
 * @param rng Zufallsquelle, die eine Zahl in [0, 1) liefert. Standard: `Math.random`.
 *            Eine seeded RNG macht die Auswahl deterministisch (für Tests).
 * @throws Wenn der Pool keinen Text im Zielbereich der Dauer enthält.
 */
export function calibrateText(duration: Duration, rng: () => number = Math.random): string {
  const [min, max] = RANGES[duration];
  const candidates = TEXTS.filter((text) => text.length >= min && text.length <= max);
  return pickRandom(candidates, rng);
}
