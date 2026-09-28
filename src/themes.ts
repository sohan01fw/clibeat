export type Theme = {
  name: string;
  description: string;
  accent: number;
  highlight: number;
  played: number;
  track: number;
  status: number;
};

export const defaultThemes: Theme[] = [
  {
    name: "neon",
    description: "Vibrant cyan and pink",
    accent: 213,
    highlight: 51,
    played: 213,
    track: 240,
    status: 117,
  },
  {
    name: "dracula",
    description: "Purple, pink, and green",
    accent: 141,
    highlight: 212,
    played: 141,
    track: 60,
    status: 114,
  },
  {
    name: "ocean",
    description: "Cool blue and aqua",
    accent: 39,
    highlight: 87,
    played: 45,
    track: 24,
    status: 81,
  },
  {
    name: "amber",
    description: "Warm gold and orange",
    accent: 214,
    highlight: 220,
    played: 208,
    track: 94,
    status: 222,
  },
];
