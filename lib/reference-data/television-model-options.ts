import type { laptopFamilies } from "./computer-model-options.ts";
export const televisionFamilies: typeof laptopFamilies = {
  samsung: { names: ["QN90D", "S95D", "S90D", "S85D", "QN900D", "QN800D", "QN85D", "The Frame"], source: "https://news.samsung.com/us/samsung-2024-tv-audio-products-now-available-pre-order-music-frame/" },
  lg: { names: ["OLED B4", "OLED C4", "OLED G4", "OLED M4", "OLED B5", "OLED C5", "OLED G5", "OLED M5"], source: "https://www.lg.com/au/why-lgoled/2024-oled-lineup/" },
  sony: { names: ["BRAVIA XR A95L", "BRAVIA XR A90K", "BRAVIA XR A80L", "BRAVIA XR X95L", "BRAVIA XR X90L", "BRAVIA X85L", "BRAVIA X80L", "BRAVIA X75WL", "BRAVIA 7", "BRAVIA 8", "BRAVIA 9"], source: "https://electronics.sony.com/bravia-xr-tv" },
  tcl: { names: ["C645", "C745", "C845", "C655", "C655 PRO", "C755", "C805", "C855", "P745"], source: "https://www.tcl.com/global/en/tvs" },
  hisense: { names: ["U6K", "U7K", "U8K", "U6N", "U7N", "U8N"], source: "https://global.hisense.com/tv/" },
};
