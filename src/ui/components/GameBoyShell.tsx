import type { ReactNode } from "react";

interface GameBoyShellProps {
  children: ReactNode;
}

export const GameBoyShell = ({ children }: GameBoyShellProps) => {
  const handleFullscreen = () => {
    const canvas = document.querySelector(
      ".gb-screen-canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) return;

    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
      return;
    }

    if (canvas.requestFullscreen) {
      canvas.requestFullscreen();
    }
  };

  return (
    <div className="gameboy-shell">
      <div className="gameboy-shell-inner">
        <div className="gameboy-top-ridge">
          <span />
          <span />
          <div className="gameboy-top-ridge-bottom" />
        </div>
        {/* <div className="gameboy-top-ridge-left" />
          <div className="gameboy-top-ridge-right" /> */}
        <div className="gameboy-screen-area">
          <button
            type="button"
            className="gameboy-fullscreen-button"
            onClick={handleFullscreen}
            aria-label="Toggle fullscreen"
          >
            ⤢
          </button>
          <div className="gameboy-screen-header">
            <div className="gameboy-header-stripes">
              <span />
              <span />
            </div>
            <div className="gameboy-header-text">
              DOT MATRIX WITH STEREO SOUND
            </div>
            <div className="gameboy-header-stripes gameboy-header-stripes-right">
              <span />
              <span />
            </div>
          </div>

          <div className="gameboy-screen-shell">
            <div className="gameboy-battery">
              <div className="gameboy-battery-led" />
              <div className="gameboy-battery-label">BATTERY</div>
            </div>

            <div className="gameboy-screen-window">{children}</div>
          </div>
        </div>

        <div className="gameboy-bottom-area">
          <div className="gameboy-controls-row">
            <div className="gameboy-dpad">
              <div className="dpad-vertical">
                <button className="dpad-up">
                  <label>{`^`}</label>
                </button>
                <button className="dpad-down">
                  <label>{`ˇ`}</label>
                </button>
              </div>
              <div className="dpad-horizontal">
                <button className="dpad-left">
                  <label>{`<`}</label>
                </button>
                <button className="dpad-right">
                  <label>{`>`}</label>
                </button>
              </div>
              <div className="dpad-center" />
            </div>

            <div className="gameboy-ab-buttons">
              <div className="gameboy-button gameboy-button-a">
                <label className="a-label">X</label>
                <span>A</span>
              </div>
              <div className="gameboy-button gameboy-button-b">
                <label className="b-label">Z</label>
                <span>B</span>
              </div>
            </div>
          </div>

          <div className="gameboy-middle-row">
            <div className="gameboy-select-start">
              <div className="gameboy-pill gameboy-pill-select">
                <label>Shift</label>
                <span>SELECT</span>
              </div>
              <div className="gameboy-pill gameboy-pill-start">
                <label>Enter</label>
                <span>START</span>
              </div>
            </div>

            <div className="gameboy-speaker">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
