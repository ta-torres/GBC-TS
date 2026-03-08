# GBC-TS

GBC-TS is a Game Boy and Game Boy Color emulator written in TypeScript and React. You can try out the project live at https://gbc-ts.vercel.app

## Features

- Compatible with ROM-Only, MBC1, MBC3 and MBC5 cartridges
- Game Boy Color support
- Sound (WIP)
- Mobile-friendly: Draggable d-pad, haptic feedback and custom fullscreen mode
- Emulation speed controls (Q/W on desktop)
- Save data persisted in localStorage
- Debug features: VRAM & Sprites viewer, D-pad pointer position, performance overlay and frame/instruction stepping
- Unit test coverage using Vitest

## How to play

Visit https://gbc-ts.vercel.app and load your own game backup in a .gb format.

On desktop, use Z/X for B/A buttons, Shift/Enter for Start/Select, arrow keys for D-pad. Q/W (or +/-) for speed controls.

To run the emulator on a dev environment read below

## Why TypeScript and React?

I mean, _why not?_

TypeScript makes emulator development surprisingly approachable, with strong typing, tooling like Vitest and the browser's debugger to catch errors early. This setup lets me focus on learning the low-level concepts around emulation and the Game Boy's hardware, while making the implementation and debugging of certain features more straightforward, modularized and easy to test.

For a project of this size that targets both desktop and mobile, React, shadcn-ui and TailwindCSS made the most sense to ship a polished UI and UX with relative ease, not to mention that it's what I'm familiar with and I like.

## Compatibility

Most Game Boy games rely on a Memory Bank Controller, a chip inside their cartridge that manages which parts of the game's assets are exposed to the Game Boy's limited memory at any given time. These chips allow the use of larger ROMs, and some of them even implement additional on-cartridge RAM.

So far I implemented the behavior of MBC1, MBC3 and MBC5 chips. I'm not able to test every single game, but in theory most titles using these cartridge types should work (which is about 95%+ of the console's library including most critically acclaimed titles). Some games that require a stricter emulation of the console's timer or rendering might contain graphical glitches.

Game Boy Color is supported, games boot and are playable, still work in progress though.

For copyright reasons game backups are not included, so you have to provide your own .gb files

### Known compatible games

```markdown
Tetris
Super Mario Land
Kirby's Dream Land
Pokémon Red/Blue (USA/Europe)
The Legend of Zelda: Link's Awakening
Donkey Kong Land
Mega Man
```

A full list of games sorted by cartridge type can be found at https://gbhwdb.gekkio.fi/cartridges/gb.html

## Savedata

Saves are automatically stored on your browser's storage whenever a write to SRAM is detected, which means games that contain a save feature will keep their data the next time you open the page.

Save data can be exported as a .json file to transfer saves across devices. This is exclusively stored on localStorage so beware that clearing browser's cookies/site data will delete the saves unless exported.

## How to run the project locally

Assuming that [Git](https://www.theodinproject.com/lessons/foundations-setting-up-git) and [Node/npm](https://www.theodinproject.com/lessons/foundations-installing-node-js) are already installed, clone the repository and run the dev server

Clone the repository and enter the folder

```bash
git clone https://github.com/ta-torres/GBC-TS.git
cd GBC-TS
```

Install dependencies

```bash
npm install
```

Run the local http server

```bash
npm run dev
```

If you wish to run the unit/integration tests through Vitest

```bash
npm run test
```

## Features to add

- [ ] Sound - WIP
  - [ ] CH1
  - [x] CH2
  - [x] CH3
  - [ ] CH4
- [x] Game Boy Color support - WIP
  - [x] CGB mode detection + CPU post-boot registers wiring
  - [x] VRAM/WRAM banking (VBK/SVBK)
  - [x] CGB BG palette registers + mapping (BCPS/BCPD)
  - [x] CGB OBJ palette registers + mapping (OCPS/OCPD)
  - [x] BG additional attributes (per-tile priority, tile bank) + CGB BG/WIN behavior
  - [x] CGB BG-to-OBJ priority rules
  - [x] Double-speed mode (KEY1) + 0x10 STOP handling
  - [x] HDMA registers + H-Blank VRAM DMA transfers (HDMA1-5)
  - [x] MBC5 support
- [ ] Controller support
- [ ] Custom button mapping
- [ ] MBC1M multi-game compilation carts
- [ ] MBC1 odd size roms

## Testing

In addition to unit tests written with Vitest, test roms were used to validate some of the emulator's functionality

CPU (blargg's test roms)

| cpu_instrs         | Passes |
| ------------------ | ------ |
| special            | ✔️     |
| interrupts         | ✔️     |
| op sp,hl           | ✔️     |
| op r,imm           | ✔️     |
| op rp              | ✔️     |
| ld r,r             | ✔️     |
| jr,jp,call,ret,rst | ✔️     |
| misc instrs        | ✔️     |
| op r,r             | ✔️     |
| bit ops            | ✔️     |
| op a,(hl)          | ✔️     |

| **instr_timing**  | ✔️  |
| ----------------- | --- |
| **mem_timing**    | ❌  |
| **oam_bug**       | ✔️  |
| **halt_bug test** | ✔️  |

MBC1 (Mooneye-test-suite)

| MBC1              | Passes |
| ----------------- | ------ |
| bits_bank1        | ✔️     |
| bits_bank2        | ✔️     |
| bits_mode         | ✔️     |
| bits_ramg         | ✔️     |
| multicart_rom_8Mb | ❌     |
| ram_64kb          | ✔️     |
| ram_256kb         | ✔️     |
| rom_1Mb           | ❌     |
| rom_2Mb           | ❌     |
| rom_4Mb           | ✔️     |
| rom_8Mb           | ✔️     |
| rom_16Mb          | ✔️     |
| rom_512kb         | ❌     |

PPU

| PPU       | Passes                                     |
| --------- | ------------------------------------------ |
| dmg-acid2 | ✔️ (window internal line counter mismatch) |
| cgb-acid2 | ✔️ (window internal line counter mismatch) |

Game Boy Color Mode (MagenTests)

| PPU                   | Passes |
| --------------------- | ------ |
| bg_oam_priority       | ✔️     |
| hblank_vram_dma       | ✔️     |
| key0_lock_after_boot  | ✔️     |
| mbc_oob_sram_mbc1     | ✔️     |
| mbc_oob_sram_mbc3     | ✔️     |
| oam_internal_priority | ✔️     |
| ppu_disabled_state    | ✔️     |
