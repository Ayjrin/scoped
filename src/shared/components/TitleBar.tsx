import { getCurrentWindow } from '@tauri-apps/api/window';
import logo from "@/assets/logo.svg";

export function TitleBar() {
  const handleMinimize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch (error) {
      console.error('Failed to minimize:', error);
    }
  };

  const handleClose = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (error) {
      console.error('Failed to close:', error);
    }
  };

  return (
    <div className="title-bar">
      <div className="title-bar-drag">
        {/* Logo */}
        <div className="title-bar-logo">
            <img src={logo} width={18} height={18} draggable={false} />
        </div>
        <span className="title-bar-title">Scoped</span>
      </div>

      <div className="title-bar-controls">
        <button
          onClick={handleMinimize}
          className="title-bar-btn title-bar-btn-minimize"
          aria-label="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="title-bar-btn title-bar-btn-close"
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
