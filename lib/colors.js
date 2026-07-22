// Plutchik emotion -> hex color, hues sourced from Cymbolism's crowdsourced
// word/color associations. Kept as its own tiny module (not part of
// emolex.js) so the browser never has to load the 4,654-word NRC lexicon
// just to render pre-scored words from data/latest.json.
export const C = {
  joy: "#FFE000",
  trust: "#00B0FF",
  fear: "#AA00FF",
  surprise: "#FF4081",
  sadness: "#7986CB",
  disgust: "#C6D400",
  anger: "#FF1744",
  anticipation: "#FF6D00",
};

export const NEUTRAL = "#334e6a";

export function getColor(emotion) {
  return emotion ? C[emotion] || NEUTRAL : NEUTRAL;
}
