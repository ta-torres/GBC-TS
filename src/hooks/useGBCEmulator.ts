import { useCallback, useEffect, useRef, useState } from "react";
import { GBCEmulator } from "@/emulator/gbcEmulator";
import type { JoypadButton } from "@/emulator/input/joypad";
import { KeyboardInput } from "@/input/keyboardInput";
import { GamepadInput } from "@/input/gamepadInput";
import { InputManager } from "@/input/inputManager";
import { toast } from "sonner";
import { toast as pixelToast } from "@/components/ui/pixelact-ui/toast";
import { AudioOutput } from "@/emulator/frontendAudio/audioOutput";
import type { SlotInfo } from "@/emulator/types/emulator";
import {
  saveSaveState,
  loadSaveState,
  deleteAllSaveStates,
  getSaveStateSlotInfo,
} from "@/emulator/utils/saveStateStorage";
import { useLocalStorage } from "./useLocalStorage";
import {
  CGB_COLOR_PALETTE_OPTIONS,
  DMG_COLOR_PALETTE_OPTIONS,
} from "@/emulator/ppu/palettes";

export const useGBCEmulator = () => {
  const emulatorRef = useRef<GBCEmulator | null>(null);
  const audioOutputRef = useRef<AudioOutput | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [audioConfig, setAudioConfig] = useState({
    enabled: true,
    channels: {
      ch1: true,
      ch2: true,
      ch3: true,
      ch4: true,
    },
  });

  if (!emulatorRef.current) {
    emulatorRef.current = new GBCEmulator();
  }

  if (!audioOutputRef.current) {
    audioOutputRef.current = new AudioOutput();
  }

  const inputManagerRef = useRef<InputManager | null>(null);
  const keyboardInputRef = useRef<KeyboardInput | null>(null);
  const saveStateHandlerRef = useRef<
    ((slot: number) => Promise<void>) | null
  >(null);
  const loadStateHandlerRef = useRef<
    ((slot: number) => Promise<void>) | null
  >(null);

  if (!inputManagerRef.current) {
    inputManagerRef.current = new InputManager(emulatorRef.current);
  }

  if (!keyboardInputRef.current) {
    keyboardInputRef.current = new KeyboardInput();
  }

  const {
    dmgColorPalette,
    cgbColorPalette,
    setDisplayPalette,
    setCgbColorPalette,
    saveSRAM,
    saveRTC,
    saveMemory,
    loadSRAM,
    loadRTC,
    exportSRAMSaves,
    importSRAMSave,
  } = useLocalStorage({ emulatorRef });

  useEffect(() => {
    const emu = emulatorRef.current;
    const audio = audioOutputRef.current;
    if (!emu || !audio) return;

    emu.setAudioConfig({
      enabled: audioConfig.enabled,
      muteCh1: !audioConfig.channels.ch1,
      muteCh2: !audioConfig.channels.ch2,
      muteCh3: !audioConfig.channels.ch3,
      muteCh4: !audioConfig.channels.ch4,
    });
    audio.setEnabled(audioConfig.enabled);
  }, [audioConfig]);

  useEffect(() => {
    let rafId = 0;
    const CYCLES_PER_FRAME = 70224;

    const CLOCK_HZ = 4194304;
    const FPS = CLOCK_HZ / CYCLES_PER_FRAME;

    const FRAME_MS = 1000 / FPS;
    const MAX_FRAMES_PER_RAF = 3;

    let previousFrameTimestamp: number | null = null;
    let accumulatedTimeMs = 0;

    // RTC catch-up if the emulator was in the background. This is to avoid the RTC being out of sync with real time when the user comes back to the tab after some time.
    const BACKGROUND_GAP_THRESHOLD_MS = 1000;

    const loop = (timestampMs: number) => {
      if (previousFrameTimestamp === null) {
        previousFrameTimestamp = timestampMs;
      }

      const rawDeltaMs = timestampMs - previousFrameTimestamp;
      previousFrameTimestamp = timestampMs;

      if (rawDeltaMs >= BACKGROUND_GAP_THRESHOLD_MS) {
        emulatorRef.current?.advanceRTCTime(rawDeltaMs);
      }

      // clamp maximum time to avoid catching up emulation itself when idle
      const deltaTimeMs = Math.min(250, rawDeltaMs);

      /* 
      Gamepad API needs to poll its input state. This is done every frame, even when the emulator is paused, so that button releases are not "stuck" while paused.
      */
      inputManagerRef.current?.update();

      const emulator = emulatorRef.current;
      if (emulator && emulator.isRunning() && !emulator.isPaused()) {
        accumulatedTimeMs += deltaTimeMs;

        // only step frames if within the current budget for a loop iteration and there is at least one emulated frame worth of time
        let catchUpFrames = 0;
        while (
          accumulatedTimeMs >= FRAME_MS &&
          catchUpFrames < MAX_FRAMES_PER_RAF
        ) {
          emulator.stepFrameCycle();
          accumulatedTimeMs -= FRAME_MS;
          catchUpFrames += 1;
        }

        if (catchUpFrames === MAX_FRAMES_PER_RAF) accumulatedTimeMs = 0;

        audioOutputRef.current?.pump();
      } else {
        accumulatedTimeMs = 0;
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [audioConfig.enabled]);

  // don't recreate on render
  const ensureAudioStarted = useCallback(async () => {
    const emu = emulatorRef.current;
    const audio = audioOutputRef.current;
    if (!emu || !audio) return;

    // associate APU sample source with the audio output pipeline
    audio.attach({
      consumeSamples: (frames: number) => emu.consumeAudioSamples(frames),
    });
    emu.setAudioConfig({
      enabled: audioConfig.enabled,
      muteCh1: !audioConfig.channels.ch1,
      muteCh2: !audioConfig.channels.ch2,
      muteCh3: !audioConfig.channels.ch3,
      muteCh4: !audioConfig.channels.ch4,
    });
    audio.setEnabled(audioConfig.enabled);

    try {
      await audio.start();
    } catch (error) {
      console.error("Audio start failed", error);
      toast.error("Audio failed to start", {
        description: String(error),
        className: "bg-gray-100! text-gray-700! border-gray-300!",
        descriptionClassName: "text-gray-700!",
        duration: 10000,
      });
    }
  }, [audioConfig]);

  // stop audio output when component unmounts but I don't think it's needed
  useEffect(() => {
    return () => {
      audioOutputRef.current?.stop();
    };
  }, []);

  // Register physical input devices (keyboard + gamepad) within InputManager. Key and gamepad button mappings are now handled by each InputDevice. This is so that now theres a single source for the input state.
  // InputManager now calls GBCEmulator.pressButton and GBCEmulator.releaseButton, and polls the physical input devices every frame to update the input state.
  useEffect(() => {
    const inputManager = inputManagerRef.current;
    const keyboard = keyboardInputRef.current;
    if (!inputManager || !keyboard) return;

    const gamepad = new GamepadInput({
      onL2Down: () => {
        const saveState = saveStateHandlerRef.current;
        if (saveState) void saveState(1);
      },
      onR2Down: () => {
        const loadState = loadStateHandlerRef.current;
        if (loadState) void loadState(1);
      },
    });

    keyboard.start();
    inputManager.addDevice(keyboard);
    inputManager.addDevice(gamepad);

    return () => {
      keyboard.stop();
      inputManager.removeDevice(keyboard);
      inputManager.removeDevice(gamepad);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const emu = emulatorRef.current;
      if (!emu) return;
      if (emu.hasRTC()) saveRTC(emu);
      if (!emu.hasSRAMBeenWrittenTo()) return;
      saveSRAM(emu);
      emu.clearSRAMWriteFlag();
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const handleSRAMSave = () => {
    saveMemory();
  };

  const handleButtonDown = (button: JoypadButton) => {
    const emu = emulatorRef.current;
    if (!emu) return;
    emu.pressButton(button);
  };

  const handleButtonUp = (button: JoypadButton) => {
    const emu = emulatorRef.current;
    if (!emu) return;
    emu.releaseButton(button);
  };

  const handleLoadROM = async (file: File) => {
    const emu = emulatorRef.current;
    if (!emu) return;

    void ensureAudioStarted();
    saveMemory();
    const ok = await emu.loadROM(file);

    if (ok) {
      loadSRAM();
      loadRTC();

      setIsLoaded(ok);
      setSpeedMultiplier(emu.getSpeedMultiplier());
      refreshSlotInfo();
      emu.start();
      setIsRunning(true);

      await ensureAudioStarted();
    } else {
      const errorMessage = emu.getErrorMessage();

      toast.error("Game not supported yet :(", {
        description: errorMessage,
        className: "bg-gray-100! text-gray-700! border-gray-300!",
        descriptionClassName: "text-gray-700!",
        duration: 10000,
      });
    }
  };

  const handleStart = () => {
    const emu = emulatorRef.current;
    if (!emu || !isLoaded) return;
    emu.start();
    setIsRunning(true);

    void ensureAudioStarted();
  };

  const handlePause = () => {
    const emu = emulatorRef.current;
    if (!emu) return;
    emu.pause();
    setIsRunning(!emu.isPaused());

    if (emu.isPaused()) {
      audioOutputRef.current?.setEnabled(false);
    } else {
      audioOutputRef.current?.setEnabled(true);
      void ensureAudioStarted();
    }
  };

  const handleReset = () => {
    const emu = emulatorRef.current;
    if (!emu) return;
    saveSRAM(emu);
    if (emu.hasRTC()) saveRTC(emu);

    audioOutputRef.current?.stop();
    emu.reset();
    if (isLoaded) {
      emu.start();
      setIsRunning(true);

      void ensureAudioStarted();
    } else {
      setIsRunning(false);
    }
  };

  const handleStep = () => {
    const emu = emulatorRef.current;
    if (!emu || !isLoaded) return;
    emu.stepInstruction();
  };

  const handleStepFrame = () => {
    const emu = emulatorRef.current;
    if (!emu || !isLoaded) return;

    const CYCLES_PER_FRAME = 70224;
    const startTicks = emu.getTicks();
    while (emu.getTicks() - startTicks < CYCLES_PER_FRAME) {
      emu.stepInstruction();
    }
  };

  const setEmulatorSpeedMultiplier = useCallback((multiplier: number) => {
    const emu = emulatorRef.current;
    if (!emu) return;
    emu.setSpeedMultiplier(Math.max(1, multiplier));
    setSpeedMultiplier(emu.getSpeedMultiplier());
  }, []);

  const handleIncreaseSpeed = useCallback(() => {
    setEmulatorSpeedMultiplier(speedMultiplier + 0.25);
  }, [setEmulatorSpeedMultiplier, speedMultiplier]);

  const handleDecreaseSpeed = useCallback(() => {
    setEmulatorSpeedMultiplier(Math.max(1, speedMultiplier - 0.25));
  }, [setEmulatorSpeedMultiplier, speedMultiplier]);

  const toggleAudioEnabled = useCallback(() => {
    setAudioConfig((prev) => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  const toggleAudioChannel = useCallback(
    (channel: "ch1" | "ch2" | "ch3" | "ch4") => {
      setAudioConfig((prev) => ({
        ...prev,
        channels: {
          ...prev.channels,
          [channel]: !prev.channels[channel],
        },
      }));
    },
    [],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      if (event.code === "KeyR") {
        event.preventDefault();
        const saveState = saveStateHandlerRef.current;
        if (saveState) void saveState(1);
        return;
      }

      if (event.code === "KeyT") {
        event.preventDefault();
        const loadState = loadStateHandlerRef.current;
        if (loadState) void loadState(1);
        return;
      }

      if (event.code === "KeyP") {
        const emu = emulatorRef.current;
        if (!emu) return;

        event.preventDefault();
        if (emu.isCGBMode()) {
          const currentIndex =
            CGB_COLOR_PALETTE_OPTIONS.indexOf(cgbColorPalette);
          const nextPalette =
            CGB_COLOR_PALETTE_OPTIONS[
              (currentIndex + 1) % CGB_COLOR_PALETTE_OPTIONS.length
            ];

          if (nextPalette) {
            setCgbColorPalette(nextPalette);
            emu.setCGBColorPalette(nextPalette);
          }
        } else {
          const currentIndex =
            DMG_COLOR_PALETTE_OPTIONS.indexOf(dmgColorPalette);
          const nextPalette =
            DMG_COLOR_PALETTE_OPTIONS[
              (currentIndex + 1) % DMG_COLOR_PALETTE_OPTIONS.length
            ];

          if (nextPalette) {
            setDisplayPalette(nextPalette);
            emu.setDMGColorPalette(nextPalette);
          }
        }
        return;
      }

      if (event.key === "+" || event.code === "KeyW") {
        event.preventDefault();
        handleIncreaseSpeed();
        return;
      }

      if (event.key === "-" || event.code === "KeyQ") {
        event.preventDefault();
        handleDecreaseSpeed();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cgbColorPalette,
    dmgColorPalette,
    emulatorRef,
    handleDecreaseSpeed,
    handleIncreaseSpeed,
    setCgbColorPalette,
    setDisplayPalette,
  ]);

  const [slotInfo, setSlotInfo] = useState<SlotInfo[]>([]);

  const refreshSlotInfo = useCallback(async () => {
    const emu = emulatorRef.current;
    if (!emu) return;
    const key = emu.getSaveStateKey();
    if (!key) {
      setSlotInfo([]);
      return;
    }
    setSlotInfo(await getSaveStateSlotInfo(key));
  }, []);

  // Refresh slot info when a ROM is loaded
  useEffect(() => {
    if (isLoaded) refreshSlotInfo();
  }, [isLoaded, refreshSlotInfo, emulatorRef]);

  const handleSaveState = useCallback(
    async (slot: number) => {
      const emu = emulatorRef.current;
      if (!emu || !isLoaded) return;

      const baseKey = emu.getSaveStateKey();
      if (!baseKey) return;

      try {
        const snapshot = emu.takeSnapshot();
        const header = emu.getCartridgeHeader();

        await saveSaveState(baseKey, slot, snapshot, {
          title: header?.title ?? "",
          cartridgeType: header?.cartridgeType ?? 0,
          globalChecksum: header?.globalChecksum ?? 0,
        });

        await refreshSlotInfo();
        pixelToast(`State saved to slot ${slot}`);
      } catch (error) {
        console.error("Failed to save state", error);

        toast.error("Failed to save state", {
          description: String(error),
          className: "bg-gray-100! text-gray-700! border-gray-300!",
          descriptionClassName: "text-gray-700!",
          duration: 5000,
        });
      }
    },
    [isLoaded, refreshSlotInfo],
  );

  const handleLoadState = useCallback(
    async (slot: number) => {
      const emu = emulatorRef.current;
      if (!emu || !isLoaded) return;

      const baseKey = emu.getSaveStateKey();
      if (!baseKey) return;

      try {
        const snapshot = await loadSaveState(baseKey, slot);
        if (!snapshot) {
          pixelToast(`No save state found in slot ${slot}`);
          return;
        }

        // RESET audio output to avoid issues with the APU state being out of sync with the audio output pipeline after restoring a snapshot
        audioOutputRef.current?.stop();
        emu.restoreSnapshot(snapshot);
        setIsRunning(true);
        await ensureAudioStarted();

        pixelToast(`State loaded from slot ${slot}`);
      } catch (error) {
        console.error("Failed to load state", error);

        toast.error("Failed to load state", {
          description: String(error),
          className: "bg-gray-100! text-gray-700! border-gray-300!",
          descriptionClassName: "text-gray-700!",
          duration: 5000,
        });
      }
    },
    [isLoaded, ensureAudioStarted],
  );

  saveStateHandlerRef.current = handleSaveState;
  loadStateHandlerRef.current = handleLoadState;

  const handleDeleteAllSaveStates = useCallback(async () => {
    await deleteAllSaveStates();
    await refreshSlotInfo();
    pixelToast("All save states deleted");
  }, [refreshSlotInfo]);

  return {
    emulatorRef,
    isLoaded,
    isRunning,
    speedMultiplier,
    audioEnabled: audioConfig.enabled,
    audioChannels: audioConfig.channels,
    dmgColorPalette,
    cgbColorPalette,
    setDisplayPalette,
    setCgbColorPalette,
    exportSRAMSaves,
    importSRAMSave,
    handleIncreaseSpeed,
    handleDecreaseSpeed,
    toggleAudioEnabled,
    toggleAudioChannel,
    handleSRAMSave,
    handleButtonDown,
    handleButtonUp,
    handleLoadROM,
    handleStart,
    handlePause,
    handleReset,
    handleStep,
    handleStepFrame,
    slotInfo,
    handleSaveState,
    handleLoadState,
    handleDeleteAllSaveStates,
  };
};
