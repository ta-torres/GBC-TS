# GBC-TS

GBC-TS is a Gameboy emulator written in TypeScript and React. You can try out the project live at https://gbc-ts.vercel.app

## Features

- Compatible with ROM-Only, MBC1 and MBC3 cartridges (over 85%+ of the Game Boy's library)
- Mobile-friendly: Draggable d-pad, haptic feedback and custom fullscreen mode
- Emulation speed controls
- Save data persisted in the browser
- Debug features: VRAM & Sprites viewer, D-pad pointer position, performance overlay and frame/instruction stepping
- Unit test coverage using Vitest

## How to play

Visit https://gbc-ts.vercel.app and load your own game backup in a .gb format

To run the emulator on a dev environment read below

## Why TypeScript and React?

I mean, _why not?_

TypeScript makes emulator development surprisingly approachable, with strong typing, tooling like Vitest and the browser's debugger to catch errors early. This setup lets me focus on learning the low-level concepts around emulation and the Game Boy's hardware, while making the implementation and debugging of certain features more straightforward, modularized and easy to test.

For a project of this size that targets both desktop and mobile, React, shadcn-ui and TailwindCSS made the most sense to ship a polished UI and UX with relative ease, not to mention that it's what I'm familiar with and I like.

## Compatibility

Most Game Boy games rely on a Memory Bank Controller, a chip inside their cartridge that manages which parts of the game's assets are exposed to the Game Boy's limited memory at any given time. These chips allow the use of larger ROMs, and some of them even implement additional on-cartridge RAM.

So far I implemented the behavior of MBC1 and MBC3 chips. I'm not able to test every single game, but in theory most titles using these cartridge types should work (which is about 85%+ of the console's library including most critically acclaimed titles). Some games that require a stricter emulation of the console's timer or rendering might contain graphical glitches.

For copyright reasons game backups are not included, so you have to provide your own .gb files

**Known compatible games**

```
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

```
git clone https://github.com/ta-torres/GBC-TS.git
cd GBC-TS
```

Install dependencies

```
npm install
```

Run the local http server

```
npm run dev
```

If you wish to run the unit/integration tests through Vitest

```
npm run test
```

## Features to add

- [ ] Sound
- [ ] Game Boy Color support
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
