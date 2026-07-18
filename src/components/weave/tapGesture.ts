/**
 * How far (in CSS px) a pointer can drift between down and up before a tap
 * stops counting as a tap and starts counting as the beginning of a
 * scroll/pan/pinch instead. Shared by WeaveCanvas and HandsBusyView so both
 * "toca el patrón para avanzar" surfaces agree on the same real-finger
 * tolerance — 10px is the same ballpark Android/iOS use for their own touch
 * slop, small enough that it never eats a deliberate tap.
 */
export const TAP_SLOP_PX = 10
