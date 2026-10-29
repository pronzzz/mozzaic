"""Built-in palettes. Kept in sync with client/src/lib/palettes.ts."""

from typing import Dict, List

PRESETS: Dict[str, List[str]] = {
    "pico-8": [
        "000000", "1d2b53", "7e2553", "008751", "ab5236", "5f574f", "c2c3c7", "fff1e8",
        "ff004d", "ffa300", "ffec27", "00e436", "29adff", "83769c", "ff77a8", "ffccaa",
    ],
    "sweetie-16": [
        "1a1c2c", "5d275d", "b13e53", "ef7d57", "ffcd75", "a7f070", "38b764", "257179",
        "29366f", "3b5dc9", "41a6f6", "73eff7", "f4f4f4", "94b0c2", "566c86", "333c57",
    ],
    "endesga-32": [
        "be4a2f", "d77643", "ead4aa", "e4a672", "b86f50", "733e39", "3e2731", "a22633",
        "e43b44", "f77622", "feae34", "fee761", "63c74d", "3e8948", "265c42", "193c3e",
        "124e89", "0099db", "2ce8f5", "ffffff", "c0cbdc", "8b9bb4", "5a6988", "3a4466",
        "262b44", "181425", "ff0044", "68386c", "b55088", "f6757a", "e8b796", "c28569",
    ],
    "game-boy": ["0f380f", "306230", "8bac0f", "9bbc0f"],
    "game-boy-pocket": ["000000", "555555", "aaaaaa", "ffffff"],
    "cga": ["000000", "55ffff", "ff55ff", "ffffff"],
    "one-bit": ["000000", "ffffff"],
    "paper": ["2b2129", "f2e8d5"],
    "nord": [
        "2e3440", "3b4252", "434c5e", "4c566a", "d8dee9", "e5e9f0", "eceff4", "8fbcbb",
        "88c0d0", "81a1c1", "5e81ac", "bf616a", "d08770", "ebcb8b", "a3be8c", "b48ead",
    ],
    "vaporwave": ["0d0221", "261447", "541388", "d40078", "ff6c11", "ffd319", "2de2e6", "f6f7f9"],
}
